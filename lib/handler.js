const config = require("../config/config");
const db = require("../database/db");
const generalCommands = require("../commands/general");
const groupCommands = require("../commands/group");
const moderationCommands = require("../commands/moderation");
const mediaCommands = require("../commands/media");
const funCommands = require("../commands/fun");
const { getMessageText, resolveTargetJids } = require("./helpers");

const allCommands = {
  ...generalCommands,
  ...groupCommands,
  ...moderationCommands,
  ...mediaCommands,
  ...funCommands,
};

// In-memory cache of recent messages, used by .antidelete / .antidel2
// to know what a deleted message used to contain.
const recentMessages = new Map(); // key: `${chatJid}:${msgId}` -> { text, sender, media }

// In-memory spam tracker: jid -> array of timestamps
const spamTracker = new Map();

function isOwnerJid(jid) {
  const number = jid?.split("@")[0]?.split(":")[0];
  return number === config.ownerNumber;
}

function getEffectivePrefix(groupJid) {
  if (!groupJid) return config.prefix;
  const settings = db.getGroupSettings(groupJid);
  return settings.prefix || config.prefix;
}

function getEffectiveBotMode() {
  return db.getBotMode() || config.defaultBotMode;
}

/**
 * Attaches all event listeners to a connected Baileys socket.
 */
function attachHandlers(sock) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    try {
      await handleMessage(sock, msg);
    } catch (err) {
      console.error("Erreur lors du traitement du message :", err);
    }
  });

  // Group participant changes -> welcome / goodbye messages
  sock.ev.on("group-participants.update", async (event) => {
    try {
      await handleParticipantsUpdate(sock, event);
    } catch (err) {
      console.error("Erreur group-participants.update :", err);
    }
  });

  // Message deletions -> antidelete / antidel2
  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      const isDeleted = update.update?.message === null || update.update?.messageStubType === 1;
      if (!isDeleted) continue;
      try {
        await handleDeletedMessage(sock, update);
      } catch (err) {
        console.error("Erreur messages.update (antidelete) :", err);
      }
    }
  });
}

async function handleMessage(sock, msg) {
  const from = msg.key.remoteJid;
  const isGroup = from.endsWith("@g.us");
  const sender = isGroup ? msg.key.participant : from;
  const text = getMessageText(msg.message);

  // Cache this message for potential antidelete use later.
  recentMessages.set(`${from}:${msg.key.id}`, {
    text,
    sender,
    timestamp: Date.now(),
  });
  // Keep the cache from growing forever.
  if (recentMessages.size > 2000) {
    const oldestKey = recentMessages.keys().next().value;
    recentMessages.delete(oldestKey);
  }

  if (isGroup) {
    db.incrementMessageCount(from, sender);
    await runGroupModeration(sock, msg, from, sender, text);
  }

  const prefix = getEffectivePrefix(isGroup ? from : null);
  if (!text.startsWith(prefix)) return;

  const withoutPrefix = text.slice(prefix.length).trim();
  const [commandNameRaw, ...args] = withoutPrefix.split(/\s+/);
  const commandName = commandNameRaw?.toLowerCase();
  if (!commandName || !allCommands[commandName]) return;

  const isOwner = isOwnerJid(sender);
  const botMode = getEffectiveBotMode();
  if (botMode === "private" && !isOwner) return; // silently ignore non-owners in private mode

  let isSenderAdmin = false;
  let isBotAdmin = false;
  if (isGroup) {
    try {
      const metadata = await sock.groupMetadata(from);
      const senderInfo = metadata.participants.find((p) => p.id === sender);
      const botInfo = metadata.participants.find((p) => p.id === sock.user.id.split(":")[0] + "@s.whatsapp.net");
      isSenderAdmin = Boolean(senderInfo?.admin) || isOwner;
      isBotAdmin = Boolean(botInfo?.admin);
    } catch (e) {
      // ignore, defaults stay false
    }
  }

  const ctx = {
    sock,
    msg,
    from,
    sender,
    isGroup,
    args,
    text,
    prefix,
    isOwner,
    isSenderAdmin,
    isBotAdmin,
    botMode,
    targets: resolveTargetJids(msg, args),
    reply: (content) => sock.sendMessage(from, { text: content }, { quoted: msg }),
  };

  await allCommands[commandName](ctx);
}

/**
 * Runs antilink / antitag / antispam / antimedia checks on a group message.
 * Deletes the offending message and warns the sender (admins are exempt).
 */
async function runGroupModeration(sock, msg, from, sender, text) {
  const settings = db.getGroupSettings(from);
  if (!settings.antilink && !settings.antitag && !settings.antispam && !settings.antimedia) return;

  // Don't moderate admins.
  let senderIsAdmin = false;
  try {
    const metadata = await sock.groupMetadata(from);
    senderIsAdmin = Boolean(metadata.participants.find((p) => p.id === sender)?.admin);
  } catch (e) {}
  if (senderIsAdmin) return;

  const moderation = require("../commands/moderation");

  if (settings.antilink && moderation.containsLink(text)) {
    await deleteAndWarn(sock, from, msg, sender, "🔗 Les liens ne sont pas autorisés ici.");
    return;
  }

  const mentionedCount = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length || 0;
  if (settings.antitag && moderation.isMassTag(mentionedCount)) {
    await deleteAndWarn(sock, from, msg, sender, "🚫 Mention de masse non autorisée.");
    return;
  }

  if (settings.antimedia) {
    const hasMedia = Boolean(
      msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.stickerMessage
    );
    if (hasMedia) {
      await deleteAndWarn(sock, from, msg, sender, "🖼️ Les médias ne sont pas autorisés ici.");
      return;
    }
  }

  if (settings.antispam) {
    const now = Date.now();
    const key = `${from}:${sender}`;
    const timestamps = (spamTracker.get(key) || []).filter((t) => now - t < 10000);
    timestamps.push(now);
    spamTracker.set(key, timestamps);
    if (timestamps.length > 5) {
      await deleteAndWarn(sock, from, msg, sender, "⏱️ Pas si vite ! Évite le spam.");
    }
  }
}

async function deleteAndWarn(sock, from, msg, sender, reason) {
  try {
    await sock.sendMessage(from, { delete: msg.key });
  } catch (e) {
    // Bot might not be admin; can't delete, just warn instead.
  }
  await sock.sendMessage(from, {
    text: `@${sender.split("@")[0]} ${reason}`,
    mentions: [sender],
  });
}

async function handleParticipantsUpdate(sock, event) {
  const { id: groupJid, participants, action } = event;
  const settings = db.getGroupSettings(groupJid);
  const metadata = await sock.groupMetadata(groupJid);

  if (action === "add" && settings.welcome) {
    for (const jid of participants) {
      await sock.sendMessage(groupJid, {
        text: `👋 Bienvenue @${jid.split("@")[0]} dans *${metadata.subject}* !`,
        mentions: [jid],
      });
    }
  }

  if (action === "remove" && settings.goodbye) {
    for (const jid of participants) {
      await sock.sendMessage(groupJid, {
        text: `👋 @${jid.split("@")[0]} a quitté *${metadata.subject}*. Au revoir !`,
        mentions: [jid],
      });
    }
  }
}

async function handleDeletedMessage(sock, update) {
  const from = update.key.remoteJid;
  const isGroup = from?.endsWith("@g.us");
  if (!isGroup) return;

  const settings = db.getGroupSettings(from);
  if (!settings.antidelete && !settings.antidelete2) return;

  const cached = recentMessages.get(`${from}:${update.key.id}`);
  if (!cached || !cached.text) return;

  const senderTag = cached.sender ? `@${cached.sender.split("@")[0]}` : "Quelqu'un";

  if (settings.antidelete) {
    await sock.sendMessage(from, {
      text: `🗑️ Message supprimé par ${senderTag} :\n\n"${cached.text}"`,
      mentions: cached.sender ? [cached.sender] : [],
    });
  }

  if (settings.antidelete2) {
    const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
    await sock.sendMessage(ownerJid, {
      text: `🗑️ Message supprimé dans un groupe par ${cached.sender}:\n\n"${cached.text}"`,
    });
  }
}

module.exports = { attachHandlers };