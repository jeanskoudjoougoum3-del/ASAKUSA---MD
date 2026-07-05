const db = require("../database/db");

function requireGroupAdmin(ctx) {
  if (!ctx.isGroup) {
    ctx.reply("⚠️ Cette commande ne fonctionne que dans un groupe.");
    return false;
  }
  if (!ctx.isSenderAdmin) {
    ctx.reply("⚠️ Seuls les admins peuvent utiliser cette commande.");
    return false;
  }
  return true;
}

function toggleCommand(settingKey, label) {
  return async (ctx) => {
    if (!requireGroupAdmin(ctx)) return;
    const state = ctx.args[0]?.toLowerCase();
    if (!["on", "off"].includes(state)) {
      return ctx.reply(`Utilisation : ${ctx.prefix}${settingKey} on|off`);
    }
    db.updateGroupSettings(ctx.from, { [settingKey]: state === "on" });
    await ctx.reply(`✅ ${label} : ${state === "on" ? "activé" : "désactivé"}.`);
  };
}

module.exports = {
  antilink: toggleCommand("antilink", "Anti-lien"),
  antitag: toggleCommand("antitag", "Anti-mention de masse"),
  antispam: toggleCommand("antispam", "Anti-spam"),
  antimedia: toggleCommand("antimedia", "Anti-média"),

  // antidelete: re-sends deleted messages in the same group chat
  antidelete: toggleCommand("antidelete", "Anti-suppression (groupe)"),

  // antidel2: forwards deleted messages to the bot owner's DM instead
  antidel2: toggleCommand("antidelete2", "Anti-suppression (DM au propriétaire)"),

  // --- Detection helpers used by the event handler, not commands themselves ---

  /**
   * Returns true if the text contains a WhatsApp invite link or a generic URL.
   */
  containsLink(text = "") {
    return /(chat\.whatsapp\.com\/|https?:\/\/)/i.test(text);
  },

  /**
   * Returns true if a message mentions an unusually large number of people
   * (likely spam/mass-tag from a non-admin).
   */
  isMassTag(mentionedJidCount = 0, threshold = 8) {
    return mentionedJidCount >= threshold;
  },
};