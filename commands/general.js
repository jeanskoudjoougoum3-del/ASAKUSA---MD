const config = require("../config/config");
const { formatUptime } = require("../lib/helpers");

const startedAt = Date.now();

/**
 * Builds the custom-styled command menu (header style adapted from the
 * one provided, but redesigned).
 */
function buildMenuText(ctx) {
  const { prefix } = ctx;
  const categories = {
    "✨ GÉNÉRAL": ["alive", "ping", "uptime", "menu", "owner"],
    "🛡️ GROUPE": [
      "add", "kick", "kickall", "promote", "promoteall", "demote", "demoteall",
      "tagall", "hidetag", "groupinfo", "groupmode", "setmode", "resetlink",
      "mute", "unmute", "setprefix", "topmember", "welcome", "goodbye",
    ],
    "🚫 MODÉRATION": ["antilink", "antitag", "antispam", "antimedia", "antidelete", "antidel2"],
    "🎨 MÉDIA": [
      "sticker", "sticker2", "take", "img", "tourl", "blur", "fancy", "vv",
      "getpp", "setpp", "song", "pinterest", "ss", "removebg", "realism",
      "character", "gstatus",
    ],
    "🎲 FUN": ["react", "ship", "trivia"],
  };

  let body = "";
  body += "╭━━❑ *『 " + config.menuTitle.toUpperCase() + " 』* ❑━━\n";
  body += `┃➢ *PREFIX* : \`${prefix}\`\n`;
  body += `┃➢ *MODE* : ${ctx.botMode}\n`;
  body += `┃➢ *OWNER* : wa.me/${config.ownerNumber}\n`;
  body += `┃➢ *VERSION* : ${config.version}\n`;
  body += "╰━━━━━━━━━━━━━━━\n\n";

  for (const [label, cmds] of Object.entries(categories)) {
    body += `╭─❑ *${label}* ❑─\n`;
    for (const c of cmds) {
      body += `┃❯ \`${prefix}${c}\`\n`;
    }
    body += "╰━━━━━━━━━━━━━━━\n\n";
  }

  body += `_${config.botName} — by ${config.authorTag}_`;
  return body;
}

module.exports = {
  menu: async (ctx) => {
    const text = buildMenuText(ctx);
    if (config.botImageUrl) {
      await ctx.sock.sendMessage(ctx.from, {
        image: { url: config.botImageUrl },
        caption: text,
      });
    } else {
      await ctx.reply(text);
    }
  },

  alive: async (ctx) => {
    const uptime = formatUptime(process.uptime());
    const caption =
      `✅ *${config.botName}* est en ligne !\n\n⏱️ Uptime : ${uptime}\n📦 Version : ${config.version}\n🔧 Préfixe : ${ctx.prefix}`;

    if (config.botImageUrl) {
      await ctx.sock.sendMessage(ctx.from, {
        image: { url: config.botImageUrl },
        caption,
      });
    } else {
      await ctx.reply(caption);
    }

    if (config.botAudioUrl) {
      await ctx.sock.sendMessage(ctx.from, {
        audio: { url: config.botAudioUrl },
        mimetype: "audio/mp4",
      });
    }
  },

  ping: async (ctx) => {
    const start = Date.now();
    const sent = await ctx.reply("🏓 Ping...");
    const latency = Date.now() - start;
    await ctx.sock.sendMessage(
      ctx.from,
      { text: `🏓 Pong ! ${latency}ms`, edit: sent?.key },
      {}
    );
  },

  uptime: async (ctx) => {
    await ctx.reply(`⏱️ Uptime : ${formatUptime(process.uptime())}`);
  },

  owner: async (ctx) => {
    await ctx.sock.sendMessage(ctx.from, {
      contacts: {
        displayName: config.authorTag,
        contacts: [
          {
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${config.authorTag}\nTEL;type=CELL;type=VOICE;waid=${config.ownerNumber}:+${config.ownerNumber}\nEND:VCARD`,
          },
        ],
      },
    });
  },
};