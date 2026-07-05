const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const config = require("../config/config");
const { downloadMedia, getQuotedMessage, toFancyText } = require("../lib/helpers");

function requireGroup(ctx) {
  if (!ctx.isGroup) {
    ctx.reply("⚠️ Cette commande ne fonctionne que dans un groupe.");
    return false;
  }
  return true;
}

/**
 * Gets the media message to work with: either the message itself
 * (if it's an image/video) or the quoted/replied-to message.
 */
function getTargetMediaMessage(ctx) {
  const direct = ctx.msg.message?.imageMessage || ctx.msg.message?.videoMessage;
  if (direct) return ctx.msg.message;
  const quoted = getQuotedMessage(ctx.msg.message);
  return quoted || null;
}

async function uploadToCatbox(buffer, filename) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", buffer, filename);
  const res = await axios.post("https://catbox.moe/user/api.php", form, {
    headers: form.getHeaders(),
  });
  return res.data; // returns the direct URL as plain text
}

module.exports = {
  sticker: async (ctx) => {
    const target = getTargetMediaMessage(ctx);
    if (!target) return ctx.reply("⚠️ Envoie ou réponds à une image/vidéo avec .sticker");
    const buffer = await downloadMedia({ message: target });
    const sticker = new Sticker(buffer, {
      pack: config.botName,
      author: config.authorTag,
      type: StickerTypes.FULL,
      quality: 70,
    });
    const webpBuffer = await sticker.toBuffer();
    await ctx.sock.sendMessage(ctx.from, { sticker: webpBuffer });
  },

  // sticker2: same as sticker but with a circular/cropped style
  sticker2: async (ctx) => {
    const target = getTargetMediaMessage(ctx);
    if (!target) return ctx.reply("⚠️ Envoie ou réponds à une image/vidéo avec .sticker2");
    const buffer = await downloadMedia({ message: target });
    const sticker = new Sticker(buffer, {
      pack: config.botName,
      author: config.authorTag,
      type: StickerTypes.CROPPED,
      quality: 70,
    });
    const webpBuffer = await sticker.toBuffer();
    await ctx.sock.sendMessage(ctx.from, { sticker: webpBuffer });
  },

  // take: re-brands an existing sticker with the bot's pack/author name
  take: async (ctx) => {
    const quoted = getQuotedMessage(ctx.msg.message);
    const stickerMsg = quoted?.stickerMessage || ctx.msg.message?.stickerMessage;
    if (!stickerMsg) return ctx.reply("⚠️ Réponds à un sticker avec .take");
    const buffer = await downloadMedia({ message: { stickerMessage: stickerMsg } });
    const newPack = ctx.args.join(" ") || config.botName;
    const sticker = new Sticker(buffer, {
      pack: newPack,
      author: config.authorTag,
      type: StickerTypes.FULL,
      quality: 70,
    });
    await ctx.sock.sendMessage(ctx.from, { sticker: await sticker.toBuffer() });
  },

  // img / toimg: converts a sticker back into a normal image
  img: async (ctx) => {
    const quoted = getQuotedMessage(ctx.msg.message);
    const stickerMsg = quoted?.stickerMessage || ctx.msg.message?.stickerMessage;
    if (!stickerMsg) return ctx.reply("⚠️ Réponds à un sticker avec .img");
    const buffer = await downloadMedia({ message: { stickerMessage: stickerMsg } });
    const pngBuffer = await sharp(buffer).png().toBuffer();
    await ctx.sock.sendMessage(ctx.from, { image: pngBuffer });
  },

  tourl: async (ctx) => {
    const target = getTargetMediaMessage(ctx);
    if (!target) return ctx.reply("⚠️ Envoie ou réponds à un média avec .tourl");
    const buffer = await downloadMedia({ message: target });
    try {
      const url = await uploadToCatbox(buffer, "file");
      await ctx.reply(`🔗 ${url}`);
    } catch (e) {
      await ctx.reply("❌ Échec de l'upload, réessaie plus tard.");
    }
  },

  blur: async (ctx) => {
    const target = getTargetMediaMessage(ctx);
    if (!target?.imageMessage) return ctx.reply("⚠️ Envoie ou réponds à une image avec .blur");
    const buffer = await downloadMedia({ message: target });
    const blurred = await sharp(buffer).blur(15).toBuffer();
    await ctx.sock.sendMessage(ctx.from, { image: blurred, caption: "🌫️ Flouté" });
  },

  fancy: async (ctx) => {
    const text = ctx.args.join(" ");
    if (!text) return ctx.reply(`Utilisation : ${ctx.prefix}fancy ton texte`);
    await ctx.reply(toFancyText(text));
  },

  // vv: re-sends a view-once media message as a normal (re-viewable) one
  vv: async (ctx) => {
    const quoted = getQuotedMessage(ctx.msg.message);
    const viewOnce =
      quoted?.viewOnceMessage?.message ||
      quoted?.viewOnceMessageV2?.message ||
      quoted?.viewOnceMessageV2Extension?.message;
    if (!viewOnce) return ctx.reply("⚠️ Réponds à un message 'vue unique' avec .vv");
    const buffer = await downloadMedia({ message: viewOnce });
    const type = viewOnce.imageMessage ? "image" : "video";
    await ctx.sock.sendMessage(ctx.from, { [type]: buffer });
  },

  getpp: async (ctx) => {
    const jid = ctx.targets[0] || ctx.sender;
    try {
      const url = await ctx.sock.profilePictureUrl(jid, "image");
      await ctx.sock.sendMessage(ctx.from, { image: { url } });
    } catch (e) {
      await ctx.reply("❌ Impossible de récupérer la photo de profil (peut-être privée).");
    }
  },

  setpp: async (ctx) => {
    if (!requireGroup(ctx)) return; // setpp on the bot's own account is allowed anywhere too
    const target = getTargetMediaMessage(ctx);
    if (!target?.imageMessage) return ctx.reply("⚠️ Envoie ou réponds à une image avec .setpp");
    const buffer = await downloadMedia({ message: target });
    await ctx.sock.updateProfilePicture(ctx.sock.user.id, buffer);
    await ctx.reply("✅ Photo de profil du bot mise à jour.");
  },

  // song: searches and sends an audio track. Best-effort; depends on
  // yt-search + ytdl-core which can occasionally break if YouTube changes.
  song: async (ctx) => {
    const query = ctx.args.join(" ");
    if (!query) return ctx.reply(`Utilisation : ${ctx.prefix}song nom de la chanson`);
    try {
      const ytSearch = require("yt-search");
      const ytdl = require("@distube/ytdl-core");
      const results = await ytSearch(query);
      const video = results.videos[0];
      if (!video) return ctx.reply("❌ Aucun résultat trouvé.");
      await ctx.reply(`🎵 Téléchargement de : ${video.title}...`);
      const stream = ytdl(video.url, { filter: "audioonly", quality: "highestaudio" });
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      await ctx.sock.sendMessage(ctx.from, {
        audio: buffer,
        mimetype: "audio/mp4",
        fileName: `${video.title}.mp3`,
      });
    } catch (e) {
      await ctx.reply("❌ Échec du téléchargement. Le service YouTube a peut-être changé son fonctionnement.");
    }
  },

  // pinterest: basic scrape of Pinterest search results
  pinterest: async (ctx) => {
    const query = ctx.args.join(" ");
    if (!query) return ctx.reply(`Utilisation : ${ctx.prefix}pinterest chat mignon`);
    try {
      const res = await axios.get(
        `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=/search/pins/?q=${encodeURIComponent(query)}&data=${encodeURIComponent(
          JSON.stringify({ options: { query }, context: {} })
        )}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      const results = res.data?.resource_response?.data?.results || [];
      const images = results.slice(0, 5).map((r) => r.images?.orig?.url).filter(Boolean);
      if (images.length === 0) return ctx.reply("❌ Aucun résultat trouvé.");
      for (const url of images) {
        await ctx.sock.sendMessage(ctx.from, { image: { url } });
      }
    } catch (e) {
      await ctx.reply("❌ Pinterest a bloqué la requête ou changé son API. Réessaie plus tard.");
    }
  },

  // ss: website screenshot via microlink.io (no API key needed, rate-limited)
  ss: async (ctx) => {
    const url = ctx.args[0];
    if (!url || !/^https?:\/\//.test(url)) {
      return ctx.reply(`Utilisation : ${ctx.prefix}ss https://example.com`);
    }
    try {
      const res = await axios.get("https://api.microlink.io", {
        params: { url, screenshot: true, meta: false },
      });
      const shotUrl = res.data?.data?.screenshot?.url;
      if (!shotUrl) return ctx.reply("❌ Échec de la capture.");
      await ctx.sock.sendMessage(ctx.from, { image: { url: shotUrl }, caption: url });
    } catch (e) {
      await ctx.reply("❌ Échec de la capture d'écran.");
    }
  },

  removbg: async (ctx) => {
    if (!config.removeBgApiKey) {
      return ctx.reply(
        "⚠️ Cette commande nécessite une clé API remove.bg.\nAjoute REMOVEBG_API_KEY dans ton .env (clé gratuite sur https://www.remove.bg/api)."
      );
    }
    const target = getTargetMediaMessage(ctx);
    if (!target?.imageMessage) return ctx.reply("⚠️ Envoie ou réponds à une image avec .removbg");
    const buffer = await downloadMedia({ message: target });
    try {
      const form = new FormData();
      form.append("image_file", buffer, "image.jpg");
      form.append("size", "auto");
      const res = await axios.post("https://api.remove.bg/v1.0/removebg", form, {
        headers: { ...form.getHeaders(), "X-Api-Key": config.removeBgApiKey },
        responseType: "arraybuffer",
      });
      await ctx.sock.sendMessage(ctx.from, { image: Buffer.from(res.data) });
    } catch (e) {
      await ctx.reply("❌ Échec de la suppression du fond.");
    }
  },

  // realism: AI image-to-image transformation. Requires an external AI API key.
  realism: async (ctx) => {
    if (!config.aiImageApiKey) {
      return ctx.reply(
        "⚠️ Cette commande nécessite une clé API d'IA image (ex: Stability AI ou Replicate).\nAjoute AI_IMAGE_API_KEY dans ton .env. Dis-moi quel fournisseur tu veux utiliser et je branche l'intégration exacte."
      );
    }
    await ctx.reply("⚠️ Intégration IA à finaliser une fois ton fournisseur choisi (voir message ci-dessus).");
  },

  // character: looks up an anime character via the free Jikan (MyAnimeList) API
  character: async (ctx) => {
    const query = ctx.args.join(" ");
    if (!query) return ctx.reply(`Utilisation : ${ctx.prefix}character Naruto Uzumaki`);
    try {
      const res = await axios.get(
        `https://api.jikan.moe/v4/characters?q=${encodeURIComponent(query)}&limit=1`
      );
      const character = res.data?.data?.[0];
      if (!character) return ctx.reply("❌ Personnage introuvable.");
      const caption =
        `*${character.name}*\n` +
        `${character.about ? character.about.slice(0, 500) : "Pas de description."}`;
      await ctx.sock.sendMessage(ctx.from, {
        image: { url: character.images.jpg.image_url },
        caption,
      });
    } catch (e) {
      await ctx.reply("❌ Erreur lors de la recherche du personnage.");
    }
  },

  // gstatus: posts an image/video to the bot account's WhatsApp Status
  gstatus: async (ctx) => {
    const target = getTargetMediaMessage(ctx);
    if (!target) return ctx.reply("⚠️ Envoie ou réponds à une image/vidéo avec .gstatus");
    const buffer = await downloadMedia({ message: target });
    const type = target.imageMessage ? "image" : "video";
    await ctx.sock.sendMessage("status@broadcast", {
      [type]: buffer,
      caption: ctx.args.join(" ") || "",
    });
    await ctx.reply("✅ Publié en story.");
  },
};