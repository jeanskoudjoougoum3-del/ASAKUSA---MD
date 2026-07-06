const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const readline = require("readline");
const path = require("path");
const config = require("../config/config");

const SESSION_DIR = path.join(__dirname, "..", "session");

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

/**
 * Sends the bot's welcome image + audio to the owner, and sets it
 * as the bot's own profile picture. Runs once per successful connection.
 */
async function sendConnectionGreeting(sock) {
  const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;

  if (config.botImageUrl) {
    try {
      await sock.updateProfilePicture(sock.user.id, { url: config.botImageUrl });
    } catch (err) {
      console.error("Impossible de mettre à jour la photo de profil :", err.message);
    }

    try {
      await sock.sendMessage(ownerJid, {
        image: { url: config.botImageUrl },
        caption: `✅ *${config.botName}* est maintenant connecté et prêt !`,
      });
    } catch (err) {
      console.error("Impossible d'envoyer l'image de connexion :", err.message);
    }
  }

  if (config.botAudioUrl) {
    try {
      await sock.sendMessage(ownerJid, {
        audio: { url: config.botAudioUrl },
        mimetype: "audio/mp4",
      });
    } catch (err) {
      console.error("Impossible d'envoyer l'audio de connexion :", err.message);
    }
  }
}

/**
 * Starts (or restarts, on disconnect) the WhatsApp socket.
 * Logs in using a PAIRING CODE (not a QR code), as requested.
 *
 * @param {(sock) => void} onReady - called once with the connected socket,
 *   used to attach message/event handlers from outside this module.
 */
async function startSocket(onReady) {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // we use pairing code instead
    browser: Browsers.ubuntu(config.botName),
    logger: pino({ level: "silent" }),
  });

  // If this session isn't registered yet, request a pairing code.
  if (!sock.authState.creds.registered) {
    let phoneNumber = config.pairingNumber;

    if (!phoneNumber) {
      phoneNumber = await ask(
        "Entrez le numéro WhatsApp à connecter (avec indicatif, sans +) : "
      );
    }

    // Small delay so the socket is fully initialized before requesting the code.
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        const formatted = code.match(/.{1,4}/g)?.join("-") || code;
        console.log("\n========================================");
        console.log(`  CODE DE PARRAINAGE : ${formatted}`);
        console.log("  Va dans WhatsApp > Appareils liés >");
        console.log("  Lier un appareil > Lier avec un numéro");
        console.log("  de téléphone, et entre ce code.");
        console.log("========================================\n");
      } catch (err) {
        console.error("Impossible de générer le code de parrainage :", err.message);
      }
    }, 3000);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log(`✅ ${config.botName} est connecté !`);
      sendConnectionGreeting(sock);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Connexion fermée.", statusCode, "Reconnexion :", shouldReconnect);

      if (shouldReconnect) {
        startSocket(onReady);
      } else {
        console.log(
          "Session déconnectée (logged out). Supprime le dossier /session et relance pour re-générer un code."
        );
      }
    }
  });

  onReady(sock);
  return sock;
}

module.exports = { startSocket };