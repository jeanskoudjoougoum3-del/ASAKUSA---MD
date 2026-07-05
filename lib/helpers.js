const { downloadMediaMessage } = require("@whiskeysockets/baileys");

/**
 * Extracts the plain text body from any Baileys message type.
 */
function getMessageText(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ""
  );
}

/**
 * Returns the quoted message object, if the user replied to something.
 */
function getQuotedMessage(message) {
  const ctx = message?.extendedTextMessage?.contextInfo;
  return ctx?.quotedMessage || null;
}

function getQuotedParticipant(message) {
  const ctx = message?.extendedTextMessage?.contextInfo;
  return ctx?.participant || null;
}

/**
 * Downloads any media message (image/video/sticker/audio) to a Buffer.
 */
async function downloadMedia(msg) {
  return downloadMediaMessage(msg, "buffer", {});
}

/**
 * Builds the list of mentioned JIDs from either an explicit @mention
 * or a replied-to message's author.
 */
function resolveTargetJids(msg, args) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];
  if (mentioned.length) return mentioned;

  if (ctx?.participant) return [ctx.participant];

  // Fallback: try to parse a raw phone number from args, e.g. ".add 22899999999"
  const numberArg = args.find((a) => /^\d{6,15}$/.test(a.replace(/\D/g, "")));
  if (numberArg) return [`${numberArg.replace(/\D/g, "")}@s.whatsapp.net`];

  return [];
}

const FANCY_MAP = {
  a: "𝐚", b: "𝐛", c: "𝐜", d: "𝐝", e: "𝐞", f: "𝐟", g: "𝐠", h: "𝐡", i: "𝐢",
  j: "𝐣", k: "𝐤", l: "𝐥", m: "𝐦", n: "𝐧", o: "𝐨", p: "𝐩", q: "𝐪", r: "𝐫",
  s: "𝐬", t: "𝐭", u: "𝐮", v: "𝐯", w: "𝐰", x: "𝐱", y: "𝐲", z: "𝐳",
  A: "𝐀", B: "𝐁", C: "𝐂", D: "𝐃", E: "𝐄", F: "𝐅", G: "𝐆", H: "𝐇", I: "𝐈",
  J: "𝐉", K: "𝐊", L: "𝐋", M: "𝐌", N: "𝐍", O: "𝐎", P: "𝐏", Q: "𝐐", R: "𝐑",
  S: "𝐒", T: "𝐓", U: "𝐔", V: "𝐕", W: "𝐖", X: "𝐗", Y: "𝐘", Z: "𝐙",
};

function toFancyText(text) {
  return text
    .split("")
    .map((ch) => FANCY_MAP[ch] || ch)
    .join("");
}

/**
 * Formats a duration in seconds into "Xj Xh Xm Xs".
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}j ${h}h ${m}m ${s}s`;
}

module.exports = {
  getMessageText,
  getQuotedMessage,
  getQuotedParticipant,
  downloadMedia,
  resolveTargetJids,
  toFancyText,
  formatUptime,
};