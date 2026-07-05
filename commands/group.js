const config = require("../config/config");
const db = require("../database/db");

function requireGroup(ctx) {
  if (!ctx.isGroup) {
    ctx.reply("⚠️ Cette commande ne fonctionne que dans un groupe.");
    return false;
  }
  return true;
}

function requireGroupAdmin(ctx) {
  if (!ctx.isSenderAdmin) {
    ctx.reply("⚠️ Seuls les admins du groupe peuvent utiliser cette commande.");
    return false;
  }
  return true;
}

function requireBotAdmin(ctx) {
  if (!ctx.isBotAdmin) {
    ctx.reply("⚠️ Je dois être admin du groupe pour faire ça.");
    return false;
  }
  return true;
}

async function getParticipants(ctx) {
  const metadata = await ctx.sock.groupMetadata(ctx.from);
  return metadata.participants;
}

module.exports = {
  add: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    const number = ctx.args[0]?.replace(/\D/g, "");
    if (!number) return ctx.reply(`Utilisation : ${ctx.prefix}add 22899999999`);
    const jid = `${number}@s.whatsapp.net`;
    await ctx.sock.groupParticipantsUpdate(ctx.from, [jid], "add");
    await ctx.reply(`✅ ${number} a été ajouté au groupe.`);
  },

  kick: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    if (ctx.targets.length === 0) {
      return ctx.reply("⚠️ Mentionne ou réponds au membre à exclure.");
    }
    await ctx.sock.groupParticipantsUpdate(ctx.from, ctx.targets, "remove");
    await ctx.reply("✅ Membre(s) exclu(s).");
  },

  kickall: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    const participants = await getParticipants(ctx);
    const targets = participants
      .filter((p) => !p.admin && p.id !== ctx.sock.user.id)
      .map((p) => p.id);
    if (targets.length === 0) return ctx.reply("Aucun membre non-admin à exclure.");
    await ctx.reply(`⏳ Exclusion de ${targets.length} membres...`);
    for (const jid of targets) {
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.from, [jid], "remove");
      } catch (e) {
        // continue even if one fails
      }
    }
    await ctx.reply("✅ Terminé.");
  },

  promote: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    if (ctx.targets.length === 0) return ctx.reply("⚠️ Mentionne ou réponds au membre à promouvoir.");
    await ctx.sock.groupParticipantsUpdate(ctx.from, ctx.targets, "promote");
    await ctx.reply("✅ Promu(s) admin.");
  },

  promoteall: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    const participants = await getParticipants(ctx);
    const targets = participants.filter((p) => !p.admin).map((p) => p.id);
    if (targets.length === 0) return ctx.reply("Tout le monde est déjà admin.");
    await ctx.reply(`⏳ Promotion de ${targets.length} membres...`);
    for (const jid of targets) {
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.from, [jid], "promote");
      } catch (e) {}
    }
    await ctx.reply("✅ Terminé.");
  },

  demote: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    if (ctx.targets.length === 0) return ctx.reply("⚠️ Mentionne ou réponds à l'admin à rétrograder.");
    await ctx.sock.groupParticipantsUpdate(ctx.from, ctx.targets, "demote");
    await ctx.reply("✅ Rétrogradé(s).");
  },

  demoteall: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    const participants = await getParticipants(ctx);
    const targets = participants
      .filter((p) => p.admin && p.id !== ctx.sock.user.id)
      .map((p) => p.id);
    if (targets.length === 0) return ctx.reply("Aucun admin à rétrograder.");
    await ctx.reply(`⏳ Rétrogradation de ${targets.length} admins...`);
    for (const jid of targets) {
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.from, [jid], "demote");
      } catch (e) {}
    }
    await ctx.reply("✅ Terminé.");
  },

  tagall: async (ctx) => {
    if (!requireGroup(ctx)) return;
    const participants = await getParticipants(ctx);
    const mentions = participants.map((p) => p.id);
    const text = ctx.args.join(" ") || "Attention à tous !";
    const list = participants.map((p) => `• @${p.id.split("@")[0]}`).join("\n");
    await ctx.sock.sendMessage(ctx.from, {
      text: `📢 ${text}\n\n${list}`,
      mentions,
    });
  },

  hidetag: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx)) return;
    const participants = await getParticipants(ctx);
    const mentions = participants.map((p) => p.id);
    const text = ctx.args.join(" ") || ".";
    await ctx.sock.sendMessage(ctx.from, { text, mentions });
  },

  groupinfo: async (ctx) => {
    if (!requireGroup(ctx)) return;
    const metadata = await ctx.sock.groupMetadata(ctx.from);
    const admins = metadata.participants.filter((p) => p.admin).length;
    await ctx.reply(
      `*${metadata.subject}*\n\n` +
        `👥 Membres : ${metadata.participants.length}\n` +
        `🛡️ Admins : ${admins}\n` +
        `📝 Description : ${metadata.desc || "Aucune"}\n` +
        `🆔 ID : ${metadata.id}`
    );
  },

  groupmode: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    const mode = ctx.args[0]?.toLowerCase();
    if (!["open", "close"].includes(mode)) {
      return ctx.reply(`Utilisation : ${ctx.prefix}groupmode open|close`);
    }
    await ctx.sock.groupSettingUpdate(
      ctx.from,
      mode === "close" ? "announcement" : "not_announcement"
    );
    db.updateGroupSettings(ctx.from, { groupMode: mode });
    await ctx.reply(
      mode === "close"
        ? "🔒 Groupe fermé : seuls les admins peuvent écrire."
        : "🔓 Groupe ouvert : tout le monde peut écrire."
    );
  },

  // setmode controls who can use the BOT (not the group itself): public/private
  setmode: async (ctx) => {
    if (!ctx.isOwner) return ctx.reply("⚠️ Seul le propriétaire peut changer le mode du bot.");
    const mode = ctx.args[0]?.toLowerCase();
    if (!["public", "private"].includes(mode)) {
      return ctx.reply(`Utilisation : ${ctx.prefix}setmode public|private`);
    }
    db.setBotMode(mode);
    await ctx.reply(`✅ Mode du bot réglé sur *${mode}*.`);
  },

  resetlink: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    const newCode = await ctx.sock.groupRevokeInvite(ctx.from);
    await ctx.reply(`🔄 Nouveau lien d'invitation :\nhttps://chat.whatsapp.com/${newCode}`);
  },

  mute: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    await ctx.sock.groupSettingUpdate(ctx.from, "announcement");
    db.updateGroupSettings(ctx.from, { groupMode: "close" });
    await ctx.reply("🔇 Groupe mis en sourdine (admins uniquement).");
  },

  unmute: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx) || !requireBotAdmin(ctx)) return;
    await ctx.sock.groupSettingUpdate(ctx.from, "not_announcement");
    db.updateGroupSettings(ctx.from, { groupMode: "open" });
    await ctx.reply("🔊 Groupe réactivé pour tous.");
  },

  setprefix: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx)) return;
    const newPrefix = ctx.args[0];
    if (!newPrefix || newPrefix.length > 3) {
      return ctx.reply(`Utilisation : ${ctx.prefix}setprefix !`);
    }
    db.updateGroupSettings(ctx.from, { prefix: newPrefix });
    await ctx.reply(`✅ Préfixe de ce groupe réglé sur : ${newPrefix}`);
  },

  topmember: async (ctx) => {
    if (!requireGroup(ctx)) return;
    const top = db.getTopMembers(ctx.from, 10);
    if (top.length === 0) return ctx.reply("Pas encore assez de messages enregistrés.");
    const lines = top
      .map((entry, i) => `${i + 1}. @${entry.jid.split("@")[0]} — ${entry.count} messages`)
      .join("\n");
    await ctx.sock.sendMessage(ctx.from, {
      text: `🏆 *Top membres actifs*\n\n${lines}`,
      mentions: top.map((t) => t.jid),
    });
  },

  welcome: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx)) return;
    const state = ctx.args[0]?.toLowerCase();
    if (!["on", "off"].includes(state)) return ctx.reply(`Utilisation : ${ctx.prefix}welcome on|off`);
    db.updateGroupSettings(ctx.from, { welcome: state === "on" });
    await ctx.reply(`✅ Message de bienvenue : ${state === "on" ? "activé" : "désactivé"}.`);
  },

  goodbye: async (ctx) => {
    if (!requireGroup(ctx) || !requireGroupAdmin(ctx)) return;
    const state = ctx.args[0]?.toLowerCase();
    if (!["on", "off"].includes(state)) return ctx.reply(`Utilisation : ${ctx.prefix}goodbye on|off`);
    db.updateGroupSettings(ctx.from, { goodbye: state === "on" });
    await ctx.reply(`✅ Message d'au revoir : ${state === "on" ? "activé" : "désactivé"}.`);
  },
};