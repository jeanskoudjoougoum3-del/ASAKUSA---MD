const axios = require("axios");
const { getQuotedParticipant } = require("../lib/helpers");

module.exports = {
  react: async (ctx) => {
    const emoji = ctx.args[0];
    if (!emoji) return ctx.reply(`Utilisation : ${ctx.prefix}react 🔥 (en réponse à un message)`);
    const ctxInfo = ctx.msg.message?.extendedTextMessage?.contextInfo;
    if (!ctxInfo?.stanzaId) return ctx.reply("⚠️ Réponds à un message avec .react 🔥");

    await ctx.sock.sendMessage(ctx.from, {
      react: {
        text: emoji,
        key: {
          remoteJid: ctx.from,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant,
        },
      },
    });
  },

  ship: async (ctx) => {
    const quotedParticipant = getQuotedParticipant(ctx.msg.message);
    const mentioned = ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const targets = mentioned.length ? mentioned : quotedParticipant ? [quotedParticipant] : [];

    if (targets.length === 0) {
      return ctx.reply(`Utilisation : ${ctx.prefix}ship @personne1 @personne2`);
    }

    const personA = ctx.sender;
    const personB = targets[0];
    // Deterministic "compatibility" score based on the two JIDs combined.
    const seed = (personA + personB).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const score = seed % 101;

    await ctx.sock.sendMessage(ctx.from, {
      text: `💘 @${personA.split("@")[0]} + @${personB.split("@")[0]} = ${score}% compatibles !`,
      mentions: [personA, personB],
    });
  },

  trivia: async (ctx) => {
    try {
      const res = await axios.get("https://opentdb.com/api.php?amount=1&type=multiple");
      const q = res.data?.results?.[0];
      if (!q) return ctx.reply("❌ Impossible de charger une question.");
      const choices = [...q.incorrect_answers, q.correct_answer]
        .sort(() => Math.random() - 0.5)
        .map((c, i) => `${i + 1}. ${decodeHtml(c)}`)
        .join("\n");
      await ctx.reply(
        `🧠 *Trivia* (${q.category})\n\n${decodeHtml(q.question)}\n\n${choices}\n\n_Réponds avec le numéro !_`
      );
    } catch (e) {
      await ctx.reply("❌ Erreur lors du chargement de la question.");
    }
  },
};

function decodeHtml(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è");
}