require("dotenv").config();

/**
 * Central bot configuration.
 * Edit values here or, better, override them via your .env file.
 */
module.exports = {
  botName: "ASAKUSA MD",
  menuTitle: "ASAKUSA MD",
  authorTag: "BENIX DEV",

  // Default command prefix. Can be changed per-group with .setprefix
  prefix: process.env.PREFIX || ".",

  // Owner's WhatsApp number, digits only, with country code, no "+", no spaces.
  // +228 99 34 49 51  ->  22899344951
  ownerNumber: (process.env.OWNER_NUMBER || "22899344951").replace(/\D/g, ""),

  // "public"  -> anyone can use the bot's commands
  // "private" -> only the owner can use the bot's commands
  defaultBotMode: process.env.BOT_MODE || "public",

  version: process.env.BOT_VERSION || "1.0.0",

  // Login method: Baileys pairing code (NOT QR code), as requested.
  // The number used to pair the bot session itself.
  pairingNumber: (process.env.PAIRING_NUMBER || process.env.OWNER_NUMBER || "22899344951").replace(/\D/g, ""),

  // --- Optional external API keys (only needed for some commands) ---
  removeBgApiKey: process.env.REMOVEBG_API_KEY || null,
  aiImageApiKey: process.env.AI_IMAGE_API_KEY || null, // used by .realism
};