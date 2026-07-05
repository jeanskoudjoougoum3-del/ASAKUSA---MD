const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const FILES = {
  groups: path.join(DATA_DIR, "groups.json"),
  users: path.join(DATA_DIR, "users.json"),
  messageCounts: path.join(DATA_DIR, "message_counts.json"),
};

/**
 * Simple file-based JSON database. No native dependencies, works
 * anywhere without compilation. Swap for a real DB later if needed.
 */

function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function readJSON(filePath, fallback) {
  ensureFile(filePath, fallback);
  return JSON.parse(fs.readFileSync(filePath, "utf-8") || JSON.stringify(fallback));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ---------- Groups settings ----------
// groups.json shape: { [groupJid]: { antilink, antitag, antispam, antimedia,
//   antidelete, welcome, goodbye, mode, prefix, mutedUntil, lastInviteRevokeAt } }

function getGroupSettings(groupJid) {
  const groups = readJSON(FILES.groups, {});
  if (!groups[groupJid]) {
    groups[groupJid] = {
      antilink: false,
      antitag: false,
      antispam: false,
      antimedia: false,
      antidelete: false,
      antidelete2: false,
      welcome: false,
      goodbye: false,
      groupMode: "open", // open | closed (announcement)
      prefix: null, // null = use global default
    };
    writeJSON(FILES.groups, groups);
  }
  return groups[groupJid];
}

function updateGroupSettings(groupJid, partialUpdate) {
  const groups = readJSON(FILES.groups, {});
  const current = groups[groupJid] || getGroupSettings(groupJid);
  groups[groupJid] = { ...current, ...partialUpdate };
  writeJSON(FILES.groups, groups);
  return groups[groupJid];
}

// ---------- Users (bot-wide mode, warnings) ----------

function readUsers() {
  return readJSON(FILES.users, {});
}

function getUser(jid) {
  const users = readUsers();
  return users[jid] || { warnings: 0 };
}

function setUser(jid, data) {
  const users = readUsers();
  users[jid] = { ...(users[jid] || {}), ...data };
  writeJSON(FILES.users, users);
  return users[jid];
}

// ---------- Message counts (for .topmember) ----------

function incrementMessageCount(groupJid, userJid) {
  const counts = readJSON(FILES.messageCounts, {});
  if (!counts[groupJid]) counts[groupJid] = {};
  counts[groupJid][userJid] = (counts[groupJid][userJid] || 0) + 1;
  writeJSON(FILES.messageCounts, counts);
}

function getTopMembers(groupJid, limit = 10) {
  const counts = readJSON(FILES.messageCounts, {});
  const groupCounts = counts[groupJid] || {};
  return Object.entries(groupCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([jid, count]) => ({ jid, count }));
}

// ---------- Bot mode (public/private) ----------

function getBotMode() {
  const users = readJSON(FILES.users, {});
  return users.__botMode || null; // null = use config default
}

function setBotMode(mode) {
  const users = readJSON(FILES.users, {});
  users.__botMode = mode;
  writeJSON(FILES.users, users);
}

module.exports = {
  getGroupSettings,
  updateGroupSettings,
  getUser,
  setUser,
  incrementMessageCount,
  getTopMembers,
  getBotMode,
  setBotMode,
};