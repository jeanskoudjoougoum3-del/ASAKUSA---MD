const config = require("./config/config");
const { startSocket } = require("./lib/connection");
const { attachHandlers } = require("./lib/handler");

console.log(`Démarrage de ${config.botName}...`);

startSocket((sock) => {
  attachHandlers(sock);
});