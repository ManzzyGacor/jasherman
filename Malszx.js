const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const os = require('os');
const axios = require("axios");
const chalk = require("chalk");
const fetch = require("node-fetch");
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const AdmZip = require('adm-zip');
const config = require('./config.js');

const chatSessions = {}; 
const lastMenuMessage = {};
const activeMenus = {};
const autoForwards = {}; 
const userMenuStates = {};
const ceoPages = {};
const ownerPages = {};
const premiumPages = {};
const blacklistPages = {};
let savedButtons = [];

const DATA_FILE = 'data.json';
const IMAGES_DIR = './menu_images';

const BOT_TOKEN = config.BOT_TOKEN;
const OWNER_IDS = config.OWNER_IDS;
const CHANNEL_USERNAME = config.CHANNEL_USERNAME;
const CHANNEL_USERNAME2 = config.CHANNEL_USERNAME2;
const GROUP_USERNAME = config.GROUP_USERNAME;
const CHANNEL_ID = config.CHANNEL_ID;
const CHANNEL_RQ = config.CHANNEL_RQ;
const BOT_LIMIT = config.BOT_LIMIT;
const BOT_JASHER = config.BOT_JASHER;
const DEVELOPER = config.DEVELOPER;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const BOT_START_TIME = Date.now();
const cooldowns = new Map();
const defaultData = {
  premium: {},
  owner: OWNER_IDS,
  groups: [],
  users: [],
  blacklist: [],
  settings: {
    maintenance: false,
    cooldown: { default: 15 }
  }
};

const getUptime = () => {
  const uptimeSeconds = process.uptime();
  
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);
  
  let result = '';
  
  if (days > 0) {
    result += `${days} hari `;
  }
  if (hours > 0) {
    result += `${hours} jam `;
  }
  if (minutes > 0) {
    result += `${minutes} menit `;
  }
  if (seconds > 0 || result === '') {
    result += `${seconds} detik`;
  }
  
  return result.trim();
};

const getHariWaktu = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const waktuIndonesia = new Date(utc + (3600000 * 7));
  
  const hariIndonesia = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const hariIndex = waktuIndonesia.getDay();
  const namaHari = hariIndonesia[hariIndex];
  
  const tanggal = waktuIndonesia.getDate().toString().padStart(2, '0');
  const bulan = (waktuIndonesia.getMonth() + 1).toString().padStart(2, '0');
  const tahun = waktuIndonesia.getFullYear();
  const jam = waktuIndonesia.getHours().toString().padStart(2, '0');
  const menit = waktuIndonesia.getMinutes().toString().padStart(2, '0');
  const detik = waktuIndonesia.getSeconds().toString().padStart(2, '0');
  
  return `${namaHari}, ${tanggal}/${bulan}/${tahun} ${jam}:${menit}:${detik} WIB`;
};

function loadJSON(file) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const raw = fs.readFileSync(file, 'utf8');
    return raw.length ? JSON.parse(raw) : defaultData;
  } catch (e) {
    console.error('loadJSON error:', e);
    return defaultData;
  }
}

function saveJSON(file, data) {
  try {
    if (!data) data = defaultData;
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('saveJSON error:', e);
  }
}

function saveData(data = null) { 
  if (!data) data = usersData;
  saveJSON(DATA_FILE, data); 
}

function loadData() {
  try {
    const file = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(file);
    return {
      ...defaultData,
      ...parsed,
      users: parsed.users || [],
      groups: parsed.groups || [],
      premium: parsed.premium || {},
      blacklist: parsed.blacklist || [],
      owner: parsed.owner || OWNER_IDS,
      settings: {
        ...defaultData.settings,
        ...(parsed.settings || {})
      }
    };
  } catch {
    return defaultData;
  }
}

let usersData = loadJSON(DATA_FILE);

function initializeUser(userId, user = {}) {
  const data = loadData();
  if (!data.users) data.users = [];
  if (!data.users.includes(userId)) {
    data.users.push(userId);
    saveData(data);
  }
  
  usersData = loadData();
  return usersData;
}

function isMainOwner(id) {
  return OWNER_IDS.map(String).includes(String(id));
}

function isAdditionalOwner(id) {
  const data = loadData();
  return Array.isArray(data.owner) && data.owner.map(String).includes(String(id));
}

function isCEO(id) {
  const data = loadData();
  return Array.isArray(data.ceo) && data.ceo.map(String).includes(String(id));
}

function isAnyOwner(id) {
  return isMainOwner(id) || isAdditionalOwner(id) || isCEO(id);
}

function isOwner(id) {
  return isAnyOwner(id);
}

function isPremium(id) {
  const data = loadData();
  const exp = data.premium[id];
  if (!exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec < exp;
}

async function cekAkses(level, msg) {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;
  const nama = msg.from.first_name || "User";

  if (!(await requireNotBlacklisted(msg))) return false;
  if (!(await requireNotMaintenance(msg))) return false;
  if (!(await requireJoin(msg))) return false;

  const isMain = isMainOwner(userId);
  const isCeo = isCEO(userId);
  const isOwn = isAdditionalOwner(userId);
  const isPrem = isPremium(userId);

  async function gagal(pesan) {
    try {
      await bot.sendMessage(chatId, pesan, { parse_mode: "HTML" });
    } catch (e) {}
    return false;
  }

  switch ((level || "").toLowerCase()) {
    case "utama":
      if (!isMain)
        return gagal(`<blockquote>𝗙𝗜𝗧𝗨𝗥 𝗞𝗛𝗨𝗦𝗨𝗦 𝗗𝗘𝗩𝗘𝗟𝗢𝗣𝗘𝗥</blockquote>

⚠️ Fitur ini hanya bisa di akses oleh Developer 
🔐 Fitur ini di kunci demi menjaga kestabilan system

<blockquote>𝐌𝐮𝐥𝐭𝐢 𝐉𝐚𝐬𝐡𝐞𝐫 𝐕𝐯𝐢𝐩</blockquote>`);
      break;

    case "ceo":
      if (!isMain && !isCeo)
        return gagal(`<blockquote>𝗙𝗜𝗧𝗨𝗥 𝗞𝗛𝗨𝗦𝗨𝗦 𝗖𝗘𝗢</blockquote>

⚠️ Fitur ini hanya bisa di akses oleh Ceo 
🔐 Fitur ini di kunci demi menjaga kestabilan system

<blockquote>𝐌𝐮𝐥𝐭𝐢 𝐉𝐚𝐬𝐡𝐞𝐫 𝐕𝐯𝐢𝐩</blockquote>`);
      break;

    case "owner":
      if (!isMain && !isCeo && !isOwn)
        return gagal(`<blockquote>⚙️ <b>Fitur Khusus Owner Bot</b></blockquote>

👋 Hai <b>${nama}</b>
⚙️ Perintah ini hanya untuk Owner Tambahan, CEO, atau Developer.`);
      break;

    case "premium":
      if (!isPrem && !isOwn && !isCeo && !isMain)
        return gagal(`<blockquote>💎 <b>Fitur Khusus Premium</b></blockquote>

👋 Hai <b>${nama}</b>
💎 Fitur ini hanya untuk pengguna Premium atau Owner bot

📌 Tambahkan bot ke minimal 2 grup aktif  
atau hubungi Admin untuk aktivasi Premium.`);
      break;

    default:
      return gagal(`❌ Level akses tidak dikenali: <code>${level}</code>`);
  }

  return true;
}

async function requireNotMaintenance(msg) {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  if (isMaintenance() && !isMainOwner(userId)) {
    await bot.sendMessage(
      chatId,
      `<blockquote>🔧 <b>Maintenance Mode</b></blockquote>

👋 Hai <b>${msg.from.first_name}</b>
🔧 Saat ini bot sedang dalam proses perawatan sistem untuk peningkatan performa dan stabilitas.

📢 <b>Informasi:</b> Hanya Developer yang dapat menggunakan bot sementara waktu.  
⏳ Mohon bersabar, ya — bot akan segera kembali aktif seperti semula.`,
      { parse_mode: "HTML" }
    );
    return false;
  }
  return true;
}

async function requireNotBlacklisted(msg) {
  const userId = msg.from.id.toString();

  if (isBlacklisted(userId)) {
    await bot.sendMessage(
      userId,
      `<blockquote>🚫 <b>Akses Ditolak!</b></blockquote>

👋 Hai <b>${msg.from.first_name}</b>
🚫 Maaf ya, kamu tidak bisa menggunakan bot ini karena terdaftar dalam daftar blacklist.

📞 Jika kamu merasa ini adalah kesalahan atau ingin mengajukan banding,  
silakan hubungi admin melalui menu <b>Hubungi Admin</b> untuk peninjauan ulang.`,
      { parse_mode: "HTML" }
    );
    return false;
  }
  return true;
}

function isMaintenance() {
  const data = loadData();
  return data.settings?.maintenance === true;
}

function setMaintenance(state) {
  const data = loadData();
  if (!data.settings) data.settings = {};
  data.settings.maintenance = state;
  saveData(data);
}

function getGlobalCooldownMinutes() {
  const data = loadData();
  return data.settings?.cooldown?.default || 15;
}

function getGlobalCooldownMs() {
  return getGlobalCooldownMinutes() * 60 * 1000;
}

function isBlacklisted(userId) {
  const data = loadData();
  return Array.isArray(data.blacklist) && data.blacklist.map(String).includes(String(userId));
}

const { writeFileSync, existsSync, mkdirSync } = require('fs');

function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = './backup';
  const backupPath = `${backupDir}/data-${timestamp}.json`;

  if (!existsSync(backupDir)) mkdirSync(backupDir);
  if (!existsSync(DATA_FILE)) return null;
  const content = fs.readFileSync(DATA_FILE);
  writeFileSync(backupPath, content);

  return backupPath;
}

const GROUP_SETTINGS = {
  min_member: 10,
  min_group_count: 1,
  premium_duration_hours: 1,
  cooldown_minutes: 15
};

bot.on("my_chat_member", async (msg) => {
  try {
    const data = loadData();
    const chat = msg.chat || msg.chat_member?.chat;
    const user = msg.from;
    const status = msg.new_chat_member?.status;
    const chatId = chat?.id;
    const userId = user?.id;

    if (!chat || !user || !status || !chatId || !userId) return;

    const isGroup = ["group", "supergroup"].includes(chat.type);
    const mainOwner = OWNER_IDS[0];
    const now = Math.floor(Date.now() / 1000);

    if (!data.groups) data.groups = [];
    if (!data.user_group_count) data.user_group_count = {};
    if (!data.premium) data.premium = {};

    if (["member", "administrator"].includes(status) && isGroup) {
      if (!data.groups.includes(chatId)) data.groups.push(chatId);

      data.user_group_count[userId] = (data.user_group_count[userId] || 0) + 1;

      let memberCount = 0;
      try {
        memberCount = await bot.getChatMemberCount(chatId);
      } catch {
        memberCount = 0;
      }

      if (memberCount >= GROUP_SETTINGS.min_member) {
        const totalGroup = data.user_group_count[userId];
        if (totalGroup >= GROUP_SETTINGS.min_group_count) {
          const durasiDetik = GROUP_SETTINGS.premium_duration_hours * 3600;
          const current = data.premium[userId] || now;
          data.premium[userId] = current > now ? current + durasiDetik : now + durasiDetik;

          await bot.sendMessage(
            userId,
            `<blockquote><b>🎉 PREMIUM AKTIF!</b></blockquote>
<b>Terima kasih sudah menambahkan bot ke ${totalGroup} grup!</b>
<b>Premium aktif selama ${GROUP_SETTINGS.premium_duration_hours} jam!</b>`,
            { parse_mode: "HTML" }
          ).catch(() => {});

          const info = `<blockquote><b>🤖 BOT DITAMBAHKAN KE GRUP BARU!</b></blockquote>
<b>👤 Pengguna:</b> <a href="tg://user?id=${userId}">${user.first_name}</a>
<b>🆔 ID User:</b> <code>${userId}</code>
<b>👥 Name Grup:</b> ${chat.title}
<b>🆔 ID Grup:</b> <code>${chatId}</code>
<b>👥 Member Grup:</b> ${memberCount}
<b>🎁 Reward:</b> ${GROUP_SETTINGS.premium_duration_hours} jam Premium`;

          await bot.sendMessage(mainOwner, info, { parse_mode: "HTML" }).catch(() => {});

          const backupPath = backupData();
          if (backupPath) {
            await bot.sendDocument(mainOwner, backupPath, { caption: "📁 Backup Otomatis" }).catch(() => {});
          }
        } else {
          const needGroups = GROUP_SETTINGS.min_group_count - totalGroup;
          await bot.sendMessage(
            userId,
            `<blockquote><b>ℹ️ INFO PREMIUM</b></blockquote>
<b>Kamu baru menambahkan ${totalGroup} grup.</b>
<b>Minimal ${GROUP_SETTINGS.min_group_count} grup (masing-masing >=${GROUP_SETTINGS.min_member} member) agar Premium aktif.</b>
<b>Butuh ${needGroups} grup lagi!</b>`,
            { parse_mode: "HTML" }
          ).catch(() => {});
        }
      } else {
        await bot.sendMessage(
          userId,
          `<blockquote><b>⚠️ GRUP KECIL</b></blockquote>
<b>Grup "${chat.title}" hanya memiliki ${memberCount} member.</b>
<b>Minimal ${GROUP_SETTINGS.min_member} member agar dihitung untuk premium.</b>`,
          { parse_mode: "HTML" }
        ).catch(() => {});
      }

      saveData(data);
    }

    if (["left", "kicked", "banned", "restricted"].includes(status) && isGroup) {
      if (data.groups.includes(chatId)) {
        data.groups = data.groups.filter((id) => id !== chatId);
        data.user_group_count[userId] = Math.max(0, (data.user_group_count[userId] || 1) - 1);

        if (data.user_group_count[userId] < GROUP_SETTINGS.min_group_count) {
          delete data.premium[userId];
          await bot.sendMessage(
            userId,
            `<blockquote><b>❌ PREMIUM DICABUT</b></blockquote>
<b>Kamu menghapus bot dari grup.</b>
<b>Premium otomatis dicabut.</b>`,
            { parse_mode: "HTML" }
          ).catch(() => {});
        }

        const info = `<blockquote><b>🚫 BOT DIKELUARKAN DARI GRUP!</b></blockquote>
<b>👤 Pengguna:</b> <a href="tg://user?id=${userId}">${user.first_name}</a>
<b>🆔 ID User:</b> <code>${userId}</code>
<b>👥 Name Grup:</b> ${chat.title}
<b>🆔 ID Grup:</b> <code>${chatId}</code>`;

        await bot.sendMessage(mainOwner, info, { parse_mode: "HTML" }).catch(() => {});

        const backupPath = backupData();
        if (backupPath) {
          await bot.sendDocument(mainOwner, backupPath, { caption: "📁 Backup Otomatis" }).catch(() => {});
        }

        saveData(data);
      }
    }
  } catch (err) {
    console.error("Error my_chat_member:", err);
  }
});

setInterval(() => {
  const data = loadData();
  const now = Math.floor(Date.now() / 1000);

  for (const uid in data.premium) {
    if (data.premium[uid] <= now) {
      delete data.premium[uid];
      console.log(`Premium expired & dicabut untuk ${uid}`);

      const channelUsername = CHANNEL_USERNAME ? CHANNEL_USERNAME.replace('@', '') : '';
      const channelUsername2 = CHANNEL_USERNAME2 ? CHANNEL_USERNAME2.replace('@', '') : '';
      const groupUsername = GROUP_USERNAME ? GROUP_USERNAME.replace('@', '') : '';

      const channelButton = [];
      if (channelUsername) {
        channelButton.push({ 
          text: "☊ 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝟭", 
          url: `https://t.me/${channelUsername}`, 
          style: "danger" 
        });
      }
      if (channelUsername2) {
        channelButton.push({ 
          text: "☊ 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝟮", 
          url: `https://t.me/${channelUsername2}`, 
          style: "danger" 
        });
      }

      const groupButton = [];
      if (groupUsername) {
        groupButton.push({
          text: "☊ 𝗚𝗿𝗼𝘂𝗽 𝗥𝗲𝘀𝗺𝗶", 
          url: `https://t.me/${groupUsername}`,
          style: "danger"
        });
      }
      
      bot.sendMessage(uid, `<b>📢 INFORMASI MASA AKTIF</b>

<b>Halo Pengguna Share Bot</b>
<b>Masa aktif Premium kamu telah berakhir dan otomatis dicabut</b>

<b>Untuk memperpanjang, cukup tambahkan bot ke 2 grup baru (>=20 member)
atau hubungi admin untuk aktivasi manual</b>

<i>Terima kasih telah menggunakan Share Bot</i>`, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💎 Perpanjang Premium", url: `https://t.me/${DEVELOPER.replace('@', '')}` }],
            channelButton,
            groupButton
          ].filter(arr => arr.length > 0)
        }
      }).catch(() => {});
      
      saveData(data);
    }
  }
}, 60000);

async function checkChannelMembership(userId) {
  try {
    const targets = [CHANNEL_USERNAME, CHANNEL_USERNAME2, GROUP_USERNAME].filter(Boolean);
    if (!targets.length) return true;

    const results = await Promise.all(
      targets.map(target => bot.getChatMember(target, userId))
    );

    const validStatus = ["member", "administrator", "creator"];
    return results.every(r => validStatus.includes(r.status));
  } catch (err) {
    console.error("Error checking membership:", err.message);
    return false;
  }
}

async function requireJoin(msg) {
  const userId = msg.from.id;

  if (!CHANNEL_USERNAME || !CHANNEL_USERNAME2 || !GROUP_USERNAME) {
    return true;
  }

  const isMember = await checkChannelMembership(userId);

  if (!isMember) {
    const channel1 = CHANNEL_USERNAME.replace('@', '');
    const channel2 = CHANNEL_USERNAME2.replace('@', '');
    const groupLink = GROUP_USERNAME.replace('@', '');

    await bot.sendMessage(
      userId,
      `<blockquote>❌ 𝗔𝗞𝗦𝗘𝗦 𝗗𝗜 𝗧𝗢𝗟𝗔𝗞</blockquote>

Halo Friend @${msg.from.username}.
Sebelum anda memakai bot ini harap untuk mengikuti cara caranya 

<blockquote>♻️ 𝗖𝗔𝗧𝗔𝗧𝗔𝗡</blockquote>
<b>⌦</b> Silahkan join ke channel dan grup resmi kami terlebih dahulu
<b>⌦</b> Jika sudah join silahkan tekan tombol ｢ 𝗦𝘂𝗱𝗮𝗵 𝗚𝗮𝗯𝘂𝗻𝗴? 𝗣𝗲𝗻𝗰𝗲𝘁 𝗶𝗻𝗶 ｣`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "☊ 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝟭", url: `https://t.me/${channel1}`, style : "danger" },
              { text: "☊ 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝟮", url: `https://t.me/${channel2}`, style : "danger" }
            ],
            [
              { text: "☊ 𝗚𝗿𝗼𝘂𝗽 𝗥𝗲𝘀𝗺𝗶", url: `https://t.me/${groupLink}`, style : "danger" }
            ],
            [
              { text: "𝗦𝘂𝗱𝗮𝗵 𝗚𝗮𝗯𝘂𝗻𝗴? 𝗽𝗲𝗻𝗰𝗲𝘁 𝗶𝗻𝗶", callback_data: "check_join_again", style : "success" }
            ]
          ]
        }
      }
    );
    return false;
  }
  return true;
}

function withRequireJoin(handler) {
  return async (msg, match) => {
    const ok = await requireJoin(msg);
    if (!ok) return;
    return handler(msg, match);
  };
}

function getRandomImage() {
  try {
    if (fs.existsSync(IMAGES_DIR)) {
      const files = fs.readdirSync(IMAGES_DIR);
      const imageFiles = files.filter(file => 
        /\.(jpg|jpeg|png|gif)$/i.test(file)
      );
      
      if (imageFiles.length > 0) {
        const randomFile = imageFiles[Math.floor(Math.random() * imageFiles.length)];
        const imagePath = path.join(IMAGES_DIR, randomFile);
        return fs.createReadStream(imagePath);
      }
    }
    
    if (MENU_IMAGES && MENU_IMAGES.length > 0) {
      const randomImage = MENU_IMAGES[Math.floor(Math.random() * MENU_IMAGES.length)];
      return randomImage;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function replaceMenu(chatId, caption, buttons, isCollapsed = false) {
  try {
    if (activeMenus[chatId]) {
      try {
        await bot.deleteMessage(chatId, activeMenus[chatId]);
      } catch (e) {}
      delete activeMenus[chatId];
    }

    const imageStream = getRandomImage();
    
    if (imageStream) {
      try {
        const sent = await bot.sendPhoto(chatId, imageStream, {
          caption: caption,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: buttons
          }
        });
        
        activeMenus[chatId] = sent.message_id;
        userMenuStates[chatId] = isCollapsed ? "collapsed" : "expanded";
        return;
      } catch (error) {
        try {
          if (imageStream.path && fs.existsSync(imageStream.path)) {
            const photoBuffer = fs.readFileSync(imageStream.path);
            const sent = await bot.sendPhoto(chatId, photoBuffer, {
              caption: caption,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: buttons
              }
            });
            
            activeMenus[chatId] = sent.message_id;
            userMenuStates[chatId] = isCollapsed ? "collapsed" : "expanded";
            return;
          }
        } catch (bufferError) {
          const sent = await bot.sendMessage(chatId, caption, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: buttons
            }
          });
          
          activeMenus[chatId] = sent.message_id;
          userMenuStates[chatId] = isCollapsed ? "collapsed" : "expanded";
        }
      }
    } else {
      const sent = await bot.sendMessage(chatId, caption, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: buttons
        }
      });
      
      activeMenus[chatId] = sent.message_id;
      userMenuStates[chatId] = isCollapsed ? "collapsed" : "expanded";
    }
  } catch (err) {
    try {
      const sent = await bot.sendMessage(chatId, caption, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: buttons
        }
      });
      
      activeMenus[chatId] = sent.message_id;
      userMenuStates[chatId] = isCollapsed ? "collapsed" : "expanded";
    } catch (finalError) {}
  }
}

async function editMenu(chatId, messageId, caption, buttons, isCollapsed = false) {
  try {
    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: buttons
      }
    });
    
    userMenuStates[chatId] = isCollapsed ? "collapsed" : "expanded";
  } catch (err) {
    try {
      await bot.editMessageText(caption, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: buttons
        }
      });
    } catch (editTextError) {}
  }
}

bot.onText(/\/start/, withRequireJoin(async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;
  if (!(await requireNotMaintenance(msg))) return;
  
  const data = loadData();
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const waktuRunPanel = getUptime();
  const username = msg.from.username ? `@${msg.from.username}` : "Tidak ada username";
  const firstName = msg.from.first_name || "User";
  
  if ((msg.date * 1000) < BOT_START_TIME) return;
  
  if (!data.users.includes(userId)) {
    data.users.push(userId);
    saveData(data);
  }

  const frames = [
    "▰▱▱▱▱▱▱▱▱▱", 
    "▰▰▱▱▱▱▱▱▱▱", 
    "▰▰▰▱▱▱▱▱▱▱",
    "▰▰▰▰▱▱▱▱▱▱", 
    "▰▰▰▰▰▱▱▱▱▱", 
    "▰▰▰▰▰▰▱▱▱▱",
    "▰▰▰▰▰▰▰▱▱▱", 
    "▰▰▰▰▰▰▰▰▱▱", 
    "▰▰▰▰▰▰▰▰▰▱", 
    "▰▰▰▰▰▰▰▰▰▰"
  ];

  const loadingMsg = await bot.sendMessage(chatId, `<blockquote><b>Loading dulu bosquh</b> 😝</blockquote> \n${frames[0]}`, { parse_mode: 'HTML' });

  for (let i = 1; i < frames.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 300)); 
    
    await bot.editMessageText(`<blockquote><b>Loading dulu bosquh</b> 😝</blockquote> \n${frames[i]}`, {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'HTML'
    }).catch(() => {});
  }

  await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

  const caption = `
<blockquote>𝙈𝙖𝙣𝙯𝙯𝙮 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥 𝗩𝗩𝗜𝗣</blockquote>
─────────────────────
<blockquote>｢ 𝗗𝗔𝗧𝗔 ☇ 𝗕𝗢𝗧 ｣</blockquote>
───
‎│◆ Developer : ${DEVELOPER}
‎│◆ Version : 2.0
‎│◆ Name Bot : Multi ☇ Jasher
‎│◆ Type Script : Vvip Only
───
<blockquote>｢ 𝗦𝗧𝗔𝗧𝗜𝗦𝗧𝗜𝗖 ☇ 𝗕𝗢𝗧 ｣</blockquote>
───
‎│◆ Group : ${data.groups.length}
‎│◆ User   : ${data.users.length}
‎│◆ Uptime : ${waktuRunPanel}
‎│◆ Hari   : ${getHariWaktu()}
───
─────────────────────
<blockquote>𝗦𝗲𝗹𝗮𝗺𝗮𝘁 𝗠𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗸𝗮𝗻 ${username}</blockquote>`;

  const buttons = [
    [
{ text: "〄 𝗔𝗹𝗹 𝗠𝗲𝗻𝘂", callback_data: "expand_menu", style : "primary" }
],
    [
      { 
  text: '➕ 𝗔𝗱𝗱 𝗚𝗿𝗼𝘂𝗽', 
  url: `https://t.me/${bot.username}?startgroup=true`,
  style: "success" 
},
      { text: '➕ 𝗔𝗱𝗱 𝗖𝗵𝗮𝗻𝗻𝗲𝗹', url: `https://t.me/${bot.username}?startchannel=true`,
  style: "success" }
    ],
    [{ 
  text: "〄 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿", 
  url: `https://t.me/${DEVELOPER.replace('@','')}`,
  style: "primary"
}]
  ];

  await replaceMenu(chatId, caption, buttons, true);

  const audioUrl = "https://files.catbox.moe/fc54i0.mp3"; 
  await bot.sendAudio(chatId, audioUrl, {
    caption: "🎶 <b>Multi Jasher Vvip</b>",
    parse_mode: "HTML"
  }).catch(err => console.error("Gagal kirim musik:", err.message));

  const logMessage = `🚀 <b>User Klik Start!</b>\n\n` +
                     `👤 <b>Nama:</b> ${firstName}\n` +
                     `🆔 <b>ID:</b> <code>${userId}</code>\n` +
                     `🔗 <b>Username:</b> ${username}\n` +
                     `📅 <b>Waktu:</b> ${getHariWaktu()}`;

  const cleanBotUsername = config.BOT_JASHER.replace('@', '');

  const logButtons = {
    reply_markup: {
      inline_keyboard: [
        [{ 
  text: "𝗕𝗢𝗧 𝗝𝗔𝗦𝗛𝗘𝗥", 
  url: `https://t.me/${cleanBotUsername}?start=true`,
  style: "primary"
}]
      ]
    },
    parse_mode: 'HTML'
  };

  bot.sendMessage(config.CHANNEL_RQ, logMessage, logButtons)
    .catch(err => console.error("Gagal kirim log ke CHANNEL_RQ:", err.message));

}));
          
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id.toString();
  const data = query.data;
  const waktuRunPanel = getUptime();
  const username = query.from.username ? `@${query.from.username}` : "Tidak ada username";
  const mainData = loadData();

  try {
        if (data === "check_join_again") {
      const isMember = await checkChannelMembership(userId);

      if (isMember) {
        const cleanBotUsername = config.BOT_JASHER.replace('@', '');
        
        await bot.sendMessage(
          userId,
          `<blockquote>✅ 𝗩𝗘𝗥𝗜𝗙𝗜𝗞𝗔𝗦𝗜 𝗕𝗘𝗥𝗛𝗔𝗦𝗜𝗟</blockquote>

<b>⌦</b> Terimakasih sudah bergabung di <b>Channel dan group</b> resmi kami
<b>⌦</b> Silahkan untuk memulai bot dan mengakses semua fitur tekan tombol 「 𝗦𝘂𝗱𝗮𝗵 𝗩𝗲𝗿𝗶𝗳𝗶𝗸𝗮𝘀𝗶? 𝗣𝗲𝗻𝗰𝗲𝘁 𝗜𝗻𝗶 」

<blockquote>𝐌𝐮𝐥𝐭𝐢 𝐉𝐚𝐬𝐡𝐞𝐫 𝐕𝐯𝐢𝐩</blockquote>`,
          { 
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ 
                  text: "𝗦𝘂𝗱𝗮𝗵 𝗩𝗲𝗿𝗶𝗳𝗶𝗸𝗮𝘀𝗶? 𝗣𝗲𝗻𝗰𝗲𝘁 𝗜𝗻𝗶", 
                  url: `https://t.me/${cleanBotUsername}?start=true`,
                  style: "primary"
                }]
              ]
            }
          }
        );
      } else {
        const channel1 = CHANNEL_USERNAME?.replace('@', '');
        const channel2 = CHANNEL_USERNAME2?.replace('@', '');
        const groupUsername = GROUP_USERNAME?.replace('@', '');

        const rows = [];

        if (channel1 && channel2) {
          rows.push([
            { text: "☊ 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝟭", url: `https://t.me/${channel1}`, style: "danger" },
            { text: "☊ 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝟮", url: `https://t.me/${channel2}`, style: "danger" }
          ]);
        }

        if (groupUsername) {
          rows.push([
            { text: "☊ 𝗚𝗿𝗼𝘂𝗽 𝗥𝗲𝘀𝗺𝗶", url: `https://t.me/${groupUsername}`, style: "danger" }
          ]);
        }

        rows.push([
          { 
            text: "𝗦𝘂𝗱𝗮𝗵 𝗚𝗮𝗯𝘂𝗻𝗴? 𝗣𝗲𝗻𝗰𝗲𝘁 𝗹𝗮𝗴𝗶", 
            callback_data: "check_join_again",
            style: "success" 
          }
        ]);

        await bot.sendMessage(
          userId,
          `<blockquote>❌ 𝗕𝗘𝗟𝗨𝗠 𝗕𝗘𝗥𝗚𝗔𝗕𝗨𝗡𝗚</blockquote>
          
<b>⌦</b> Mohon maaf, sepertinya Anda belum bergabung di semua <b>Channel dan Group</b> kami. 
<b>⌦</b> Silahkan bergabung terlebih dahulu melalui tombol di bawah.`,
          {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: rows }
          }
        );
      }
      await bot.answerCallbackQuery(query.id).catch(() => {});
      return;
    }
   
    if (data.startsWith("ceo_page_")) {
    await bot.answerCallbackQuery(query.id);
    
    if (!ceoPages[userId]) return;
    
    const pageMatch = data.match(/ceo_page_(\d+)/);
    const action = data.replace("ceo_page_", "");
    
    if (action === "current") {
      return; 
    }
    
    if (pageMatch) {
      const page = parseInt(pageMatch[1]);
      await showCeoPage(userId, page);
    }
    return;
  }
  
  if (data === "ceo_refresh") {
    await bot.answerCallbackQuery(query.id);
    
    const ceoList = loadData().ceo || [];
    
    if (ceoList.length === 0) {
      delete ceoPages[userId];
      await bot.editMessageText(`<blockquote><b>📭 BELUM ADA CEO</b></blockquote>
<b>Status :</b> <code>Daftar Kosong</code>`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML"
      });
      return;
    }
    
    const itemsPerPage = 4;
    const totalPages = Math.ceil(ceoList.length / itemsPerPage);
    
    ceoPages[userId] = {
      list: ceoList,
      currentPage: 1,
      totalPages: totalPages,
      itemsPerPage: itemsPerPage,
      chatId: chatId,
      messageId: query.message.message_id
    };
    
    await showCeoPage(userId, 1);
    return;
  }
  
  if (data === "ceo_close") {
    await bot.answerCallbackQuery(query.id);
    
    try {
      await bot.deleteMessage(chatId, query.message.message_id);
    } catch (e) {
      await bot.editMessageText(`<blockquote><b>📋 DAFTAR CEO DITUTUP</b></blockquote>
<b>Pesan telah ditutup.</b>`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML"
      });
    }
    
    delete ceoPages[userId];
    return;
  }
  
  if (data.startsWith("owner_page_")) {
    await bot.answerCallbackQuery(query.id);
    
    if (!ownerPages[userId]) return;
    
    const pageMatch = data.match(/owner_page_(\d+)/);
    const action = data.replace("owner_page_", "");
    
    if (action === "current") {
      return;
    }
    
    if (pageMatch) {
      const page = parseInt(pageMatch[1]);
      await showOwnerPage(userId, page);
    }
    return;
  }
  
  if (data === "owner_refresh") {
    await bot.answerCallbackQuery(query.id);
    
    const owners = loadData().owner || [];
    
    if (owners.length === 0) {
      delete ownerPages[userId];
      await bot.editMessageText(`<blockquote><b>📭 BELUM ADA OWNER</b></blockquote>
<b>Status :</b> <code>Daftar Kosong</code>`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML"
      });
      return;
    }
    
    const itemsPerPage = 4;
    const totalPages = Math.ceil(owners.length / itemsPerPage);
    
    ownerPages[userId] = {
      list: owners,
      currentPage: 1,
      totalPages: totalPages,
      itemsPerPage: itemsPerPage,
      chatId: chatId,
      messageId: query.message.message_id
    };
    
    await showOwnerPage(userId, 1);
    return;
  }
  
  if (data === "owner_close") {
    await bot.answerCallbackQuery(query.id);
    
    try {
      await bot.deleteMessage(chatId, query.message.message_id);
    } catch (e) {
      await bot.editMessageText(`<blockquote><b>📋 DAFTAR OWNER DITUTUP</b></blockquote>
<b>Pesan telah ditutup.</b>`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML"
      });
    }
    
    delete ownerPages[userId];
    return;
  }
  
  if (data.startsWith("premium_page_")) {
    await bot.answerCallbackQuery(query.id);
    
    if (!premiumPages[userId]) return;
    
    const pageMatch = data.match(/premium_page_(\d+)/);
    const action = data.replace("premium_page_", "");
    
    if (action === "current") {
      return;
    }
    
    if (pageMatch) {
      const page = parseInt(pageMatch[1]);
      await showPremiumPage(userId, page);
    }
    return;
  }
  
  if (data === "premium_refresh") {
    await bot.answerCallbackQuery(query.id);

    const data = loadData();
    const now = Math.floor(Date.now() / 1000);
    
    const activePremium = Object.entries(data.premium || {})
      .filter(([uid, exp]) => exp > now)
      .sort((a, b) => b[1] - a[1]);
    
    if (activePremium.length === 0) {
      delete premiumPages[userId];
      await bot.editMessageText(`<blockquote><b>📭 BELUM ADA PREMIUM AKTIF</b></blockquote>
<b>Status :</b> <code>Tidak ada user premium aktif</code>`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML"
      });
      return;
    }
   
    const itemsPerPage = 4;
    const totalPages = Math.ceil(activePremium.length / itemsPerPage);
    
    premiumPages[userId] = {
      list: activePremium,
      currentPage: 1,
      totalPages: totalPages,
      itemsPerPage: itemsPerPage,
      chatId: chatId,
      messageId: query.message.message_id,
      now: now
    };
    
    await showPremiumPage(userId, 1);
    return;
  }
  
  if (data === "premium_close") {
    await bot.answerCallbackQuery(query.id);
    
    try {
      await bot.deleteMessage(chatId, query.message.message_id);
    } catch (e) {
      await bot.editMessageText(`<blockquote><b>📋 DAFTAR PREMIUM DITUTUP</b></blockquote>
<b>Pesan telah ditutup.</b>`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML"
      });
    }
    
    delete premiumPages[userId];
    return;
  }

  if (data.startsWith("blacklist_page_")) {
    await bot.answerCallbackQuery(query.id);
    
    if (!blacklistPages[userId]) return;
    
    const pageMatch = data.match(/blacklist_page_(\d+)/);
    const action = data.replace("blacklist_page_", "");
    
    if (action === "current") {
      return;
    }
    
    if (pageMatch) {
      const page = parseInt(pageMatch[1]);
      await showBlacklistPage(userId, page);
    }
    return;
  }
  
  if (data === "blacklist_refresh") {
    await bot.answerCallbackQuery(query.id);
    
    const list = loadData().blacklist || [];
    
    if (list.length === 0) {
      delete blacklistPages[userId];
      await bot.editMessageText(`<blockquote><b>📭 BLACKLIST KOSONG</b></blockquote>
<b>Status :</b> <code>Tidak ada user terblokir</code>`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML"
      });
      return;
    }
    
    const itemsPerPage = 4;
    const totalPages = Math.ceil(list.length / itemsPerPage);
    
    blacklistPages[userId] = {
      list: list,
      currentPage: 1,
      totalPages: totalPages,
      itemsPerPage: itemsPerPage,
      chatId: chatId,
      messageId: query.message.message_id
    };
    
    await showBlacklistPage(userId, 1);
    return;
  }
  
  if (data === "blacklist_close") {
    await bot.answerCallbackQuery(query.id);
    
    try {
      await bot.deleteMessage(chatId, query.message.message_id);
    } catch (e) {
      await bot.editMessageText(`<blockquote><b>📋 DAFTAR BLACKLIST DITUTUP</b></blockquote>
<b>Pesan telah ditutup.</b>`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML"
      });
    }
    
    delete blacklistPages[userId];
    return;
  }
  
    await bot.answerCallbackQuery(query.id);

    let caption = '';
    let buttons = [];
    let isCollapsed = false;

    switch(data) {
      case "expand_menu":
        caption = `
<blockquote>𝙈𝙖𝙣𝙯𝙯𝙮 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥 𝗩𝗩𝗜𝗣</blockquote>
─────────────────────
<blockquote>｢ 𝗗𝗔𝗧𝗔 ☇ 𝗕𝗢𝗧 ｣</blockquote>
───
‎│◆ Developer : ${DEVELOPER}
‎│◆ Version : 2.0
‎│◆ Name Bot : Multi ☇ Jasher
‎│◆ Type Script : Vvip Only
───

<blockquote>｢ 𝗔𝗟𝗟 ☇ 𝗠𝗘𝗡𝗨  ｣</blockquote>
───
‎│◆ Share Menu
‎│◆ Status Akun
‎│◆ Owner Menu
‎│◆ Tools Menu
│◆ Chat Developer
│◆ Harga Akses
───
─────────────────────
<blockquote>𝗦𝗲𝗹𝗮𝗺𝗮𝘁 𝗠𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗸𝗮𝗻 ${username}</blockquote>
`;
        buttons = [
          [
            { text: "𝗦𝗵𝗮𝗿𝗲 𝗠𝗲𝗻𝘂", callback_data: "menu_jasher", style : "primary" },
            { text: "𝗦𝘁𝗮𝘁𝘂𝘀 𝗔𝗸𝘂𝗻", callback_data: "menu_status", style : "primary" }
          ],
          [
            { text: "𝗖𝗵𝗮𝘁 𝗔𝗱𝗺𝗶𝗻", callback_data: "menu_contact", style : "danger" },
            { text: "𝗧𝗼𝗼𝗹𝘀 𝗠𝗲𝗻𝘂", callback_data: "menu_tools", style : "danger" }
          ],
          [
            { text: "𝗛𝗮𝗿𝗴𝗮 𝗦𝗰𝗿𝗶𝗽𝘁", callback_data: "harga_script", style : "success" },
            { text: "𝗛𝗮𝗿𝗴𝗮 𝗔𝗸𝘀𝗲𝘀", callback_data: "menu_help", style : "success" }
          ]
        ];
        isCollapsed = false;
        await editMenu(chatId, messageId, caption, buttons, isCollapsed);
        break;

      case "menu_owner":
        if (!isAnyOwner(userId)) {
          await bot.sendMessage(chatId, "<blockquote><b>❌ AKSES DITOLAK</b></blockquote>\n<b>Hanya Owner Yang Bisa Menggunakan Perintah Ini!</b>", { parse_mode: "HTML" });
          return;
        }
        caption = `
<blockquote>𝙈𝙖𝙣𝙯𝙯𝙮 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥 𝗩𝗩𝗜𝗣</blockquote>
─────────────────────
<blockquote>｢ 𝗗𝗔𝗧𝗔 ☇ 𝗕𝗢𝗧 ｣</blockquote>
───
‎│◆ Developer : ${DEVELOPER}
‎│◆ Version : 2.0
‎│◆ Name Bot : Multi ☇ Jasher
‎│◆ Type Script : Vvip Only
───
<blockquote>｢ 𝗢𝗪𝗡𝗘𝗥 ☇ 𝗠𝗘𝗡𝗨 ｣</blockquote>
───
‎│◆ /addbutton 
‎│◆ /addakses
‎│◆ /delakses
‎│◆ /listakses
‎│◆ /bc
‎│◆ /bc2
‎│◆ /broadcast
‎│◆ /broadcast2
───
─────────────────────
<blockquote>𝗦𝗲𝗹𝗮𝗺𝗮𝘁 𝗠𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗸𝗮𝗻 ${username}</blockquote>
`;
        buttons = [
          [
            { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
          ]
        ];
        await editMenu(chatId, messageId, caption, buttons, false);
        break;
        
       case "ceo_menu":
        if (!isAnyOwner(userId)) {
          await bot.sendMessage(chatId, "<blockquote><b>❌ AKSES DITOLAK</b></blockquote>\n<b>Hanya Owner Yang Bisa Menggunakan Perintah Ini!</b>", { parse_mode: "HTML" });
          return;
        }
        caption = `
<blockquote>𝙈𝙖𝙣𝙯𝙯𝙮 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥 𝗩𝗩𝗜𝗣</blockquote>
─────────────────────
<blockquote>｢ 𝗗𝗔𝗧𝗔 ☇ 𝗕𝗢𝗧 ｣</blockquote>
───
‎│◆ Developer : ${DEVELOPER}
‎│◆ Version : 2.0
‎│◆ Name Bot : Multi ☇ Jasher
‎│◆ Type Script : Vvip Only
───
<blockquote>｢ 𝗖𝗘𝗢 ☇ 𝗠𝗘𝗡𝗨 ｣</blockquote>
───
‎│◆ /addbutton
‎│◆ /addceo
‎│◆ /delceo
‎│◆ /listceo
‎│◆ /addownjs
‎│◆ /delownjs
‎│◆ /listownjs
‎│◆ /addakses
‎│◆ /delakses
‎│◆ /listakses
│◆ /bc
‎│◆ /bc2
‎│◆ /broadcast
‎│◆ /broadcast2
───
─────────────────────
<blockquote>𝗦𝗲𝗹𝗮𝗺𝗮𝘁 𝗠𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗸𝗮𝗻 ${username}</blockquote>
`;
        buttons = [
          [
            { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
          ]
        ];
        await editMenu(chatId, messageId, caption, buttons, false);
        break;

      case "menu_tools":
        caption = `
<blockquote>𝙈𝙖𝙣𝙯𝙯𝙮 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥 𝗩𝗩𝗜𝗣</blockquote>
─────────────────────
<blockquote>｢ 𝗗𝗔𝗧𝗔 ☇ 𝗕𝗢𝗧 ｣</blockquote>
───
‎│◆ Developer : ${DEVELOPER}
‎│◆ Version : 2.0
‎│◆ Name Bot : Multi ☇ Jasher
‎│◆ Type Script : Vvip Only
───
<blockquote>｢ 𝗧𝗢𝗢𝗟𝗦 ☇ 𝗠𝗘𝗡𝗨 ｣</blockquote>
───
‎│◆ /update
‎│◆ /ping
‎│◆ /tourl
‎│◆ /done
‎│◆ /idchtele
‎│◆ /idgbtele
│◆ /req
│◆ /rate
‎│◆ /cekid
‎│◆ /backup
───
─────────────────────
<blockquote>𝗦𝗲𝗹𝗮𝗺𝗮𝘁 𝗠𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗸𝗮𝗻 ${username}</blockquote>
`;
        buttons = [
          [
            { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
          ]
        ];
        await editMenu(chatId, messageId, caption, buttons, false);
        break;
        
        case "enc_script":
  caption = `
<blockquote>𝗛𝗔𝗥𝗚𝗔 𝗦𝗖𝗥𝗜𝗣𝗧 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥</blockquote>
───
‎│◆ Name Script : Multi Jasher
‎│◆ Type Script : Vvip Only
‎│◆ Script : Enc
‎│◆ Harga : Rp 10.000
───
<blockquote>𝗞𝗘𝗨𝗡𝗧𝗨𝗡𝗚𝗔𝗡</blockquote>
───
‎│◆ Masuk grup informasi update
‎│◆ Di renamin 1×
‎│◆ Mendapatkan script enc + Vvip
‎│◆ Bisa jualan akses sendiri
‎│◆ Di ajarin cara memakai & add sampai bisa
‎│◆ Bisa share share sepuasnya
‎│◆ Bonus mendapatkan akses owner di 2 bot jasher
───
<blockquote>📌 𝗖𝗔𝗧𝗔𝗧𝗔𝗡</blockquote>
➥ Silahkan tekan tombol ｢ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿 ｣ apabila mau membeli
➥ Apabila limit? tekan tombol ｢ 𝗕𝗼𝘁 𝗟𝗶𝗺𝗶𝘁 ｣ apabila mau membeli
➥ Setelah mengirimkan pesan harap di tunggu sampai admin merespon `;

  buttons = [
    [
      { 
  text: "𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿", 
  url: `https://t.me/${DEVELOPER.replace('@','')}`,
  style: "success" 
},
      { 
  text: "𝗕𝗼𝘁 𝗟𝗶𝗺𝗶𝘁", 
  url: `https://t.me/${BOT_LIMIT.replace('@','')}`,
  style: "primary"
}
    ],
    [
      { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "harga_script", style : "danger" } 
    ]
  ];
  await editMenu(chatId, messageId, caption, buttons, false);
  break;
        
        case "noenc_script":
  caption = `
<blockquote>𝗛𝗔𝗥𝗚𝗔 𝗦𝗖𝗥𝗜𝗣𝗧 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥</blockquote>
───
‎│◆ Name Script : Multi Jasher
‎│◆ Type Script : Vvip Only
‎│◆ Script : No Enc
‎│◆ Harga : Rp 15.000
───
<blockquote>𝗞𝗘𝗨𝗡𝗧𝗨𝗡𝗚𝗔𝗡</blockquote>
───
‎│◆ Masuk grup informasi update
‎│◆ Di renamin 1×
‎│◆ Mendapatkan script enc dan no enc
‎│◆ Bisa jualan akses sendiri
‎│◆ Di ajarin cara memakai & add sampai bisa
‎│◆ Bisa share share sepuasnya
‎│◆ Bonus mendapatkan akses Ceo di 2 bot jasher
───
<blockquote>📌 𝗖𝗔𝗧𝗔𝗧𝗔𝗡</blockquote>
➥ Silahkan Tekan tombol ｢ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿 ｣ apabila mau membeli
➥ Apabila limit? tekan tombol ｢ 𝗕𝗼𝘁 𝗟𝗶𝗺𝗶𝘁 ｣ apabila mau membeli
➥ Setelah mengirimkan pesan harap di tunggu sampai admin merespon `;

  buttons = [
    [
      { 
  text: "𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿", 
  url: `https://t.me/${DEVELOPER.replace('@','')}`,
  style: "success" 
},
      { 
  text: "𝗕𝗼𝘁 𝗟𝗶𝗺𝗶𝘁", 
  url: `https://t.me/${BOT_LIMIT.replace('@','')}`,
  style: "primary"
}
    ],
    [
      { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "harga_script", style : "danger" } 
    ]
  ];
  await editMenu(chatId, messageId, caption, buttons, false);
  break;
      
        case "harga_script":
        caption = `
<blockquote>｢ 𝗛𝗔𝗥𝗚𝗔 𝗦𝗖𝗥𝗜𝗣𝗧 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥 𝗩𝗩𝗜𝗣  ｣</blockquote>
───
‎│◆ Harga Script Enc
‎│◆ Harga Scripr No Enc
‎│◆ Harga Reseller Script
───
─────────────────────
<blockquote>𝗦𝗶𝗹𝗮𝗵𝗸𝗮𝗻 𝗣𝗶𝗹𝗶𝗵 𝗦𝗲𝘀𝘂𝗮𝗶 𝗬𝗮𝗻𝗴 𝗔𝗻𝗱𝗮 𝗕𝘂𝘁𝘂𝗵𝗸𝗮𝗻 👇</blockquote>
`;
        buttons = [  
          [
      { text: "𝗛𝗮𝗿𝗴𝗮 𝗦𝗰𝗿𝗶𝗽𝘁 𝗘𝗻𝗰", callback_data: "enc_script", style : "success" },
            { text: "𝗛𝗮𝗿𝗴𝗮 𝗦𝗰𝗿𝗶𝗽𝘁 𝗡𝗼 𝗘𝗻𝗰", callback_data: "noenc_script", style : "primary" }
          ],
          [
            { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
            ]
          ];
        await editMenu(chatId, messageId, caption, buttons, false);
        break;
        
        case "premium_menu":
        caption = `
<blockquote>𝙈𝙖𝙣𝙯𝙯𝙮 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥 𝗩𝗩𝗜𝗣</blockquote>
─────────────────────
<blockquote>｢ 𝗗𝗔𝗧𝗔 ☇ 𝗕𝗢𝗧 ｣</blockquote>
───
‎│◆ Developer : ${DEVELOPER}
‎│◆ Version : 2.0
‎│◆ Name Bot : Multi ☇ Jasher
‎│◆ Type Script : Vvip Only
───
<blockquote>｢ 𝗣𝗥𝗘𝗠𝗜𝗨𝗠 ☇ 𝗠𝗘𝗡𝗨 ｣</blockquote>
───
‎│◆ /share
‎│◆ /share2
‎│◆ /sharemsg
‎│◆ /sharemsg2
───
─────────────────────
<blockquote>𝗦𝗲𝗹𝗮𝗺𝗮𝘁 𝗠𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗸𝗮𝗻 ${username}</blockquote>
`;
        buttons = [
          [
            { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
          ]
        ];
        await editMenu(chatId, messageId, caption, buttons, false);
        break;

      case "menu_jasher":
        caption = `
<blockquote>𝙈𝙖𝙣𝙯𝙯𝙮 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥 𝗩𝗩𝗜𝗣</blockquote>
─────────────────────
<blockquote>｢ 𝗗𝗔𝗧𝗔 ☇ 𝗕𝗢𝗧 ｣</blockquote>
───
‎│◆ Developer : ${DEVELOPER}
‎│◆ Version : 2.0
‎│◆ Name Bot : Multi ☇ Jasher
‎│◆ Type Script : Vvip Only
───
<blockquote>｢ 𝗦𝗛𝗔𝗥𝗘 ☇ 𝗠𝗘𝗡𝗨 ｣</blockquote>
───
‎│◆ Premium Menu
│◆ Owner Menu
│◆ Ceo Menu
───
─────────────────────
<blockquote>𝗦𝗲𝗹𝗮𝗺𝗮𝘁 𝗠𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗸𝗮𝗻 ${username}</blockquote>
`;
        buttons = [
          [
            { text: "𝗖𝗲𝗼 ○ 𝗠𝗲𝗻𝘂", callback_data: "ceo_menu", style : "primary" },
            { text: "𝗣𝗿𝗲𝗺𝗶𝘂𝗺 ○ 𝗠𝗲𝗻𝘂", callback_data: "premium_menu", style : "primary" }
          ],
          [
            { text: "𝗢𝘄𝗻𝗲𝗿 ○ 𝗠𝗲𝗻𝘂", callback_data: "menu_owner", style : "success" },
            { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
          ]
        ];
        isCollapsed = false;
        await editMenu(chatId, messageId, caption, buttons, isCollapsed);
        break;

      case "menu_status":
    const isMain = isMainOwner(userId);
    const isCeo = isCEO(userId);
    const isOwnerNow = isAdditionalOwner(userId); 
    const isPremiumUser = mainData.premium?.[userId] && Math.floor(Date.now() / 1000) < mainData.premium[userId];
    const exp = mainData.premium?.[userId] && Math.floor(Date.now() / 1000) < mainData.premium[userId]
      ? new Date(mainData.premium[userId] * 1000)
      : null;

    let status = "Tidak ada akses";
    if (isMain) {
        status = "DEVELOPER";
    } else if (isCeo) {
        status = "CEO"; 
    } else if (isOwnerNow) {
        status = "OWNER";
    } else if (isPremiumUser) {
        status = "PREMIUM";
    }

    const expDate = exp ? exp.toLocaleString("id-ID", { timeZone: 'Asia/Jakarta' }) : "None";

    caption = `
<blockquote>｢ 𝗦𝗧𝗔𝗧𝗨𝗦 ☇ 𝗔𝗞𝗨𝗡 ｣</blockquote>
───
‎│◆ Name : ${query.from.first_name || "User"}
│◆ Status : ${status}
│◆ Tanggal Kedaluwarsa : ${expDate}
───
`;
    buttons = [
      [
        { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
      ]
    ];
    await editMenu(chatId, messageId, caption, buttons, false);
    break;

      case "menu_help":
  caption = `
<blockquote>𝗛𝗔𝗥𝗚𝗔 𝗔𝗞𝗦𝗘𝗦 𝗠𝗨𝗟𝗧𝗜 𝗝𝗔𝗦𝗛𝗘𝗥</blockquote>
───
‎│◆ <b>Akses Owner</b>
‎│◆ Harga : Rp 6.000
‎│◆ <b>Akses Ceo</b>
‎│◆ Harga : Rp 9.000
───
<blockquote>𝗞𝗲𝘂𝗻𝘁𝘂𝗻𝗴𝗮𝗻 𝗔𝗸𝘀𝗲𝘀 𝗢𝘄𝗻𝗲𝗿</blockquote>
● Bisa share share sepuasnya
● Bisa pakai auto promosi
● Bisa jual atau open jasa share
● Bisa jual akses premium 
● Bot online 24 jam nonstop
● Bot di push oleh admin
● Bisa memakai fitur bc, share, broadcast, share2, broadcast 2, dan masih banyak lainnya...
<blockquote>𝗞𝗲𝘂𝗻𝘁𝘂𝗻𝗴𝗮𝗻 𝗔𝗸𝘀𝗲𝘀 𝗖𝗲𝗼</blockquote>
● Bisa share share sepuasnya
● Bisa pakai auto promosi
● Bisa jual atau open jasa share
● Bisa jual atau open akses premium dan owner 
● Bot online 24 jam nonstop
● Bot di push oleh admin
● Bisa memakai fitur bc, share, broadcast, share2, broadcast 2, dan masih banyak lainnya...
<blockquote>📌 𝗖𝗔𝗧𝗔𝗧𝗔𝗡</blockquote>
➥ Silahkan tekan tombol ｢ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿 ｣ apabila mau membeli
➥ Apabila limit? tekan tombol ｢ 𝗕𝗼𝘁 𝗟𝗶𝗺𝗶𝘁 ｣ apabila mau membeli
➥ Setelah mengirimkan pesan harap di tunggu sampai admin merespon `;

  buttons = [
    [
      { 
  text: "𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿", 
  url: `https://t.me/${DEVELOPER.replace('@','')}`,
  style: "success" 
},
      { 
  text: "𝗕𝗼𝘁 𝗟𝗶𝗺𝗶𝘁", 
  url: `https://t.me/${BOT_LIMIT.replace('@','')}`,
  style: "primary"
}
    ],
    [
      { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" } 
    ]
  ];
  await editMenu(chatId, messageId, caption, buttons, false);
  break;

      case "menu_contact":
        if (!OWNER_IDS || OWNER_IDS.length === 0) {
          await editMenu(
            chatId,
            messageId,
            `<blockquote><b>Error</b></blockquote>
<b>Owner ID belum diatur. Hubungi administrator.</b>`,
            [
              [
                { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
              ]
            ]
          );
          return;
        }
        
        chatSessions[userId] = { 
          active: true, 
          ownerId: OWNER_IDS[0],
          userName: username,
          userFirstName: query.from.first_name || "User"
        };
        
        await editMenu(
          chatId,
          messageId,
          `<blockquote><b>Obrolan Dibuka</b></blockquote>
<b>Hai ${username}</b>
<b>Silakan tulis pesanmu untuk Admin di sini.</b>
<b>Pesanmu akan dikirim langsung ke Admin.</b>`,
          [
            [
              { text: "X 𝗕𝗮𝘁𝗮𝗹𝗸𝗮𝗻 𝗢𝗯𝗿𝗼𝗹𝗮𝗻", callback_data: "cancel_chat", style : "danger" }
            ]
          ]
        );
        return;

      case "cancel_chat":
        if (chatSessions[userId]) {
          delete chatSessions[userId];
          const imagePath = getRandomImage();
          
          if (imagePath && imagePath.path) {
            try {
              await bot.sendPhoto(chatId, imagePath.path, {
                caption: `<blockquote><b>Obrolan Ditutup</b></blockquote>
<b>Terima kasih sudah menghubungi Admin.</b>
<b>Semoga pesanmu sudah tersampaikan dengan baik.</b>`,
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
                    ]
                  ]
                }
              });
            } catch {
              await bot.sendMessage(chatId, `<blockquote><b>Obrolan Ditutup</b></blockquote>
<b>Terima kasih sudah menghubungi Admin.</b>
<b>Semoga pesanmu sudah tersampaikan dengan baik.</b>`, {
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
                    ]
                  ]
                }
              });
            }
          } else {
            await bot.sendMessage(chatId, `<blockquote><b>Obrolan Ditutup</b></blockquote>
<b>Terima kasih sudah menghubungi Admin.</b>
<b>Semoga pesanmu sudah tersampaikan dengan baik.</b>`, {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
                  ]
                ]
              }
            });
          }
        }
        return;

      default:
        return;
    }

  } catch (err) {}
});

bot.on("message", async (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;
  const text = msg.text;

  if (msg.chat.type === 'private') {
    if (chatSessions[userId]?.active && chatSessions[userId].type === "addbutton" && text && !text?.startsWith('/')) {
      const session = chatSessions[userId];
      const repliedMsg = session.repliedMsg;
      
      try {
        const lines = text.split('\n');
        const buttons = [];
        let row = [];
        let buttonData = [];
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          const parts = line.split('|').map(p => p.trim());
          if (parts.length < 2) continue;
          
          const name = parts[0];
          let url = parts[1];
          
          if (!url.startsWith('http')) {
            url = 'https://' + url;
          }
          
          row.push({ text: name, url: url });
          buttonData.push({ name: name, url: url });
          
          if (row.length >= 5) {
            buttons.push([...row]);
            row = [];
          }
        }
        
        if (row.length > 0) {
          buttons.push(row);
        }
        
        if (buttons.length === 0) {
          delete chatSessions[userId];
          return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
<code>Gunakan format: Nama|URL</code>`, { parse_mode: "HTML" });
        }
        
        const buttonSet = {
          id: Date.now(),
          name: `ButtonSet_${savedButtons.length + 1}`,
          buttons: buttonData,
          timestamp: new Date().toLocaleString('id-ID'),
          totalButtons: buttonData.length
        };
        
        savedButtons.push(buttonSet);
  
        const replyMarkup = { inline_keyboard: buttons };
        const caption = repliedMsg.caption || repliedMsg.text || '';
        
        if (repliedMsg.photo) {
          const photoId = repliedMsg.photo[repliedMsg.photo.length - 1].file_id;
          await bot.sendPhoto(chatId, photoId, {
            caption: caption,
            parse_mode: "HTML",
            reply_markup: replyMarkup
          });
        } 
        else if (repliedMsg.video) {
          await bot.sendVideo(chatId, repliedMsg.video.file_id, {
            caption: caption,
            parse_mode: "HTML",
            reply_markup: replyMarkup
          });
        }
        else if (repliedMsg.document) {
          await bot.sendDocument(chatId, repliedMsg.document.file_id, {
            caption: caption,
            parse_mode: "HTML",
            reply_markup: replyMarkup
          });
        }
        else if (repliedMsg.sticker) {
          await bot.sendMessage(chatId, caption || '📢 Sticker dengan Button', {
            parse_mode: "HTML",
            reply_markup: replyMarkup
          });
        }
        else if (repliedMsg.text) {
          await bot.sendMessage(chatId, repliedMsg.text, {
            parse_mode: "HTML",
            reply_markup: replyMarkup
          });
        }
        else {
          await bot.sendMessage(chatId, caption || '📢 Pesan dengan Button', {
            parse_mode: "HTML",
            reply_markup: replyMarkup
          });
        }
        
        delete chatSessions[userId];
        
      } catch (error) {
        delete chatSessions[userId];
        await bot.sendMessage(chatId, `<blockquote><b>❌ ERROR</b></blockquote>
<b>Gagal:</b> ${error.message}`, { parse_mode: "HTML" });
      }
      return;
    }
    
    if (chatSessions[userId]?.active && !chatSessions[userId].type && !text?.startsWith('/')) {
      const ownerId = chatSessions[userId].ownerId;
      const userName = chatSessions[userId].userName;
      const userFirstName = chatSessions[userId].userFirstName;
      
      try {
        const forwardResult = await bot.forwardMessage(ownerId, chatId, msg.message_id);
        
        const userInfo = `<blockquote><b>📩 PESAN DARI USER</b></blockquote>
<b>👤 Nama:</b> ${userFirstName}
<b>📱 Username:</b> ${userName}
<b>🆔 ID:</b> <code>${userId}</code>
<b>📤 Forward ID:</b> <code>${forwardResult.message_id}</code>`;
        
        await bot.sendMessage(ownerId, userInfo, { 
          parse_mode: "HTML",
          reply_to_message_id: forwardResult.message_id
        });
        
        await bot.sendMessage(
          chatId,
          `<blockquote><b>✅ PESAN TERKIRIM</b></blockquote>
<b>Pesanmu sudah terkirim ke Admin.</b>
<b>Mohon bersabar yaa...</b>
<b>Admin akan segera membalas pesanmu</b>`,
          { 
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "⌯ 𝗕𝗮𝘁𝗮𝗹𝗸𝗮𝗻 𝗦𝗲𝘀𝗶", callback_data: "cancel_chat" }]]
            }
          }
        );
      } catch (err) {
        delete chatSessions[userId];
        return bot.sendMessage(chatId, 
          `<blockquote><b>⚠️ KESALAHAN TERJADI</b></blockquote>
<b>Terjadi kesalahan saat mengirim pesan ke Admin.</b>
<b>Sesi chat otomatis ditutup.</b>`, 
          { 
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: "expand_menu", style : "danger" }
                ]
              ]
            }
          }
        );
      }
      return;
    }
  }

  if (isAnyOwner(userId) && msg.reply_to_message) {
    const replied = msg.reply_to_message;
    let targetUserId = null;
    
    if (replied.forward_from) {
      targetUserId = replied.forward_from.id.toString();
    } else if (replied.text && replied.text.includes("ID:")) {
      const match = replied.text.match(/ID:.*?(\d+)/);
      if (match) targetUserId = match[1];
    } else if (replied.caption && replied.caption.includes("ID:")) {
      const match = replied.caption.match(/ID:.*?(\d+)/);
      if (match) targetUserId = match[1];
    }
    
    if (targetUserId && chatSessions[targetUserId]?.active) {
      try {
        let sentMessage = null;
        
        if (msg.text) {
          sentMessage = await bot.sendMessage(targetUserId, msg.text);
        } else if (msg.photo) {
          sentMessage = await bot.sendPhoto(targetUserId, msg.photo[msg.photo.length - 1].file_id, { 
            caption: msg.caption || "" 
          });
        } else if (msg.document) {
          sentMessage = await bot.sendDocument(targetUserId, msg.document.file_id, { 
            caption: msg.caption || "" 
          });
        } else if (msg.video) {
          sentMessage = await bot.sendVideo(targetUserId, msg.video.file_id, { 
            caption: msg.caption || "" 
          });
        } else if (msg.sticker) {
          sentMessage = await bot.sendSticker(targetUserId, msg.sticker.file_id);
        }
        
        if (sentMessage) {
          await bot.sendMessage(
            chatId,
            `<blockquote><b>✅ PESAN TERKIRIM KE USER</b></blockquote>
<b>Pesanmu berhasil dikirim ke user.</b>
<b>Kamu bisa lanjut ngobrol dengan user ini.</b>`,
            { 
              parse_mode: "HTML", 
              reply_to_message_id: msg.message_id 
            }
          );
        }
      } catch (e) {
        await bot.sendMessage(
          chatId,
          `<blockquote><b>⚠️ GAGAL MENGIRIM PESAN</b></blockquote>
<b>Gagal mengirim pesan ke user.</b>
<b>Kemungkinan user sudah menutup sesi.</b>`,
          { parse_mode: "HTML" }
        );
      }
    }
  }
});

bot.onText(/^\/share$/, async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;

  const senderId = msg.from.id.toString();
  const data = loadData();
  const chatId = msg.chat.id;

  try {
    const isOwnerNow = isAnyOwner(senderId);
    const isPremiumUser = data.premium?.[senderId] && Math.floor(Date.now() / 1000) < data.premium[senderId];
    const isMainOwner = senderId === OWNER_IDS[0].toString();
    
    if (!isOwnerNow && !isPremiumUser) {
      return bot.sendMessage(chatId, "⛔ Hanya bisa digunakan oleh Owner atau User Premium.").catch(() => {});
    }

    if (!msg.reply_to_message) {
      return bot.sendMessage(chatId, "⚠️ Harap *reply* ke pesan yang ingin kamu forward.", { parse_mode: "Markdown" }).catch(() => {});
    }

    const groups = data.groups || [];
    if (groups.length === 0) {
      return bot.sendMessage(chatId, "⚠️ Tidak ada grup terdaftar untuk forward.").catch(() => {});
    }

    const total = groups.length;
    let sukses = 0, gagal = 0;

    await bot.sendMessage(chatId, `📡 Memproses Sharemsgv2 (forward) Anda Ke *${total}* Grup/Channel...`, { parse_mode: "Markdown" }).catch(() => {});

    const jedaMs = isMainOwner ? 0 : 15000;

    for (const groupId of groups) {
      try {
        await bot.forwardMessage(groupId, chatId, msg.reply_to_message.message_id);
        sukses++;
      } catch {
        gagal++;
      }

      if (jedaMs > 0) {
        await new Promise(r => setTimeout(r, jedaMs));
      }
    }

    await bot.sendMessage(chatId, `
✅ Sharemsgv2 Anda Telah Selesai!
┏━━━━━━━━━━━━━━━━━━
┃𖥂 Total  : ${total}                       
┃𖥂 Berhasil : ${sukses}
┃𖥂 Gagal : ${gagal}
┗━━━━━━━━━━━━━━━━━━
`.trim()).catch(() => {});

    const username = msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name;

    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    bot.sendMessage(CHANNEL_ID, `<blockquote><b>📢 SHARE DIGUNAKAN</b></blockquote>
<b>👤 User:</b> ${username}
<b>🆔 ID:</b> <code>${senderId}</code>

<b>📊 Statistik:</b>
• Total Grup: ${total}
• Berhasil: ${sukses}
• Gagal: ${gagal}

<b>⏰ Waktu:</b> ${waktu}`, { parse_mode: "HTML" }).catch(() => {});

  } catch (err) {
    console.error("❌ Error fatal di /sharemsgv2:", err);
    bot.sendMessage(chatId, "⚠️ Terjadi error saat memproses /sharemsgv2.").catch(() => {});
  }
});

bot.onText(/^\/share2$/, async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;
  if (!(await requireNotMaintenance(msg))) return;
  
  const senderId = msg.from.id.toString();
  const data = loadData();
  const chatId = msg.chat.id;

  try {
    const isOwnerNow = isAnyOwner(senderId);
    const isPremiumUser = data.premium?.[senderId] && Math.floor(Date.now() / 1000) < data.premium[senderId];
    const groupCount = data.user_group_count?.[senderId] || 0;

    if (!isOwnerNow && !isPremiumUser && groupCount < 2) {
      return bot.sendMessage(chatId, `<blockquote><b>❌ AKSES DITOLAK</b></blockquote>
<b>Hanya User Premium Yang Bisa Menggunakan Perintah Ini!</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!data.cooldowns) data.cooldowns = {};
    if (!data.cooldowns.sharemsg) data.cooldowns.sharemsg = {};

    const now = Math.floor(Date.now() / 1000);
    const lastUse = data.cooldowns.sharemsg[senderId] || 0;
    const cooldown = getGlobalCooldownMinutes() * 60;

    if (!isMainOwner(senderId) && (now - lastUse) < cooldown) {
      const sisa = cooldown - (now - lastUse);
      const menit = Math.floor(sisa / 60);
      const detik = sisa % 60;
      return bot.sendMessage(chatId, `<blockquote><b>⏳ COOLDOWN AKTIF</b></blockquote>
<b>Tunggu ${menit} menit ${detik} detik sebelum menggunakan /sharemsg lagi.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!msg.reply_to_message) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ FORMAT SALAH</b></blockquote>
<b>Harap reply ke pesan yang ingin kamu bagikan.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!isMainOwner(senderId)) {
      data.cooldowns.sharemsg[senderId] = now;
      saveData(data);
    }

    const groups = data.groups || [];
    if (groups.length === 0) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ TIDAK ADA GRUP</b></blockquote>
<b>Tidak ada grup terdaftar untuk share.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    const total = groups.length;
    let sukses = 0;
    let gagal = 0;
    
    await bot.sendMessage(chatId, `<blockquote><b>📡 Memproses sharemsg ke ${total} grup...</b></blockquote>`, { parse_mode: "HTML" }).catch(() => {});
    const reply = msg.reply_to_message;

    const username = msg.from.username
      ? `@${msg.from.username}`
      : `${msg.from.first_name || "User"} (ID: ${senderId})`;

    const tagHeader = `• Share By: ${username}\n\n`;

    for (const groupId of groups) {
      try {
        if (reply.text) {
          const teks = tagHeader + reply.text;
          await bot.sendMessage(groupId, teks);
        } else if (reply.photo) {
          const fileId = reply.photo[reply.photo.length - 1].file_id;
          const caption = tagHeader + (reply.caption || "");
          await bot.sendPhoto(groupId, fileId, { caption });
        } else if (reply.video) {
          const caption = tagHeader + (reply.caption || "");
          await bot.sendVideo(groupId, reply.video.file_id, { caption });
        } else if (reply.document) {
          const caption = tagHeader + (reply.caption || "");
          await bot.sendDocument(groupId, reply.document.file_id, { caption });
        } else if (reply.sticker) {
          await bot.sendMessage(groupId, tagHeader);
          await bot.sendSticker(groupId, reply.sticker.file_id);
        } else {
          await bot.sendMessage(groupId, tagHeader + "⚠️ Jenis pesan ini belum didukung.");
        }
        sukses++;
      } catch {
        gagal++;
      }

      await new Promise(r => setTimeout(r, 200));
    }

    await bot.sendMessage(chatId, `<blockquote><b>✅ SHARE SELESAI!</b></blockquote>
<b>📊 Hasil:</b>
<b>• Total Grup:</b> ${total}
<b>✅ Sukses:</b> ${sukses}
<b>❌ Gagal:</b> ${gagal}`, { parse_mode: "HTML" }).catch(() => {});

    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    bot.sendMessage(CHANNEL_ID, `<blockquote><b>📢 SHARE2 DIGUNAKAN</b></blockquote>
<b>👤 User:</b> ${username}
<b>🆔 ID:</b> <code>${senderId}</code>

<b>📊 Statistik:</b>
• Total Grup: ${total}
• Sukses: ${sukses}
• Gagal: ${gagal}

<b>⏰ Waktu:</b> ${waktu}`, { parse_mode: "HTML" }).catch(() => {});

  } catch (err) {
    bot.sendMessage(chatId, `<blockquote><b>❌ ERROR SISTEM</b></blockquote>
<b>Terjadi error saat memproses /sharemsg.</b>`, { parse_mode: "HTML" }).catch(() => {});
  }
});

bot.onText(/^\/sharemsg$/, async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;
  if (!(await requireNotMaintenance(msg))) return;
  
  const senderId = msg.from.id.toString();
  const data = loadData();
  const chatId = msg.chat.id;

  try {
    if (!(await cekAkses("premium", msg))) return;

    if (!data.cooldowns) data.cooldowns = {};
    if (!data.cooldowns.sharemsg2) data.cooldowns.sharemsg2 = {};

    const now = Math.floor(Date.now() / 1000);
    const lastUse = data.cooldowns.sharemsg2[senderId] || 0;
    const cooldown = getGlobalCooldownMinutes() * 60;

    if (!isMainOwner(senderId) && (now - lastUse) < cooldown) {
      const sisa = cooldown - (now - lastUse);
      const menit = Math.floor(sisa / 60);
      const detik = sisa % 60;
      return bot.sendMessage(chatId, `<blockquote><b>⏳ COOLDOWN AKTIF</b></blockquote>
<b>Tunggu ${menit} menit ${detik} detik sebelum menggunakan /sharemsg lagi.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!msg.reply_to_message) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ FORMAT SALAH</b></blockquote>
<b>Harap reply ke pesan yang ingin kamu copy.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!isMainOwner(senderId)) {
      data.cooldowns.sharemsg2[senderId] = now;
      saveData(data);
    }

    const groups = data.groups || [];
    if (groups.length === 0) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ TIDAK ADA GRUP</b></blockquote>
<b>Tidak ada grup terdaftar.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    const total = groups.length;
    let sukses = 0;
    let gagal = 0;

    await bot.sendMessage(chatId, `<blockquote><b>📡 Memproses copy pesan ke ${total} grup...</b></blockquote>`, { parse_mode: "HTML" }).catch(() => {});

    for (const groupId of groups) {
      try {
        await bot.copyMessage(groupId, chatId, msg.reply_to_message.message_id);
        sukses++;
      } catch {
        gagal++;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    await bot.sendMessage(chatId, `<blockquote><b>✅ COPY SELESAI!</b></blockquote>
<b>📊 Hasil:</b>
<b>• Total Grup:</b> ${total}
<b>✅ Sukses:</b> ${sukses}
<b>❌ Gagal:</b> ${gagal}`, { parse_mode: "HTML" }).catch(() => {});

    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

    bot.sendMessage(CHANNEL_ID, `<blockquote><b>📢 SHAREMSG DIGUNAKAN</b></blockquote>
<b>👤 User:</b> ${username}
<b>🆔 ID:</b> <code>${senderId}</code>

<b>📊 Statistik:</b>
• Total Grup: ${total}
• Sukses: ${sukses}
• Gagal: ${gagal}

<b>⏰ Waktu:</b> ${waktu}`, { parse_mode: "HTML" }).catch(() => {});

  } catch (err) {
    bot.sendMessage(chatId, `<blockquote><b>❌ ERROR SISTEM</b></blockquote>
<b>Terjadi error saat memproses /sharemsg.</b>`, { parse_mode: "HTML" }).catch(() => {});
  }
});

bot.onText(/^\/sharemsg2$/, async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;
  if (!(await requireNotMaintenance(msg))) return;
  
  const senderId = msg.from.id.toString();
  const data = loadData();
  const chatId = msg.chat.id;

  try {
    if (!(await cekAkses("owner", msg))) return;

    if (!data.cooldowns) data.cooldowns = {};
    if (!data.cooldowns.sharemsg3) data.cooldowns.sharemsg3 = {};

    const now = Math.floor(Date.now() / 1000);
    const lastUse = data.cooldowns.sharemsg3[senderId] || 0;
    const cooldown = getGlobalCooldownMinutes() * 60;

    if (!isMainOwner(senderId) && (now - lastUse) < cooldown) {
      const sisa = cooldown - (now - lastUse);
      const menit = Math.floor(sisa / 60);
      const detik = sisa % 60;
      return bot.sendMessage(chatId, `<blockquote><b>⏳ COOLDOWN AKTIF</b></blockquote>
<b>Tunggu ${menit} menit ${detik} detik sebelum menggunakan /sharemsg3 lagi.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!msg.reply_to_message) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ FORMAT SALAH</b></blockquote>
<b>Harap reply ke pesan yang ingin kamu forward.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!isMainOwner(senderId)) {
      data.cooldowns.sharemsg3[senderId] = now;
      saveData(data);
    }

    const groups = data.groups || [];
    if (groups.length === 0) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ TIDAK ADA GRUP</b></blockquote>
<b>Tidak ada grup terdaftar.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    const total = groups.length;
    let sukses = 0;
    let gagal = 0;

    await bot.sendMessage(chatId, `<blockquote><b>📡 Memproses forward pesan ke ${total} grup...</b></blockquote>`, { parse_mode: "HTML" }).catch(() => {});

    for (const groupId of groups) {
      try {
        await bot.forwardMessage(groupId, chatId, msg.reply_to_message.message_id);
        sukses++;
      } catch {
        gagal++;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    await bot.sendMessage(chatId, `<blockquote><b>✅ FORWARD SELESAI!</b></blockquote>
<b>📊 Hasil:</b>
<b>• Total Grup:</b> ${total}
<b>✅ Sukses:</b> ${sukses}
<b>❌ Gagal:</b> ${gagal}`, { parse_mode: "HTML" }).catch(() => {});

    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

    bot.sendMessage(CHANNEL_ID, `<blockquote><b>📢 SHAREMSG2 DIGUNAKAN</b></blockquote>
<b>👤 User:</b> ${username}
<b>🆔 ID:</b> <code>${senderId}</code>

<b>📊 Statistik:</b>
• Total Grup: ${total}
• Sukses: ${sukses}
• Gagal: ${gagal}

<b>⏰ Waktu:</b> ${waktu}`, { parse_mode: "HTML" }).catch(() => {});

  } catch (err) {
    bot.sendMessage(chatId, `<blockquote><b>❌ ERROR SISTEM</b></blockquote>
<b>Terjadi error saat memproses /sharemsg3.</b>`, { parse_mode: "HTML" }).catch(() => {});
  }
});

bot.onText(/^\/bc$/, async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;

  const senderId = msg.from.id.toString();
  const data = loadData();
  const chatId = msg.chat.id;

  try {
    const isOwnerNow = isAnyOwner(senderId);
    const isMainOwner = senderId === OWNER_IDS[0].toString();

    if (!isOwnerNow) {
      return bot.sendMessage(chatId, "⛔ Hanya Owner Dan Ceo yang bisa menggunakan /broadcastv2 (forward ke user).").catch(() => {});
    }

    if (!msg.reply_to_message) {
      return bot.sendMessage(chatId, "⚠️ Harap *reply* ke pesan yang ingin di-forward ke semua user.", { parse_mode: "Markdown" }).catch(() => {});
    }

    const users = data.users || [];
    if (users.length === 0) {
      return bot.sendMessage(chatId, "⚠️ Tidak ada user terdaftar untuk broadcast.").catch(() => {});
    }

    const total = users.length;
    let sukses = 0, gagal = 0;

    await bot.sendMessage(chatId, `📡 Broadcastv2 (forward) Anda Ke *${total}* User Dimulai...`, { parse_mode: "Markdown" }).catch(() => {});

    const jedaMs = isMainOwner ? 0 : 15000;

    for (const targetId of users) {
      try {
        await bot.forwardMessage(targetId, chatId, msg.reply_to_message.message_id);
        sukses++;
      } catch {
        gagal++;
      }

      if (jedaMs > 0) {
        await new Promise(r => setTimeout(r, jedaMs));
      }
    }

    await bot.sendMessage(chatId, `
✅ Broadcastv2 Anda Telah Selesai!
┏━━━━━━━━━━━━━━━━━━
┃𖥂 Total  : ${total}                       
┃𖥂 Berhasil : ${sukses}
┃𖥂 Gagal : ${gagal}
┗━━━━━━━━━━━━━━━━━━
`.trim()).catch(() => {});

    const username = msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name;

    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    bot.sendMessage(CHANNEL_ID, `<blockquote><b>📢 BROADCAST DIGUNAKAN</b></blockquote>
<b>👤 User:</b> ${username}
<b>🆔 ID:</b> <code>${senderId}</code>

<b>📊 Statistik:</b>
• Total User: ${total}
• Berhasil: ${sukses}
• Gagal: ${gagal}

<b>⏰ Waktu:</b> ${waktu}`, { parse_mode: "HTML" }).catch(() => {});

  } catch (err) {
    console.error("❌ Error di /bc:", err);
    bot.sendMessage(chatId, "⚠️ Terjadi error saat memproses /broadcastv2.").catch(() => {});
  }
});

bot.onText(/^\/bc2$/, async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;
  if (!(await requireNotMaintenance(msg))) return;
  
  const senderId = msg.from.id.toString();
  const data = loadData();
  const chatId = msg.chat.id;

  try {
    if (!(await cekAkses("owner", msg))) return;

    if (!data.cooldowns) data.cooldowns = {};
    if (!data.cooldowns.broadcast) data.cooldowns.broadcast = {};

    const now = Math.floor(Date.now() / 1000);
    const lastUse = data.cooldowns.broadcast[senderId] || 0;
    const cooldown = getGlobalCooldownMinutes() * 60;

    if (!isMainOwner(senderId) && (now - lastUse) < cooldown) {
      const sisa = cooldown - (now - lastUse);
      const menit = Math.floor(sisa / 60);
      const detik = sisa % 60;
      return bot.sendMessage(chatId, `<blockquote><b>⏳ COOLDOWN AKTIF</b></blockquote>
<b>Tunggu ${menit} menit ${detik} detik sebelum menggunakan /bc2 lagi.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!msg.reply_to_message) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ FORMAT SALAH</b></blockquote>
<b>Harap reply ke pesan yang ingin kamu broadcast.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!isMainOwner(senderId)) {
      data.cooldowns.broadcast[senderId] = now;
      saveData(data);
    }

    const users = [...new Set(data.users || [])];
    if (users.length === 0) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ TIDAK ADA USER</b></blockquote>
<b>Tidak ada user terdaftar.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    const total = users.length;
    let sukses = 0;
    let gagal = 0;
    
    await bot.sendMessage(chatId, `<blockquote><b>📡 Memproses broadcast ke ${total} user...</b></blockquote>`, { parse_mode: "HTML" }).catch(() => {});
    const reply = msg.reply_to_message;

    const username = msg.from.username
      ? `@${msg.from.username}`
      : `${msg.from.first_name || "User"} (ID: ${senderId})`;

    const tagHeader = `• Broadcast By: ${username}\n\n`;

    for (const userId of users) {
      try {
        if (reply.text) {
          const teks = tagHeader + reply.text;
          await bot.sendMessage(userId, teks).catch(() => {});
        } else if (reply.photo) {
          const fileId = reply.photo[reply.photo.length - 1].file_id;
          const caption = tagHeader + (reply.caption || "");
          await bot.sendPhoto(userId, fileId, { caption }).catch(() => {});
        } else if (reply.video) {
          const caption = tagHeader + (reply.caption || "");
          await bot.sendVideo(userId, reply.video.file_id, { caption }).catch(() => {});
        } else if (reply.document) {
          const caption = tagHeader + (reply.caption || "");
          await bot.sendDocument(userId, reply.document.file_id, { caption }).catch(() => {});
        } else if (reply.sticker) {
          await bot.sendMessage(userId, tagHeader).catch(() => {});
          await bot.sendSticker(userId, reply.sticker.file_id).catch(() => {});
        } else {
          await bot.sendMessage(userId, tagHeader + "⚠️ Jenis pesan ini belum didukung.").catch(() => {});
        }
        sukses++;
      } catch {
        gagal++;
      }

      await new Promise(r => setTimeout(r, 200));
    }

    await bot.sendMessage(chatId, `<blockquote><b>✅ BROADCAST SELESAI!</b></blockquote>
<b>📊 Hasil:</b>
<b>• Total User:</b> ${total}
<b>✅ Sukses:</b> ${sukses}
<b>❌ Gagal:</b> ${gagal}`, { parse_mode: "HTML" }).catch(() => {});

    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    bot.sendMessage(CHANNEL_ID, `<blockquote><b>📢 BC2 DIGUNAKAN</b></blockquote>
<b>👤 User:</b> ${username}
<b>🆔 ID:</b> <code>${senderId}</code>

<b>📊 Statistik:</b>
• Total User: ${total}
• Sukses: ${sukses}
• Gagal: ${gagal}

<b>⏰ Waktu:</b> ${waktu}`, { parse_mode: "HTML" }).catch(() => {});

  } catch (err) {
    bot.sendMessage(chatId, `<blockquote><b>❌ ERROR SISTEM</b></blockquote>
<b>Terjadi error saat memproses /broadcast.</b>`, { parse_mode: "HTML" }).catch(() => {});
  }
});

bot.onText(/^\/broadcast2$/, async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;
  if (!(await requireNotMaintenance(msg))) return;
  
  const senderId = msg.from.id.toString();
  const data = loadData();
  const chatId = msg.chat.id;

  try {
    if (!(await cekAkses("owner", msg))) return;

    if (!data.cooldowns) data.cooldowns = {};
    if (!data.cooldowns.broadcast2) data.cooldowns.broadcast2 = {};

    const now = Math.floor(Date.now() / 1000);
    const lastUse = data.cooldowns.broadcast2[senderId] || 0;
    const cooldown = getGlobalCooldownMinutes() * 60;

    if (!isMainOwner(senderId) && (now - lastUse) < cooldown) {
      const sisa = cooldown - (now - lastUse);
      const menit = Math.floor(sisa / 60);
      const detik = sisa % 60;
      return bot.sendMessage(chatId, `<blockquote><b>⏳ COOLDOWN AKTIF</b></blockquote>
<b>Tunggu ${menit} menit ${detik} detik sebelum menggunakan /broadcast2 lagi.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!msg.reply_to_message) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ FORMAT SALAH</b></blockquote>
<b>Harap reply ke pesan yang ingin kamu copy.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    if (!isMainOwner(senderId)) {
      data.cooldowns.broadcast2[senderId] = now;
      saveData(data);
    }

    const users = [...new Set(data.users || [])];
    if (users.length === 0) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ TIDAK ADA USER</b></blockquote>
<b>Tidak ada user terdaftar.</b>`, { parse_mode: "HTML" }).catch(() => {});
    }

    const total = users.length;
    let sukses = 0;
    let gagal = 0;
    
    await bot.sendMessage(chatId, `<blockquote><b>📡 Memproses copy broadcast ke ${total} user...</b></blockquote>`, { parse_mode: "HTML" }).catch(() => {});

    for (const userId of users) {
      try {
        await bot.copyMessage(userId, chatId, msg.reply_to_message.message_id).catch(() => {});
        sukses++;
      } catch {
        gagal++;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    await bot.sendMessage(chatId, `<blockquote><b>✅ COPY BROADCAST SELESAI!</b></blockquote>
<b>📊 Hasil:</b>
<b>• Total User:</b> ${total}
<b>✅ Sukses:</b> ${sukses}
<b>❌ Gagal:</b> ${gagal}`, { parse_mode: "HTML" }).catch(() => {});

    // =====================
    // NOTIFIKASI KE CHANNEL
    // =====================

    const username = msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name;

    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    bot.sendMessage(CHANNEL_ID, `<blockquote><b>📢 BROADCAST2 DIGUNAKAN</b></blockquote>
<b>👤 User:</b> ${username}
<b>🆔 ID:</b> <code>${senderId}</code>

<b>📊 Statistik:</b>
• Total User: ${total}
• Sukses: ${sukses}
• Gagal: ${gagal}

<b>⏰ Waktu:</b> ${waktu}`, { parse_mode: "HTML" }).catch(() => {});

  } catch (err) {
    bot.sendMessage(chatId, `<blockquote><b>❌ ERROR SISTEM</b></blockquote>
<b>Terjadi error saat memproses /broadcast2.</b>`, { parse_mode: "HTML" }).catch(() => {});
  }
});

bot.onText(/^\/broadcast$/, async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;
  if (!(await requireNotMaintenance(msg))) return;
  
  const senderId = msg.from.id.toString();
  const data = loadData();
  const chatId = msg.chat.id;

  try {
    if (!(await cekAkses("owner", msg))) return;

    const now = Math.floor(Date.now() / 1000);
    const lastUse = (data.cooldowns?.broadcast3?.[senderId]) || 0;
    const cooldownMinutes = getGlobalCooldownMinutes();
    const cooldownSeconds = cooldownMinutes * 60;

    if (!isMainOwner(senderId) && (now - lastUse) < cooldownSeconds) {
      const sisa = cooldownSeconds - (now - lastUse);
      return bot.sendMessage(chatId, `<blockquote><b>⏳ COOLDOWN AKTIF</b></blockquote>\n<b>Tunggu ${Math.floor(sisa/60)} menit ${sisa%60} detik lagi.</b>`, { parse_mode: "HTML" });
    }

    if (!msg.reply_to_message) {
      return bot.sendMessage(chatId, `<blockquote><b>⚠️ FORMAT SALAH</b></blockquote>\n<b>Harap reply ke pesan (Teks/Foto/Video) atau salah satu foto dalam ALBUM.</b>`, { parse_mode: "HTML" });
    }

    const reply = msg.reply_to_message;
    const users = [...new Set(data.users || [])].filter(id => id !== senderId);

    if (!isMainOwner(senderId)) {
      if (!data.cooldowns) data.cooldowns = {};
      if (!data.cooldowns.broadcast3) data.cooldowns.broadcast3 = {};
      data.cooldowns.broadcast3[senderId] = now;
      saveData(data);
    }

    await bot.sendMessage(chatId, `<blockquote><b>🚀 MEMULAI BROADCAST...</b></blockquote>\n<i>memproses...</i>`, { parse_mode: "HTML" });

    const sendPayload = async (targetId) => {
      if (reply.media_group_id) {
        await bot.forwardMessage(targetId, chatId, reply.message_id);
      } else {
        await bot.copyMessage(targetId, chatId, reply.message_id, {
          reply_markup: reply.reply_markup
        });
      }
    };

    await sendPayload(chatId);

    let sukses = 0;
    let gagal = 0;

    for (const userId of users) {
      try {
        await sendPayload(userId);
        sukses++;
      } catch {
        gagal++;
      }

      await new Promise(r => setTimeout(r, 300));
    }

    await bot.sendMessage(chatId, `<blockquote><b>✅ BROADCAST SELESAI!</b></blockquote>\n<b>📊 Laporan:</b>\n<b>• Total User:</b> ${users.length}\n<b>✅ Sukses:</b> ${sukses}\n<b>❌ Gagal:</b> ${gagal}\n\n<i>Jeda: ${cooldownMinutes} Menit</i>`, { parse_mode: "HTML" });

    const username = msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name;

    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    bot.sendMessage(CHANNEL_ID, `<blockquote><b>📢 BROADCAST DIGUNAKAN</b></blockquote>
<b>👤 User:</b> ${username}
<b>🆔 ID:</b> <code>${senderId}</code>

<b>📊 Statistik:</b>
• Total User: ${users.length}
• Sukses: ${sukses}
• Gagal: ${gagal}

<b>⏰ Waktu:</b> ${waktu}`, { parse_mode: "HTML" }).catch(() => {});

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, `<blockquote><b>❌ ERROR SISTEM</b></blockquote>`, { parse_mode: "HTML" });
  }
});

bot.onText(/^\/autogb\s*(on|off|status)?$/i, async (msg, match) => {
  if (!(await cekAkses("owner", msg))) return;

  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;
  const arg = (match[1] || "").toLowerCase();

  if (!isAnyOwner(userId))
    return bot.sendMessage(chatId, `<blockquote><b>❌ AKSES DITOLAK</b></blockquote>
<b>Status :</b> <code>Fitur Terkunci</code>
<b>Alasan :</b> <code>Hanya untuk Owner/CEO</code>`, { parse_mode: "HTML" });

  if (!autoForwards[userId])
    autoForwards[userId] = {
      active: false,
      original: null,
      lastSent: 0,
      round: 1,
      username: msg.from.username || "unknown",
    };

  const conf = autoForwards[userId];

  if (arg === "off") {
    conf.active = false;
    return bot.sendMessage(chatId, `<blockquote><b>✅ AUTOFORWARD DIMATIKAN</b></blockquote>
<b>Status :</b> <code>Nonaktif</code>
<b>Aksi   :</b> <code>AutoForward berhenti</code>`, { parse_mode: "HTML" });
  }

  if (arg === "status") {
    const status = conf.active ? "ON" : "OFF";
    const source = conf.original
      ? `(${conf.original.chatId}:${conf.original.messageId})`
      : "Belum diset";

    return bot.sendMessage(
      chatId,
      `<blockquote><b>📊 STATUS AUTOFORWARD</b></blockquote>
<b>Status :</b> <code>${status}</code>
<b>Source :</b> <code>${source}</code>
<b>Putaran :</b> <code>${conf.round}</code>`,
      { parse_mode: "HTML" }
    );
  }

  if (!conf.original)
    return bot.sendMessage(
      chatId,
      `<blockquote><b>❌ BELUM ADA PESAN</b></blockquote>
<b>Status :</b> <code>Pesan Kosong</code>
<b>Solusi :</b> <code>Gunakan /setpesan dulu</code>`,
      { parse_mode: "HTML" }
    );

  conf.active = true;
  bot.sendMessage(chatId, `<blockquote><b>✅ AUTOFORWARD DIAKTIFKAN</b></blockquote>
<b>Status :</b> <code>Aktif (Forward-Only)</code>
<b>Aksi   :</b> <code>AutoForward mulai berjalan</code>`, { parse_mode: "HTML" });
});

setInterval(async () => {
  try {
    const now = Date.now();
    const data = loadData();
    const groups = data.groups || [];
    if (!groups.length) return;

    const cooldownMs = getGlobalCooldownMs();
    const delayPerGroup = 300;

    for (const userId in autoForwards) {
      const conf = autoForwards[userId];
      if (!conf.active || !conf.original) continue;
      if (now - conf.lastSent < cooldownMs) continue;

      conf.lastSent = now;

      const notifStart = `<blockquote><b>🚀 AUTOFORWARD DIMULAI!</b></blockquote>
<b>📋 Detail Putaran:</b>
<b>Jeda Putaran :</b> ${Math.floor(cooldownMs / 60000)} menit
<b>Target Grup :</b> ${groups.length}
<b>Putaran Ke :</b> ${conf.round}
<b>Jeda per Grup :</b> ${delayPerGroup}ms`;

      await bot.sendMessage(userId, notifStart, { parse_mode: "HTML" });

      let sukses = 0;
      let gagal = 0;

      for (const groupId of groups) {
        try {
          await bot.copyMessage(groupId, conf.original.chatId, conf.original.messageId);
          sukses++;
        } catch {
          gagal++;
        }
        await new Promise((r) => setTimeout(r, delayPerGroup));
      }

      const notifDone = `<blockquote><b>✅ AUTOFORWARD SELESAI!</b></blockquote>
<b>📊 Hasil Pengiriman:</b>
<b>Total Grup :</b> ${groups.length}
<b>Sukses :</b> ${sukses}
<b>Gagal :</b> ${gagal}
<b>Putaran ke :</b> ${conf.round}`;

      await bot.sendMessage(userId, notifDone, { parse_mode: "HTML" });

      conf.round++;
    }
  } catch (err) {}
}, 10 * 1000);

bot.onText(/^\/setpesan$/, async (msg) => {
  if (!(await cekAkses("owner", msg))) return;

  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  if (!msg.reply_to_message)
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
<b>Penggunaan :</b> <code>Reply pesan + /setpesan</code>`, { parse_mode: "HTML" });

  autoForwards[userId] = {
    active: false,
    original: {
      chatId: msg.reply_to_message.chat.id,
      messageId: msg.reply_to_message.message_id
    },
    lastSent: 0,
    round: 1,
    username: msg.from.username || "unknown"
  };

  bot.sendMessage(chatId, `<blockquote><b>✅ PESAN DISIMPAN</b></blockquote>
<b>Status :</b> <code>Pesan Tersimpan</code>
<b>Aksi   :</b> <code>Pesan berhasil disimpan</code>`, { parse_mode: "HTML" });
});

bot.onText(/^\/setbc$/, async (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  const isDev = userId === config.DEVELOPER.toString();
  const isCEO = await cekAkses("ceo", msg);

  if (!isCEO && !isDev) {
    return bot.sendMessage(chatId, `<blockquote><b>🔐 Akses Terkunci</b></blockquote>
Fitur ini di khususkan untuk Akses <b>CEO dan Developer</b> jadi anda tidak bisa memakai fitur ini. 

Jika anda ingin mengakses/memakai fitur ini silahkan chat 👇`, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Beli akses CEO? Pencet ini",
              url: `https://t.me/${DEVELOPER.replace('@','')}`
            }
          ]
        ]
      }
    });
  }

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
<b>Penggunaan :</b> <code>Reply pesan yang akan di broadcast + /setbc</code>`, { parse_mode: "HTML" });
  }

  autoForwards[userId] = {
    active: false,
    original: {
      chatId: msg.reply_to_message.chat.id,
      messageId: msg.reply_to_message.message_id
    },
    lastSent: 0,
    username: msg.from.username || "unknown"
  };

  bot.sendMessage(chatId, `<blockquote><b>✅ PESAN DISIMPAN</b></blockquote>
<b>Status :</b> <code>Siap Broadcast</code>
<b>Aksi   :</b> <code>Gunakan /autobc on untuk mulai</code>`, { parse_mode: "HTML" });
});

bot.onText(/^\/autobc\s*(on|off|status)?$/i, async (msg, match) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;
  const arg = (match[1] || "").toLowerCase();

  const isDev = userId === config.DEVELOPER.toString();
  const isCEO = await cekAkses("ceo", msg);

  if (!isCEO && !isDev) {
    const textTolak = `<blockquote><b>🔐 Akses Terkunci</b></blockquote>
Fitur ini di khususkan untuk Akses <b>CEO dan Developer</b> jadi anda tidak bisa memakai fitur ini. 

Jika anda ingin mengakses/memakai fitur ini silahkan chat 👇`;

    const opts = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Beli akses CEO? Pencet ini",
              url: `https://t.me/${DEVELOPER.replace('@','')}`
            }
          ]
        ]
      }
    };

    return bot.sendMessage(chatId, textTolak, opts);
  }

  if (!autoForwards[userId]) {
    autoForwards[userId] = {
      active: false,
      original: null,
      lastSent: 0
    };
  }

  const conf = autoForwards[userId];

  if (arg === "off") {
    conf.active = false;
    return bot.sendMessage(chatId, `<blockquote><b>✅ AUTOBC DIMATIKAN</b></blockquote>`, { parse_mode: "HTML" });
  }

  if (arg === "status") {
    const status = conf.active ? "ON" : "OFF";
    return bot.sendMessage(chatId, `<blockquote><b>📊 STATUS AUTOBC</b></blockquote>\n<b>Status :</b> <code>${status}</code>`, { parse_mode: "HTML" });
  }

  if (!conf.original) {
    return bot.sendMessage(chatId, `<blockquote><b>❌ BELUM ADA PESAN</b></blockquote>\n<b>Solusi :</b> <code>Gunakan /setpesan dulu</code>`, { parse_mode: "HTML" });
  }

  conf.active = true;
  bot.sendMessage(chatId, `<blockquote><b>✅ AUTOBC DIAKTIFKAN</b></blockquote>\n<b>Target :</b> <code>Semua Pengguna Bot</code>`, { parse_mode: "HTML" });
});

bot.onText(/^\/setjeda(?:\s+(\d+))?$/, async (msg, match) => {
  if (!(await cekAkses("utama", msg))) return;

  const senderId = msg.from.id.toString();
  const chatId = msg.chat.id;

  const data = loadData();
  if (!data.settings) data.settings = {};
  if (!data.settings.cooldown) data.settings.cooldown = {};

  const menit = parseInt(match[1]);
  
  if (!match[1]) {
    const current = getGlobalCooldownMinutes();
    return bot.sendMessage(chatId, `<blockquote><b>⚙️ COOLDOWN SAAT INI</b></blockquote>
<b>Status :</b> <code>${current} menit</code>`, { parse_mode: "HTML" });
  }

  if (isNaN(menit) || menit <= 0) {
    const current = getGlobalCooldownMinutes();
    return bot.sendMessage(chatId, `<blockquote><b>⚙️ COOLDOWN SAAT INI</b></blockquote>
<b>Status :</b> <code>${current} menit</code>`, { parse_mode: "HTML" });
  }

  data.settings.cooldown.default = menit;
  saveData(data);

  return bot.sendMessage(chatId, `<blockquote><b>✅ JEDA DIATUR</b></blockquote>
<b>Status :</b> <code>${menit} menit</code>
<b>Aksi   :</b> <code>Jeda berhasil diatur</code>`, { parse_mode: "HTML" });
});

bot.onText(/^\/addceo(?:\s+(\d+))?$/, async (msg, match) => {
  if (!(await cekAkses("utama", msg))) return;
  
  const chatId = msg.chat.id;
  let targetId = msg.reply_to_message ? msg.reply_to_message.from.id.toString() : match[1];

  if (!targetId) {
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
Gunakan contoh:
> /addceo 123456
> atau balas (reply) pesan user lalu ketik /addceo`, { parse_mode: "HTML" });
  }

  const data = loadData();
  if (!Array.isArray(data.ceo)) data.ceo = [];

  targetId = targetId.toString();

  if (data.ceo.includes(targetId)) {
    return bot.sendMessage(chatId, `<blockquote><b>⚠️ USER SUDAH CEO</b></blockquote>
<b>Status :</b> <code>User sudah CEO</code>
<b>User   :</b> <code>${targetId}</code>`, { parse_mode: "HTML" });
  }

  const waktuSekarang = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  data.ceo.push(targetId);
  saveData(data);

  const pelakuNama = msg.from.first_name || '';
  const pelakuUsername = msg.from.username ? `@${msg.from.username}` : 'Tidak ada username';
  const pelakuId = msg.from.id;

  let targetNama = 'User';
  let targetUsername = 'Tidak ada username';
  
  try {
    if (msg.reply_to_message) {
      targetNama = msg.reply_to_message.from.first_name || 'User';
      targetUsername = msg.reply_to_message.from.username ? `@${msg.reply_to_message.from.username}` : 'Tidak ada username';
    } else {
      const targetInfo = await bot.getChat(targetId);
      targetNama = targetInfo.first_name || 'User';
      targetUsername = targetInfo.username ? `@${targetInfo.username}` : 'Tidak ada username';
    }
  } catch (e) {
    }

  if (CHANNEL_ID) {
    const notifikasi = `<blockquote><b>🔔 NOTIFIKASI ADD CEO</b></blockquote>
<b>👤 Pelaku:</b> ${pelakuNama}
<b>📱 Username:</b> ${pelakuUsername}
<b>🆔 ID Pelaku:</b> <code>${pelakuId}</code>

<b>🎯 Target:</b> ${targetNama}
<b>📱 Username:</b> ${targetUsername}
<b>🆔 ID Target:</b> <code>${targetId}</code>

<b>⏱️ Waktu:</b> ${waktuSekarang}`;

    try {
      await bot.sendMessage(CHANNEL_ID, notifikasi, { parse_mode: 'HTML' });
    } catch (err) {}
  }

  bot.sendMessage(chatId, `<blockquote><b>✅ CEO BARU DITAMBAHKAN</b></blockquote>
<b>📋 Detail:</b>
<b>Nama:</b> ${targetNama}
<b>ID:</b> <code>${targetId}</code>
<b>Status:</b> <code>Aktif</code>
<b>Waktu:</b> ${waktuSekarang}`, { parse_mode: "HTML" });
});

bot.onText(/^\/delceo(?:\s+(\d+))?$/, async (msg, match) => {
  if (!(await cekAkses("utama", msg))) return;

  const chatId = msg.chat.id;
  const targetId = msg.reply_to_message ? msg.reply_to_message.from.id.toString() : match[1];

  if (!targetId) {
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
Gunakan contoh:
> <code>/delceo 123456</code>
Atau balas (reply) pesan user yang ingin dihapus.`, { parse_mode: "HTML" });
  }

  const data = loadData();

  if (!Array.isArray(data.ceo) || !data.ceo.includes(targetId)) {
    return bot.sendMessage(chatId, `<blockquote><b>⚠️ USER TIDAK DITEMUKAN</b></blockquote>
<b>Status :</b> <code>User bukan CEO</code>
<b>User   :</b> <code>${targetId}</code>`, { parse_mode: "HTML" });
  }

  const waktuSekarang = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const pelakuNama = msg.from.first_name || '';
  const pelakuUsername = msg.from.username ? `@${msg.from.username}` : 'Tidak ada username';
  const pelakuId = msg.from.id;

  let targetNama = 'User';
  let targetUsername = 'Tidak ada username';
  
  try {
    const targetInfo = await bot.getChat(targetId);
    targetNama = targetInfo.first_name || 'User';
    targetUsername = targetInfo.username ? `@${targetInfo.username}` : 'Tidak ada username';
  } catch (e) {
    if (msg.reply_to_message) {
      targetNama = msg.reply_to_message.from.first_name || 'User';
      targetUsername = msg.reply_to_message.from.username ? `@${msg.reply_to_message.from.username}` : 'Tidak ada username';
    }
  }

  data.ceo = data.ceo.filter(id => id !== targetId);
  saveData(data);

  if (typeof CHANNEL_ID !== 'undefined' && CHANNEL_ID) {
    const notifikasi = `<blockquote><b>🔔 NOTIFIKASI DEL CEO</b></blockquote>
<b>👤 Pelaku:</b> ${pelakuNama}
<b>📱 Username:</b> ${pelakuUsername}
<b>🆔 ID Pelaku:</b> <code>${pelakuId}</code>

<b>🎯 Target:</b> ${targetNama}
<b>📱 Username:</b> ${targetUsername}
<b>🆔 ID Target:</b> <code>${targetId}</code>

<b>⏱️ Waktu:</b> ${waktuSekarang}`;

    try {
      await bot.sendMessage(CHANNEL_ID, notifikasi, { parse_mode: 'HTML' });
    } catch (err) {}
  }

  bot.sendMessage(chatId, `<blockquote><b>✅ CEO DIHAPUS</b></blockquote>
<b>📋 Detail:</b>
<b>Nama:</b> ${targetNama}
<b>ID:</b> <code>${targetId}</code>
<b>Status:</b> <code>Dihapus</code>
<b>Waktu:</b> ${waktuSekarang}`, { parse_mode: "HTML" });
});

bot.onText(/^\/listceo$/, async (msg) => {
  if (!(await cekAkses("utama", msg))) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const ceoList = loadData().ceo || [];

  if (ceoList.length === 0) {
    return bot.sendMessage(chatId, `<blockquote><b>📭 BELUM ADA CEO</b></blockquote>
<b>Status :</b> <code>Daftar Kosong</code>`, { parse_mode: "HTML" });
  }

  const itemsPerPage = 4;
  const totalPages = Math.ceil(ceoList.length / itemsPerPage);
  
  ceoPages[userId] = {
    list: ceoList,
    currentPage: 1,
    totalPages: totalPages,
    itemsPerPage: itemsPerPage,
    chatId: chatId
  };

  await showCeoPage(userId, 1);
});

async function showCeoPage(userId, page) {
  if (!ceoPages[userId]) return;
  
  const data = ceoPages[userId];
  const ceoList = data.list;
  const itemsPerPage = data.itemsPerPage;
  const totalPages = data.totalPages;
  const chatId = data.chatId;
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, ceoList.length);
  const pageItems = ceoList.slice(startIndex, endIndex);
 
  let teks = `<blockquote><b>📋 DAFTAR CEO AKTIF</b></blockquote>
<b>📊 Total:</b> ${ceoList.length} CEO
<b>📄 Halaman:</b> ${page}/${totalPages}\n\n`;
  
  pageItems.forEach((id, index) => {
    const globalIndex = startIndex + index + 1;
    teks += `<b>${globalIndex}.</b> <code>${id}</code>\n`;
  });
  
  const buttons = [];
  
  if (page > 1) {
    buttons.push({ 
      text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", 
      callback_data: `ceo_page_${page - 1}`, 
      style: "primary" 
    });
}

buttons.push({ 
    text: `📄 ${page}/${totalPages}`, 
    callback_data: "ceo_page_current", 
    style: "success" 
});

if (page < totalPages) {
    buttons.push({ 
      text: "⌯ 𝗡𝗲𝘅𝘁", 
      callback_data: `ceo_page_${page + 1}`, 
      style: "primary" 
    });
}

const extraButtons = [
    [
      { 
        text: "↻﻿ 𝗥𝗲𝗳𝗿𝗲𝘀𝗵", 
        callback_data: "ceo_refresh", 
        style: "success" 
      },
      { 
        text: "⌯ 𝗧𝘂𝘁𝘂𝗽", 
        callback_data: "ceo_close", 
        style: "danger" 
      }
    ]
];
  
  if (!data.messageId) {
    const sentMsg = await bot.sendMessage(chatId, teks, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [buttons, ...extraButtons]
      }
    });
    
    ceoPages[userId].messageId = sentMsg.message_id;
  } else {
    try {
      await bot.editMessageText(teks, {
        chat_id: chatId,
        message_id: data.messageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [buttons, ...extraButtons]
        }
      });
    } catch (e) {
      const sentMsg = await bot.sendMessage(chatId, teks, { 
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [buttons, ...extraButtons]
        }
      });
      
      ceoPages[userId].messageId = sentMsg.message_id;
    }
  }

  ceoPages[userId].currentPage = page;
}

bot.onText(/^\/addownjs(?:\s+(\d+))?$/, async (msg, match) => {
  if (!(await cekAkses("ceo", msg))) return;

  const chatId = msg.chat.id;
  let targetId = msg.reply_to_message ? msg.reply_to_message.from.id.toString() : match[1];

  if (!targetId) {
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
Gunakan dengan cara reply user atau ketik:
> /addownjs 123456`, { parse_mode: "HTML" });
  }

  const data = loadData();
  if (!Array.isArray(data.owner)) data.owner = [];

  targetId = targetId.toString();

  if (data.owner.includes(targetId)) {
    return bot.sendMessage(chatId, `<blockquote><b>⚠️ USER SUDAH OWNER</b></blockquote>
<b>User ${targetId}</b> sudah menjadi Owner tambahan.`, { parse_mode: "HTML" });
  }

  const waktuSekarang = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const pelakuNama = msg.from.first_name || '';
  const pelakuUsername = msg.from.username ? `@${msg.from.username}` : 'Tidak ada username';
  const pelakuId = msg.from.id;

  let targetNama = 'User';
  let targetUsername = 'Tidak ada username';

  if (msg.reply_to_message) {
    targetNama = msg.reply_to_message.from.first_name || 'User';
    targetUsername = msg.reply_to_message.from.username ? `@${msg.reply_to_message.from.username}` : 'Tidak ada username';
  } else {
    try {
      const targetInfo = await bot.getChat(targetId);
      targetNama = targetInfo.first_name || 'User';
      targetUsername = targetInfo.username ? `@${targetInfo.username}` : 'Tidak ada username';
    } catch (e) {
    }
  }

  data.owner.push(targetId);
  saveData(data);

  if (CHANNEL_ID) {
    const notifikasi = `<blockquote><b>🔔 NOTIFIKASI ADD OWNER</b></blockquote>
<b>👤 Pelaku:</b> ${pelakuNama}
<b>📱 Username:</b> ${pelakuUsername}
<b>🆔 ID Pelaku:</b> <code>${pelakuId}</code>

<b>🎯 Target:</b> ${targetNama}
<b>📱 Username:</b> ${targetUsername}
<b>🆔 ID Target:</b> <code>${targetId}</code>

<b>⏱️ Waktu:</b> ${waktuSekarang}`;

    try {
      await bot.sendMessage(CHANNEL_ID, notifikasi, { parse_mode: 'HTML' });
    } catch (err) {}
  }

  bot.sendMessage(chatId, `<blockquote><b>✅ OWNER BARU DITAMBAHKAN</b></blockquote>
<b>Target:</b> ${targetNama}
<b>ID:</b> <code>${targetId}</code>
<b>Status:</b> Aktif`, { parse_mode: "HTML" });
});

bot.onText(/^\/delownjs(?:\s+(\d+))?$/, async (msg, match) => {
  if (!(await cekAkses("ceo", msg))) return;
  
  const chatId = msg.chat.id;
  let targetId = msg.reply_to_message ? msg.reply_to_message.from.id.toString() : match[1];

  if (!targetId) {
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
Gunakan contoh:
> <code>/delownjs 123456</code>
Atau balas (reply) pesan user yang ingin dihapus dengan <code>/delownjs</code>`, { parse_mode: "HTML" });
  }

  const data = loadData();

  if (OWNER_IDS.map(String).includes(String(targetId))) {
    return bot.sendMessage(chatId, `<blockquote><b>❌ TIDAK BISA DIHAPUS</b></blockquote>
Tidak bisa menghapus Owner Utama <b>${targetId}</b>.`, { parse_mode: "HTML" });
  }

  if (!data.owner?.includes(targetId)) {
    return bot.sendMessage(chatId, `<blockquote><b>❌ USER BUKAN OWNER</b></blockquote>
<b>User ${targetId}</b> bukan Owner tambahan.`, { parse_mode: "HTML" });
  }

  const waktuSekarang = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const pelakuNama = msg.from.first_name || '';
  const pelakuUsername = msg.from.username ? `@${msg.from.username}` : 'Tidak ada username';
  const pelakuId = msg.from.id;

  let targetNama = 'User';
  let targetUsername = 'Tidak ada username';
  
  try {
    const targetInfo = await bot.getChat(targetId);
    targetNama = targetInfo.first_name || 'User';
    targetUsername = targetInfo.username ? `@${targetInfo.username}` : 'Tidak ada username';
  } catch (e) {
    if (msg.reply_to_message) {
      targetNama = msg.reply_to_message.from.first_name || 'User';
      targetUsername = msg.reply_to_message.from.username ? `@${msg.reply_to_message.from.username}` : 'Tidak ada username';
    }
  }

  data.owner = data.owner.filter(id => id !== targetId);
  saveData(data);

  if (CHANNEL_ID) {
    const notifikasi = `<blockquote><b>🔔 NOTIFIKASI DEL OWNER</b></blockquote>
<b>👤 Pelaku:</b> ${pelakuNama}
<b>📱 Username:</b> ${pelakuUsername}
<b>🆔 ID Pelaku:</b> <code>${pelakuId}</code>

<b>🎯 Target:</b> ${targetNama}
<b>📱 Username:</b> ${targetUsername}
<b>🆔 ID Target:</b> <code>${targetId}</code>

<b>⏱️ Waktu:</b> ${waktuSekarang}`;

    try {
      await bot.sendMessage(CHANNEL_ID, notifikasi, { parse_mode: 'HTML' });
    } catch (err) {}
  }

  bot.sendMessage(chatId, `<blockquote><b>✅ OWNER DIHAPUS</b></blockquote>
<b>Nama:</b> ${targetNama}
<b>ID:</b> <code>${targetId}</code>
<b>Status:</b> Berhasil Dihapus`, { parse_mode: "HTML" });
});

bot.onText(/^\/listownjs$/, async (msg) => {
  if (!(await cekAkses("ceo", msg))) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const owners = loadData().owner || [];

  if (owners.length === 0) {
    return bot.sendMessage(chatId, `<blockquote><b>📭 BELUM ADA OWNER</b></blockquote>
<b>Status :</b> <code>Daftar Kosong</code>`, { parse_mode: "HTML" });
  }

  const itemsPerPage = 4;
  const totalPages = Math.ceil(owners.length / itemsPerPage);
  
  ownerPages[userId] = {
    list: owners,
    currentPage: 1,
    totalPages: totalPages,
    itemsPerPage: itemsPerPage,
    chatId: chatId
  };

  await showOwnerPage(userId, 1);
});

async function showOwnerPage(userId, page) {
  if (!ownerPages[userId]) return;
  
  const data = ownerPages[userId];
  const owners = data.list;
  const itemsPerPage = data.itemsPerPage;
  const totalPages = data.totalPages;
  const chatId = data.chatId;
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, owners.length);
  const pageItems = owners.slice(startIndex, endIndex);
  
  let teks = `<blockquote><b>📋 DAFTAR OWNER TAMBAHAN</b></blockquote>
<b>📊 Total:</b> ${owners.length} Owner
<b>📄 Halaman:</b> ${page}/${totalPages}\n\n`;
  
  pageItems.forEach((id, index) => {
    const globalIndex = startIndex + index + 1;
    teks += `<b>${globalIndex}.</b> <code>${id}</code>\n`;
  });
  
  const buttons = [];
  
  if (page > 1) {
    buttons.push({ text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: `owner_page_${page - 1}`, style: "primary" });
}

buttons.push({ text: `📄 ${page}/${totalPages}`, callback_data: "owner_page_current", style: "success" });

if (page < totalPages) {
    buttons.push({ text: "⌯ 𝗡𝗲𝘅𝘁", callback_data: `owner_page_${page + 1}`, style: "primary" });
}

const extraButtons = [
    [
        { text: "⌯ 𝗥𝗲𝗳𝗿𝗲𝘀𝗵", callback_data: "owner_refresh", style: "success" },
        { text: "⌯ 𝗧𝘂𝘁𝘂𝗽", callback_data: "owner_close", style: "danger" }
    ]
];
  
  if (!data.messageId) {
    const sentMsg = await bot.sendMessage(chatId, teks, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [buttons, ...extraButtons]
      }
    });
    
    ownerPages[userId].messageId = sentMsg.message_id;
  } else {
    try {
      await bot.editMessageText(teks, {
        chat_id: chatId,
        message_id: data.messageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [buttons, ...extraButtons]
        }
      });
    } catch (e) {
      const sentMsg = await bot.sendMessage(chatId, teks, { 
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [buttons, ...extraButtons]
        }
      });
      
      ownerPages[userId].messageId = sentMsg.message_id;
    }
  }
  
  ownerPages[userId].currentPage = page;
}

bot.onText(/^\/addakses(?:\s+(\d+)\s+(\d+)([dh]))?$/, async (msg, match) => {
  if (!(await cekAkses("owner", msg))) return;
  const chatId = msg.chat.id;
  const [ , userId, jumlah, satuan ] = match;

  if (!userId || !jumlah || !satuan)
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
Gunakan contoh:
> /addakses 123456 3d`, { parse_mode: "HTML" });

  const durasi = parseInt(jumlah);
  const now = Math.floor(Date.now() / 1000);
  const detik = satuan === 'd' ? durasi * 86400 : satuan === 'h' ? durasi * 3600 : null;
  if (!detik)
    return bot.sendMessage(chatId, `<blockquote><b>❌ SATUAN SALAH</b></blockquote>
Gunakan <b>d</b> (hari) atau <b>h</b> (jam) sebagai satuan waktu!`, { parse_mode: "HTML" });

  const data = loadData();
  if (!data.premium) data.premium = {};
  const current = data.premium[userId] || now;
  data.premium[userId] = current > now ? current + detik : now + detik;
  saveData(data);

  const expiredTimestamp = data.premium[userId] * 1000;
  const expiredDate = new Date(expiredTimestamp).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const waktuSekarang = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const pelakuNama = msg.from.first_name || '';
  const pelakuUsername = msg.from.username ? `@${msg.from.username}` : 'Tidak ada username';
  const pelakuId = msg.from.id;

  let targetNama = 'User';
  let targetUsername = 'Tidak ada username';
  try {
    const targetInfo = await bot.getChat(userId);
    targetNama = targetInfo.first_name || 'User';
    targetUsername = targetInfo.username ? `@${targetInfo.username}` : 'Tidak ada username';
  } catch (e) {}

  if (CHANNEL_ID) {
    const notifikasi = `<blockquote><b>🔔 NOTIFIKASI ADD AKSES</b></blockquote>
<b>👤 Pelaku:</b> ${pelakuNama}
<b>📱 Username:</b> ${pelakuUsername}
<b>🆔 ID Pelaku:</b> <code>${pelakuId}</code>

<b>🎯 Target:</b> ${targetNama}
<b>📱 Username:</b> ${targetUsername}
<b>🆔 ID Target:</b> <code>${userId}</code>

<b>⏰ Durasi:</b> ${jumlah}${satuan === 'd' ? ' hari' : ' jam'}
<b>📅 Expired:</b> ${expiredDate}
<b>⏱️ Waktu:</b> ${waktuSekarang}`;

    try {
      await bot.sendMessage(CHANNEL_ID, notifikasi, { parse_mode: 'HTML' });
    } catch (err) {}
  }

  bot.sendMessage(chatId, `<blockquote><b>✅ PREMIUM DITAMBAHKAN</b></blockquote>
<b>ID:</b> ${userId}
<b>Durasi:</b> ${jumlah}${satuan}
<b>Status:</b> Aktif`, { parse_mode: "HTML" });
});

bot.onText(/^\/delakses(?:\s+(\d+))?$/, async (msg, match) => {
  if (!(await cekAkses("owner", msg))) return;
  const chatId = msg.chat.id;
  const userId = match[1];

  if (!userId)
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
Gunakan contoh:
> /delakses 123456`, { parse_mode: "HTML" });

  const data = loadData();
  if (!data.premium?.[userId])
    return bot.sendMessage(chatId, `<blockquote><b>❌ USER BUKAN PREMIUM</b></blockquote>
<b>User ${userId}</b> belum Premium.`, { parse_mode: "HTML" });
    
  const expiredTimestamp = data.premium[userId] * 1000;
  const expiredDate = new Date(expiredTimestamp).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const waktuSekarang = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const pelakuNama = msg.from.first_name || '';
  const pelakuUsername = msg.from.username ? `@${msg.from.username}` : 'Tidak ada username';
  const pelakuId = msg.from.id;

  let targetNama = 'User';
  let targetUsername = 'Tidak ada username';
  try {
    const targetInfo = await bot.getChat(userId);
    targetNama = targetInfo.first_name || 'User';
    targetUsername = targetInfo.username ? `@${targetInfo.username}` : 'Tidak ada username';
  } catch (e) {}

  delete data.premium[userId];
  saveData(data);

  if (CHANNEL_ID) {
    const notifikasi = `<blockquote><b>🔔 NOTIFIKASI DEL AKSES</b></blockquote>
<b>👤 Pelaku:</b> ${pelakuNama}
<b>📱 Username:</b> ${pelakuUsername}
<b>🆔 ID Pelaku:</b> <code>${pelakuId}</code>

<b>🎯 Target:</b> ${targetNama}
<b>📱 Username:</b> ${targetUsername}
<b>🆔 ID Target:</b> <code>${userId}</code>

<b>📅 Expired Sebelumnya:</b> ${expiredDate}
<b>⏱️ Waktu:</b> ${waktuSekarang}`;

    try {
      await bot.sendMessage(CHANNEL_ID, notifikasi, { parse_mode: 'HTML' });
    } catch (err) {}
  }

  bot.sendMessage(chatId, `<blockquote><b>✅ PREMIUM DIHAPUS</b></blockquote>
<b>ID:</b> ${userId}
<b>Status:</b> Dihapus`, { parse_mode: "HTML" });
});

bot.onText(/^\/listakses$/, async (msg) => {
  if (!(await cekAkses("owner", msg))) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const data = loadData();
  const now = Math.floor(Date.now() / 1000);

  const activePremium = Object.entries(data.premium || {})
    .filter(([uid, exp]) => exp > now)
    .sort((a, b) => b[1] - a[1]); 

  if (activePremium.length === 0) {
    return bot.sendMessage(chatId, `<blockquote><b>📭 BELUM ADA PREMIUM AKTIF</b></blockquote>
<b>Status :</b> <code>Tidak ada user premium aktif</code>`, { parse_mode: "HTML" });
  }

  const itemsPerPage = 4;
  const totalPages = Math.ceil(activePremium.length / itemsPerPage);
  
  premiumPages[userId] = {
    list: activePremium,
    currentPage: 1,
    totalPages: totalPages,
    itemsPerPage: itemsPerPage,
    chatId: chatId,
    now: now
  };

  await showPremiumPage(userId, 1);
});

async function showPremiumPage(userId, page) {
  if (!premiumPages[userId]) return;
  
  const data = premiumPages[userId];
  const premiumList = data.list;
  const itemsPerPage = data.itemsPerPage;
  const totalPages = data.totalPages;
  const chatId = data.chatId;
  const now = data.now;
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, premiumList.length);
  const pageItems = premiumList.slice(startIndex, endIndex);
  
  let teks = `<blockquote><b>📋 DAFTAR USER PREMIUM AKTIF</b></blockquote>
<b>📊 Total:</b> ${premiumList.length} User
<b>📄 Halaman:</b> ${page}/${totalPages}\n\n`;
  
  pageItems.forEach(([uid, exp], index) => {
    const globalIndex = startIndex + index + 1;
    const sisaDetik = exp - now;
    const sisaHari = Math.floor(sisaDetik / 86400);
    const sisaJam = Math.floor((sisaDetik % 86400) / 3600);
    const sisaMenit = Math.floor((sisaDetik % 3600) / 60);
    
    teks += `<b>${globalIndex}.</b> <code>${uid}</code>\n`;
    teks += `   <b>Expired:</b> ${new Date(exp * 1000).toLocaleString('id-ID')}\n`;
    teks += `   <b>Sisa:</b> ${sisaHari} hari ${sisaJam} jam ${sisaMenit} menit\n\n`;
  });
  
  const buttons = [];
  
  if (page > 1) {
  buttons.push({ 
    text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", 
    callback_data: `premium_page_${page - 1}`, 
    style: "primary" 
  });
}

buttons.push({ 
  text: `📄 ${page}/${totalPages}`, 
  callback_data: "premium_page_current", 
  style: "success" 
});

if (page < totalPages) {
  buttons.push({ 
    text: "⌯ 𝗡𝗲𝘅𝘁", 
    callback_data: `premium_page_${page + 1}`, 
    style: "primary" 
  });
}

const extraButtons = [
  [
    { 
      text: "⌯ 𝗥𝗲𝗳𝗿𝗲𝘀𝗵", 
      callback_data: "premium_refresh", 
      style: "success" 
    },
    { 
      text: "⌯ 𝗧𝘂𝘁𝘂𝗽", 
      callback_data: "premium_close", 
      style: "danger" 
    }
  ]
];
  
  if (!data.messageId) {
    const sentMsg = await bot.sendMessage(chatId, teks, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [buttons, ...extraButtons]
      }
    });
    
    premiumPages[userId].messageId = sentMsg.message_id;
  } else {
    try {
      await bot.editMessageText(teks, {
        chat_id: chatId,
        message_id: data.messageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [buttons, ...extraButtons]
        }
      });
    } catch (e) {
      const sentMsg = await bot.sendMessage(chatId, teks, { 
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [buttons, ...extraButtons]
        }
      });
      
      premiumPages[userId].messageId = sentMsg.message_id;
    }
  }
  
  premiumPages[userId].currentPage = page;
}

bot.onText(/^\/addbl(?:\s+(\d+))?$/, async (msg, match) => {
  if (!(await cekAkses("owner", msg))) return;
  const chatId = msg.chat.id;
  const targetId = match[1];

  if (!targetId)
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
Gunakan contoh:
> /addbl 123456`, { parse_mode: "HTML" });

  const data = loadData();
  if (!data.blacklist) data.blacklist = [];
  if (data.blacklist.includes(targetId))
    return bot.sendMessage(chatId, `<blockquote><b>⚠️ USER SUDAH BLACKLIST</b></blockquote>
<b>User ${targetId}</b> sudah ada di blacklist.`, { parse_mode: "HTML" });

  const waktuSekarang = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const pelakuNama = msg.from.first_name || '';
  const pelakuUsername = msg.from.username ? `@${msg.from.username}` : 'Tidak ada username';
  const pelakuId = msg.from.id;

  let targetNama = 'User';
  let targetUsername = 'Tidak ada username';
  try {
    const targetInfo = await bot.getChat(targetId);
    targetNama = targetInfo.first_name || 'User';
    targetUsername = targetInfo.username ? `@${targetInfo.username}` : 'Tidak ada username';
  } catch (e) {}

  data.blacklist.push(targetId);
  saveData(data);

  if (CHANNEL_ID) {
    const notifikasi = `<blockquote><b>🔔 NOTIFIKASI ADD BLACKLIST</b></blockquote>
<b>👤 Pelaku:</b> ${pelakuNama}
<b>📱 Username:</b> ${pelakuUsername}
<b>🆔 ID Pelaku:</b> <code>${pelakuId}</code>

<b>🎯 Target:</b> ${targetNama}
<b>📱 Username:</b> ${targetUsername}
<b>🆔 ID Target:</b> <code>${targetId}</code>

<b>⏱️ Waktu:</b> ${waktuSekarang}`;

    try {
      await bot.sendMessage(CHANNEL_ID, notifikasi, { parse_mode: 'HTML' });
    } catch (err) {}
  }

  bot.sendMessage(chatId, `<blockquote><b>✅ USER DIBLACKLIST</b></blockquote>
<b>ID:</b> ${targetId}
<b>Status:</b> Ditambahkan`, { parse_mode: "HTML" });
});

bot.onText(/^\/delbl(?:\s+(\d+))?$/, async (msg, match) => {
  if (!(await cekAkses("owner", msg))) return;
  const chatId = msg.chat.id;
  const targetId = match[1];

  if (!targetId)
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
Gunakan contoh:
> /delbl 123456`, { parse_mode: "HTML" });

  const data = loadData();

  if (!data.blacklist?.includes(targetId))
    return bot.sendMessage(chatId, `<blockquote><b>❌ USER TIDAK DITEMUKAN</b></blockquote>
<b>User ${targetId}</b> tidak ditemukan dalam blacklist.`, { parse_mode: "HTML" });

  const waktuSekarang = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const pelakuNama = msg.from.first_name || '';
  const pelakuUsername = msg.from.username ? `@${msg.from.username}` : 'Tidak ada username';
  const pelakuId = msg.from.id;

  let targetNama = 'User';
  let targetUsername = 'Tidak ada username';
  try {
    const targetInfo = await bot.getChat(targetId);
    targetNama = targetInfo.first_name || 'User';
    targetUsername = targetInfo.username ? `@${targetInfo.username}` : 'Tidak ada username';
  } catch (e) {}

  data.blacklist = data.blacklist.filter(id => id !== targetId);
  saveData(data);

  if (CHANNEL_ID) {
    const notifikasi = `<blockquote><b>🔔 NOTIFIKASI DEL BLACKLIST</b></blockquote>
<b>👤 Pelaku:</b> ${pelakuNama}
<b>📱 Username:</b> ${pelakuUsername}
<b>🆔 ID Pelaku:</b> <code>${pelakuId}</code>

<b>🎯 Target:</b> ${targetNama}
<b>📱 Username:</b> ${targetUsername}
<b>🆔 ID Target:</b> <code>${targetId}</code>

<b>⏱️ Waktu:</b> ${waktuSekarang}`;

    try {
      await bot.sendMessage(CHANNEL_ID, notifikasi, { parse_mode: 'HTML' });
    } catch (err) {}
  }

  bot.sendMessage(chatId, `<blockquote><b>✅ USER DIHAPUS DARI BLACKLIST</b></blockquote>
<b>ID:</b> ${targetId}
<b>Status:</b> Dihapus`, { parse_mode: "HTML" });
});

bot.onText(/^\/listbl$/, async (msg) => {
  if (!(await cekAkses("owner", msg))) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const list = loadData().blacklist || [];

  if (list.length === 0) {
    return bot.sendMessage(chatId, `<blockquote><b>📭 BLACKLIST KOSONG</b></blockquote>
<b>Status :</b> <code>Tidak ada user terblokir</code>`, { parse_mode: "HTML" });
  }

  const itemsPerPage = 4;
  const totalPages = Math.ceil(list.length / itemsPerPage);
  
  blacklistPages[userId] = {
    list: list,
    currentPage: 1,
    totalPages: totalPages,
    itemsPerPage: itemsPerPage,
    chatId: chatId
  };

  await showBlacklistPage(userId, 1);
});

async function showBlacklistPage(userId, page) {
  if (!blacklistPages[userId]) return;
  
  const data = blacklistPages[userId];
  const blacklist = data.list;
  const itemsPerPage = data.itemsPerPage;
  const totalPages = data.totalPages;
  const chatId = data.chatId;
  
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, blacklist.length);
  const pageItems = blacklist.slice(startIndex, endIndex);
  
  let teks = `<blockquote><b>📋 DAFTAR BLACKLIST</b></blockquote>
<b>📊 Total:</b> ${blacklist.length} User
<b>📄 Halaman:</b> ${page}/${totalPages}\n\n`;
  
  pageItems.forEach((id, index) => {
    const globalIndex = startIndex + index + 1;
    teks += `<b>${globalIndex}.</b> <code>${id}</code>\n`;
  });
  
  const buttons = [];
  
  if (page > 1) {
    buttons.push({ text: "↻﻿ 𝗞𝗲𝗺𝗯𝗮𝗹𝗶", callback_data: `blacklist_page_${page - 1}` });
  }
  
  buttons.push({ text: `📄 ${page}/${totalPages}`, callback_data: "blacklist_page_current" });
  
  if (page < totalPages) {
    buttons.push({ text: "⌯ 𝗡𝗲𝘅𝘁", callback_data: `blacklist_page_${page + 1}` });
  }
  
  const extraButtons = [
    [
      { text: "⌯ 𝗥𝗲𝗳𝗿𝗲𝘀𝗵", callback_data: "blacklist_refresh" },
      { text: "⌯ 𝗧𝘂𝘁𝘂𝗽", callback_data: "blacklist_close" }
    ]
  ];
  
  if (!data.messageId) {
    const sentMsg = await bot.sendMessage(chatId, teks, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [buttons, ...extraButtons]
      }
    });
    
    blacklistPages[userId].messageId = sentMsg.message_id;
  } else {
    try {
      await bot.editMessageText(teks, {
        chat_id: chatId,
        message_id: data.messageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [buttons, ...extraButtons]
        }
      });
    } catch (e) {
      const sentMsg = await bot.sendMessage(chatId, teks, { 
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [buttons, ...extraButtons]
        }
      });
      
      blacklistPages[userId].messageId = sentMsg.message_id;
    }
  }
  
  blacklistPages[userId].currentPage = page;
}

bot.onText(/^\/update$/, async (msg) => {
  if (!(await cekAkses("utama", msg))) return;

  const senderId = msg.from.id.toString();
  const chatId = msg.chat.id;
  
  if (!msg.reply_to_message || !msg.reply_to_message.document) {
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
<b>Penggunaan :</b> <code>Reply file JS + /update</code>`, { parse_mode: "HTML" });
  }

  const fileId = msg.reply_to_message.document.file_id;
  const fileName = msg.reply_to_message.document.file_name || "update.js";
  const filePath = `./${fileName}`;

  try {
    const fileLink = await bot.getFileLink(fileId);
    const https = require("https");
    const fileStream = fs.createWriteStream(filePath);

    https.get(fileLink, (res) => {
      res.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close();

        const oldPath = __filename;
        fs.copyFileSync(filePath, oldPath);
        bot.sendMessage(chatId, `<blockquote><b>✅ UPDATE BERHASIL</b></blockquote>
<b>Status :</b> <code>File diperbarui</code>
<b>File   :</b> <code>${fileName}</code>
<b>Aksi   :</b> <code>Restarting...</code>`, { parse_mode: "HTML" });

        setTimeout(() => {
          process.exit(1); 
        }, 1500);
      });
    }).on("error", (err) => {
      bot.sendMessage(chatId, `<blockquote><b>❌ GAGAL UNDUH</b></blockquote>
<b>Status :</b> <code>Update gagal</code>
<b>Error  :</b> <code>Gagal mengunduh file</code>`, { parse_mode: "HTML" });
    });
  } catch (err) {
    bot.sendMessage(chatId, `<blockquote><b>❌ ERROR UPDATE</b></blockquote>
<b>Status :</b> <code>Update gagal</code>
<b>Error  :</b> <code>Terjadi kesalahan</code>`, { parse_mode: "HTML" });
  }
});

bot.onText(/^\/setmaintenance(?:\s+(on|off))?$/, async (msg, match) => {
  if (!(await cekAkses("utama", msg))) return;

  const senderId = msg.from.id.toString();
  const chatId = msg.chat.id;

  const arg = match[1];
  if (!arg) {
    const status = isMaintenance() ? "ON (Aktif)" : "OFF (Nonaktif)";
    return bot.sendMessage(chatId, `<blockquote><b>⚙️ STATUS MAINTENANCE</b></blockquote>
<b>Status :</b> <code>${status}</code>`, { parse_mode: "HTML" });
  }

  if (arg.toLowerCase() === "on") {
    setMaintenance(true);
    return bot.sendMessage(chatId, `<blockquote><b>🔧 MAINTENANCE DIAKTIFKAN</b></blockquote>
<b>Status :</b> <code>AKTIF</code>
<b>Aksi   :</b> <code>Maintenance mode aktif</code>`, { parse_mode: "HTML" });
  } else if (arg.toLowerCase() === "off") {
    setMaintenance(false);
    return bot.sendMessage(chatId, `<blockquote><b>✅ MAINTENANCE DIMATIKAN</b></blockquote>
<b>Status :</b> <code>NONAKTIF</code>
<b>Aksi   :</b> <code>Maintenance mode dimatikan</code>`, { parse_mode: "HTML" });
  } else {
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
<b>Penggunaan :</b> <code>/setmaintenance on/off</code>`, { parse_mode: "HTML" });
  }
});

bot.onText(/\/searid(?: (.+))?/, withRequireJoin(async (msg, match) => {
  const chatId = msg.chat.id;
  const targetId = match[1] || msg.from.id.toString(); // Jika tidak ada input ID, cek ID diri sendiri

  // Muat data terbaru dari data.json
  const data = loadData();
  
  // Fungsi pengecekan (mengambil logika dari fungsi yang sudah ada)
  const isMain = isMainOwner(targetId);
  const isCeo = isCEO(targetId);
  const isOwn = isAdditionalOwner(targetId);
  const isPrem = isPremium(targetId);

  let statusText = "User Biasa";
  if (isMain) statusText = "Developer / Owner Utama";
  else if (isCeo) statusText = "CEO";
  else if (isOwn) statusText = "Owner Tambahan";
  else if (isPrem) statusText = "User Premium";

  let expText = "Tidak Ada";
  if (isPrem) {
    const expDate = new Date(data.premium[targetId] * 1000);
    expText = expDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + " WIB";
  }

  const caption = `
<blockquote>🔍 <b>HASIL SEARCH ID</b></blockquote>
─────────────────────
<b>🆔 ID :</b> <code>${targetId}</code>
<b>🎭 Status :</b> ${statusText}
─────────────────────l`;

  bot.sendMessage(chatId, caption, { parse_mode: "HTML" });
}));

bot.onText(/^[./!]info$/, withRequireJoin(async (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;

  const isCeo = isCEO(userId);
  const isOwner = isMainOwner(userId) || isAdditionalOwner(userId);
  const isPrem = isPremium(userId);

  const statusPremium = (isCeo || isOwner || isPrem) ? "✅" : "❌";
  const statusOwner = (isCeo || isOwner) ? "✅" : "❌";
  const statusCeo = isCeo ? "✅" : "❌";

  const caption = `
<blockquote>📊 𝗜𝗡𝗙𝗢 𝗔𝗞𝗦𝗘𝗦 𝗨𝗦𝗘𝗥</blockquote>
─────────────────────
👋 Halo, <b>${firstName}</b>!
🆔 ID: <code>${userId}</code>

<blockquote>｢ 𝗦𝗧𝗔𝗧𝗨𝗦 𝗔𝗞𝗦𝗘𝗦 ｣</blockquote>
───
│➥ Akses Premium  ${statusPremium}
│➥ Akses Owner    ${statusOwner}
│➥ Akses Ceo      ${statusCeo}
───
─────────────────────
<blockquote>Multi Jasher Vvip</blockquote>`;

  await bot.sendMessage(chatId, caption, { parse_mode: "HTML" });
}));

bot.onText(/^\/cekid$/, async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;
  if (!(await requireNotMaintenance(msg))) return;
  if (!(await requireJoin(msg))) return;
  
  const chatId = msg.chat.id;
  const user = msg.from;

  try {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const username = user.username ? `@${user.username}` : '-';
    const userId = user.id.toString();
    const today = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const dcId = (user.id >> 27) & 7;
    
    const isTelegramPremium = user.is_premium || false;
    const telegramStatus = isTelegramPremium ? 'Telegram Premium' : 'Reguler';
    
    let photoUrl = null;
    try {
      const photos = await bot.getUserProfilePhotos(user.id, { limit: 1 });
      if (photos.total_count > 0) {
        const fileId = photos.photos[0][0].file_id;
        const file = await bot.getFile(fileId);
        photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      }
    } catch (e) {}

    const canvas = createCanvas(1200, 675);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    
    const cardX = 60;
    const cardY = 60;
    const cardWidth = canvas.width - 120;
    const cardHeight = canvas.height - 120;
    
    if (!ctx.roundRect) {
      ctx.roundRect = function(x, y, width, height, radius) {
        if (width < 2 * radius) radius = width / 2;
        if (height < 2 * radius) radius = height / 2;
        this.beginPath();
        this.moveTo(x + radius, y);
        this.arcTo(x + width, y, x + width, y + height, radius);
        this.arcTo(x + width, y + height, x, y + height, radius);
        this.arcTo(x, y + height, x, y, radius);
        this.arcTo(x, y, x + width, y, radius);
        this.closePath();
        return this;
      }
    }
    
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 30);
    ctx.fill();
    ctx.stroke();

    ctx.filter = 'blur(5px)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(cardX + 20, cardY + 20, cardWidth - 40, cardHeight - 40);
    ctx.filter = 'none';

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ID CARD TELEGRAM', canvas.width / 2, cardY + 80);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 100, cardY + 110);
    ctx.lineTo(cardWidth - 100, cardY + 110);
    ctx.stroke();

    const photoX = cardX + 80;
    const photoY = cardY + 160;
    const photoSize = 280;

    if (photoUrl) {
      try {
        const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
        const avatar = await loadImage(response.data);
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(photoX + photoSize/2, photoY + photoSize/2, photoSize/2, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        
        ctx.drawImage(avatar, photoX, photoY, photoSize, photoSize);
        ctx.restore();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(photoX + photoSize/2, photoY + photoSize/2, photoSize/2, 0, Math.PI * 2, true);
        ctx.stroke();
      } catch (e) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.arc(photoX + photoSize/2, photoY + photoSize/2, photoSize/2, 0, Math.PI * 2, true);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.arc(photoX + photoSize/2, photoY + photoSize/2, photoSize/2, 0, Math.PI * 2, true);
      ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fullName || 'Anonymous', photoX + photoSize/2, photoY + photoSize + 60);

    const infoX = photoX + photoSize + 80;
    const infoY = photoY;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Detail Information :', infoX, infoY);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(infoX, infoY + 10);
    ctx.lineTo(infoX + 400, infoY + 10);
    ctx.stroke();

    const details = [
      { label: 'Id Telegram', value: userId },
      { label: 'Username', value: username },
      { label: 'Tanggal', value: today },
      { label: 'DC ID', value: dcId },
      { label: 'Status', value: telegramStatus }
    ];

    let yOffset = infoY + 70;
    const rowHeight = 55;

    details.forEach(detail => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '26px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`${detail.label}:`, infoX, yOffset);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
      ctx.fillText(detail.value, infoX + 200, yOffset);
      
      yOffset += rowHeight;
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'italic 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`Generated by ${DEVELOPER}`, canvas.width / 2, canvas.height - 80);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 10; j++) {
        ctx.beginPath();
        ctx.arc(100 + i * 60, 100 + j * 60, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const buffer = canvas.toBuffer('image/png');
    
    const caption = `<blockquote><b>🪪 KARTU IDENTITAS</b></blockquote>
<b>📋 Informasi User:</b>
<b>Nama :</b> ${fullName}
<b>User ID :</b> <code>${userId}</code>
<b>Username :</b> ${username}
<b>Tanggal :</b> ${today}
<b>DC ID :</b> ${dcId}
<b>Status :</b> ${telegramStatus}`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          {
            text: `👤 ${fullName || 'Profil User'}`,
            url: `tg://user?id=${userId}`
          }
        ]
      ]
    };

    await bot.sendPhoto(chatId, buffer, {
      caption: caption,
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard
    });

  } catch (error) {
    await bot.sendMessage(chatId, `<blockquote><b>❌ GAGAL MEMBUAT ID CARD</b></blockquote>
<b>Status :</b> <code>Proses gagal</code>
<b>Solusi :</b> <code>Coba lagi nanti</code>`, { parse_mode: "HTML" });
  }
});

bot.onText(/\/req (.+)/, withRequireJoin(async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const pesanRequest = match[1];
    const CHANNEL_RQ = config.CHANNEL_RQ;

    const data = loadData();
    const menitJeda = (data.settings && data.settings.cooldown && data.settings.cooldown.default) 
                      ? data.settings.cooldown.default 
                      : 1; 

    const SEKARANG = Date.now();
    const DURASI_COOLDOWN = menitJeda * 60 * 1000;

    if (cooldowns.has(userId)) {
        const waktuSelesai = cooldowns.get(userId) + DURASI_COOLDOWN;
        if (SEKARANG < waktuSelesai) {
            const sisaDetikTotal = Math.ceil((waktuSelesai - SEKARANG) / 1000);
            const m = Math.floor(sisaDetikTotal / 60);
            const s = sisaDetikTotal % 60;
            return bot.sendMessage(chatId, `⏳ Mohon tunggu <b>${m}m ${s}s</b> lagi sebelum mengirim request kembali.`, { parse_mode: 'HTML' });
        }
    }

    const filterPattern = /(https?:\/\/[^\s]+|t\.me\/[^\s]+|@[^\s]+)/gi;
    if (filterPattern.test(pesanRequest)) {
        return bot.sendMessage(chatId, "❌ <b>Request Ditolak!</b>\nPesan tidak boleh mengandung <b>Link</b> atau <b>Username (@)</b>. Harap kirim pesan teks saja.", { parse_mode: 'HTML' });
    }

    if (!CHANNEL_RQ) {
        return bot.sendMessage(chatId, "❌ Fitur Request belum dikonfigurasi oleh owner.");
    }

    const firstName = msg.from.first_name;
    const lastName = msg.from.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();
    const usernameTag = msg.from.username ? `@${msg.from.username}` : "Tidak ada username";

    const teksKeChannel = `<blockquote>📝 Request Baru Dari User</blockquote>
─────────────────
<b>👤 Nama :</b> ${fullName}
<b>♻️ Username :</b> ${usernameTag}
<b>🆔 Id Telegram :</b> <code>${userId}</code>
<b>💬 Pesan :</b>
${pesanRequest}
─────────────────`;

    const opsiPesan = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "Owner", url: `https://t.me/${config.DEVELOPER.replace('@', '')}` },
                    { text: "Bot", url: `https://t.me/${config.BOT_JASHER.replace('@', '')}` }
                ],
                [
                    { text: "Group", url: `https://t.me/${config.CHANNEL_USERNAME2.replace('@', '')}` },
                    { text: "Channel", url: `https://t.me/${config.CHANNEL_USERNAME.replace('@', '')}` }
                ]
            ]
        }
    };

    try {
        const profilePhotos = await bot.getUserProfilePhotos(userId, { limit: 1 });
        
        if (profilePhotos.total_count > 0) {
            const photoId = profilePhotos.photos[0][0].file_id;
            await bot.sendPhoto(CHANNEL_RQ, photoId, { caption: teksKeChannel, ...opsiPesan });
        } else {
            await bot.sendMessage(CHANNEL_RQ, teksKeChannel, opsiPesan);
        }

        cooldowns.set(userId, SEKARANG);

        bot.sendMessage(chatId, `<blockquote>✅ 𝗥𝗘𝗤𝗨𝗘𝗦𝗧 𝗧𝗘𝗥𝗞𝗜𝗥𝗜𝗠</blockquote>\n\n` +
            `Halo <b>${firstName}</b>, pesan Anda telah diteruskan ke channel.`, { parse_mode: 'HTML' });

    } catch (err) {
        console.error("Gagal mengirim request:", err);
        bot.sendMessage(chatId, "❌ Terjadi kesalahan saat mengirim request.");
    }
}));

bot.onText(/^\/tourl$/, async (msg) => {
  if (!(await requireNotBlacklisted(msg))) return;
  if (!(await requireNotMaintenance(msg))) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  if (!msg.reply_to_message || (!msg.reply_to_message.document && !msg.reply_to_message.photo && !msg.reply_to_message.video)) {
    return bot.sendMessage(
      chatId,
      `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
<b>Penggunaan :</b> <code>Reply file/foto/video + /tourl</code>`,
      { reply_to_message_id: msg.message_id, parse_mode: "HTML" }
    );
  }

  const repliedMsg = msg.reply_to_message;
  let fileId, fileName;

  if (repliedMsg.document) {
    fileId = repliedMsg.document.file_id;
    fileName = repliedMsg.document.file_name || `file_${Date.now()}`;
  } else if (repliedMsg.photo) {
    fileId = repliedMsg.photo[repliedMsg.photo.length - 1].file_id;
    fileName = `photo_${Date.now()}.jpg`;
  } else if (repliedMsg.video) {
    fileId = repliedMsg.video.file_id;
    fileName = `video_${Date.now()}.mp4`;
  }

  try {
    const processingMsg = await bot.sendMessage(
      chatId,
      `<blockquote><b>⏳ MENGUPLOAD KE CATBOX</b></blockquote>
<b>Status :</b> <code>Sedang mengupload...</code>
<b>File   :</b> <code>${fileName}</code>`,
      { reply_to_message_id: msg.message_id, parse_mode: "HTML" }
    );

    const fileLink = await bot.getFileLink(fileId);
    const response = await axios.get(fileLink, { responseType: "stream" });

    const FormData = require("form-data");
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", response.data, {
      filename: fileName,
      contentType: response.headers["content-type"]
    });

    const { data: catboxUrl } = await axios.post("https://catbox.moe/user/api.php", form, {
      headers: form.getHeaders()
    });

    await bot.editMessageText(
    `<blockquote><b>✅ UPLOAD BERHASIL!</b></blockquote>
<b>📁 File:</b> <code>${fileName}</code>
<b>🔗 URL:</b> <code>${catboxUrl}</code>`,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "HTML"
      }
    );
  } catch (error) {
    bot.sendMessage(chatId, `<blockquote><b>❌ GAGAL UPLOAD</b></blockquote>
<b>Status :</b> <code>Upload gagal</code>
<b>Solusi :</b> <code>Coba lagi nanti</code>`, { parse_mode: "HTML" });
  }
});

// FITUR FOTOBLUR
bot.onText(/\/fotoblur/, withRequireJoin(async (msg) => {
  const chatId = msg.chat.id;
  const replyMsg = msg.reply_to_message;

  // Cek apakah perintah membalas pesan (reply)
  if (!replyMsg) {
    return bot.sendMessage(chatId, "⚠️ Silakan balas (reply) sebuah foto dengan perintah /fotoblur", { reply_to_message_id: msg.message_id });
  }

  // Cek apakah yang dibalas adalah foto
  if (!replyMsg.photo) {
    return bot.sendMessage(chatId, "❌ Pesan yang kamu balas bukan merupakan foto.", { reply_to_message_id: msg.message_id });
  }

  try {
    await bot.sendMessage(chatId, "⏳ Sedang memproses efek blur...", { reply_to_message_id: msg.message_id });

    // Ambil file ID foto (ukuran terbaik)
    const fileId = replyMsg.photo[replyMsg.photo.length - 1].file_id;
    const fileUrl = await bot.getFileLink(fileId);

    // Load gambar menggunakan canvas
    const img = await loadImage(fileUrl);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    // Gambar foto asli ke canvas
    ctx.drawImage(img, 0, 0);

    // Terapkan efek blur menggunakan filter canvas
    ctx.filter = 'blur(10px)'; // Anda bisa mengatur tingkat blur di sini
    ctx.drawImage(canvas, 0, 0);

    // Konversi ke Buffer
    const buffer = canvas.toBuffer('image/png');

    // Kirim kembali foto yang sudah blur
    await bot.sendPhoto(chatId, buffer, {
      caption: "✅ Efek blur berhasil diterapkan!",
      reply_to_message_id: msg.message_id
    });

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Terjadi kesalahan saat memproses foto.");
  }
}));

bot.onText(/^\/(cekakses|status)(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const targetId = match[2] ? match[2].trim() : msg.from.id.toString();
  const data = loadData(); //

  let status = "User Biasa";
  let masaAktif = "Permanen";
  let detailLevel = "Gratis";

  const isMain = isMainOwner(targetId); //
  const isCeo = isCEO(targetId); //
  const isOwn = isAdditionalOwner(targetId); //
  const isPrem = isPremium(targetId); //

  if (isMain) {
    status = "Developer / Main Owner";
    detailLevel = "Utama";
  } else if (isCeo) {
    status = "CEO Bot";
    detailLevel = "CEO";
  } else if (isOwn) {
    status = "Owner Tambahan";
    detailLevel = "Owner";
  } else if (isPrem) {
    status = "Premium User";
    detailLevel = "Premium";
    
    // Hitung sisa waktu premium
    const expTimestamp = data.premium[targetId]; //
    const nowSec = Math.floor(Date.now() / 1000);
    const sisaDetik = expTimestamp - nowSec;

    if (sisaDetik > 0) {
      const hari = Math.floor(sisaDetik / 86400);
      const jam = Math.floor((sisaDetik % 86400) / 3600);
      const menit = Math.floor((sisaDetik % 3600) / 60);
      masaAktif = `${hari} hari, ${jam} jam, ${menit} menit`;
    } else {
      masaAktif = "Sudah Berakhir";
    }
  }

  const pesan = `<blockquote><b>📊 INFORMASI AKSES USER</b></blockquote>

<b>🆔 User ID:</b> <code>${targetId}</code>
<b>🛡️ Status:</b> <code>${status}</code>
<b>🔑 Level:</b> <code>${detailLevel}</code>
<b>⏳ Masa Aktif:</b> <code>${masaAktif}</code>

<i>Gunakan <code>/cekakses [id]</code> untuk mengecek ID orang lain.</i>`;

  await bot.sendMessage(chatId, pesan, { parse_mode: "HTML" });
});

function getHashRate(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; 
  }
  return (Math.abs(hash) % 100) + 1;
}

bot.onText(/^\/rate$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.first_name;

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "❌ <b>Gagal!</b>\nMohon gunakan perintah ini dengan cara <b>membalas (reply)</b> pada pesan yang ingin dinilai.", { 
      parse_mode: "HTML",
      reply_to_message_id: msg.message_id 
    });
  }

  const repliedMsg = msg.reply_to_message;
  let targetName = "";
  let uniqueKey = "";

  if (repliedMsg.text) {
    targetName = repliedMsg.text;
    uniqueKey = repliedMsg.text; 
  } else if (repliedMsg.audio) {
    targetName = `Musik: ${repliedMsg.audio.performer || "Unknown"} - ${repliedMsg.audio.title || "Unknown"}`;
    uniqueKey = repliedMsg.audio.file_unique_id;
  } else if (repliedMsg.voice) {
    targetName = "Pesan Suara (Voice Note) 🎤";
    uniqueKey = repliedMsg.voice.file_unique_id;
  } else if (repliedMsg.document) {
    targetName = `File: ${repliedMsg.document.file_name}`;
    uniqueKey = repliedMsg.document.file_unique_id;
  } else if (repliedMsg.photo) {
    targetName = "Foto / Gambar 📸";
    uniqueKey = repliedMsg.photo[repliedMsg.photo.length - 1].file_unique_id;
  } else if (repliedMsg.video) {
    targetName = "Video 🎥";
    uniqueKey = repliedMsg.video.file_unique_id;
  } else if (repliedMsg.sticker) {
    targetName = "Sticker 💬";
    uniqueKey = repliedMsg.sticker.file_unique_id;
  } else {
    targetName = "Konten Media";
    uniqueKey = "unknown_media";
  }

  const rating = getHashRate(uniqueKey);
  
  let feedback = "";
  if (rating <= 30) {
    feedback = "Masih kurang banget, coba diperbaiki lagi kualitasnya biar lebih mantap! 🛠️";
  } else if (rating <= 60) {
    feedback = "Sudah lumayan, tapi masih ada yang perlu dipoles sedikit lagi biar makin oke. 😉";
  } else if (rating <= 85) {
    feedback = "Ini sudah bagus! Sudah cukup layak untuk digunakan atau dipublikasikan. 👍";
  } else {
    feedback = "Gokil! Ini sudah sempurna banget, nggak perlu ada yang diubah lagi. Sikat! 💎";
  }

  const caption = `
<blockquote>📊 <b>HASIL PENILAIAN</b></blockquote>
─────────────────
<b>👤 Nama   :</b> ${username}
<b>🆔 Id     :</b> <code>${userId}</code>
<b>📦 Objek   :</b> <code>${targetName.substring(0, 40)}${targetName.length > 40 ? '...' : ''}</code>
<b>📈 Rate    :</b> <b>${rating}%</b>

<b>📝 Saran / Masukan :</b> 
<i>"${feedback}"</i>
─────────────────
<blockquote>${config.BOT_JASHER}</blockquote>`;

  try {
    await bot.sendMessage(chatId, caption, { 
      parse_mode: "HTML",
      reply_to_message_id: repliedMsg.message_id 
    });
  } catch (err) {
    console.error("Gagal mengirim fitur rate:", err.message);
  }
});

bot.onText(/^id$/i, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    // Pastikan user tidak di-blacklist dan bot tidak maintenance
    if (!(await requireNotBlacklisted(msg))) return;
    if (!(await requireNotMaintenance(msg))) return;

    // Cek apakah pesan ini merupakan reply ke pesan orang lain
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, "❌ <b>Gagal:</b> Harap gunakan perintah ini dengan me-reply pesan orang lain.", { parse_mode: "HTML" });
    }

    const target = msg.reply_to_message.from;
    const targetId = target.id.toString();
    const targetName = target.first_name;
    const targetUsername = target.username ? `@${target.username}` : "Tidak memakai username";
    const userLink = `tg://user?id=${targetId}`;

    // Logika penentuan akses sesuai fungsi di Malszx.js
    let akses = "User Gratis / Biasa";
    if (isMainOwner(targetId)) {
        akses = "Developer / Main Owner";
    } else if (isCEO(targetId)) {
        akses = "CEO";
    } else if (isAdditionalOwner(targetId)) {
        akses = "Owner Tambahan";
    } else if (isPremium(targetId)) {
        akses = "Premium User";
    }

    const caption = `
<blockquote>🆔 𝗜𝗡𝗙𝗢 𝗨𝗦𝗘𝗥 𝗜𝗗</blockquote>
─────────────────────
👤 <b>Nama:</b> ${targetName}
🆔 <b>ID:</b> <code>${targetId}</code>
🔗 <b>Username:</b> ${targetUsername}
🌐 <b>Link:</b> <a href="${userLink}">Klik Untuk Profil</a>
🛡️ <b>Akses:</b> <code>${akses}</code>
─────────────────────`;

    await bot.sendMessage(chatId, caption, { 
        parse_mode: 'HTML',
        reply_to_message_id: msg.message_id 
    });
});

bot.onText(/^\/gachaakun$/, async (msg) => {
    const chatId = msg.chat.id;

    const domains = ['@gmail.com', '@yahoo.com', '@outlook.com', '@hotmail.com'];
    const loginPlatforms = ['Google', 'Facebook', 'TikTok', 'Instagram', 'Moonton', 'Twitter'];
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    
    const generateRandomString = (length) => {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const email = generateRandomString(8) + domains[Math.floor(Math.random() * domains.length)];
    const password = generateRandomString(10);
    const randomLogin = loginPlatforms[Math.floor(Math.random() * loginPlatforms.length)];

    const loadings = [
        "<blockquote>Mengambil data email akun anda</blockquote>",
        "<blockquote>Mengambil data pasword</blockquote>",
        "<blockquote>Menyatukan data akun anda</blockquote>",
        "<blockquote>Sebentar bang dikit lagi nih</blockquote>",
        "<blockquote>Nungguin ya? 🤣</blockquote>",
        "<blockquote>Nungguin apaan ya bang? 😗</blockquote>",
        "<blockquote>Berhasil dan selesai... </blockquote>"
    ];

    const finalCaption = `<blockquote><b>GACHA EMAIL BERHASIL</b></blockquote>\n\n` +
                       `<b>Email :</b> <code>${email}</code>\n` +
                       `<b>Pasword :</b> <code>${password}</code>\n` +
                       `<b>Login Via :</b> ${randomLogin}\n\n` +
                       `<blockquote><b>Silahkan login dan semoga dapat akun bagus 🥳</b></blockquote>`;

    try {
        let sentMsg = await bot.sendMessage(chatId, loadings[0], { parse_mode: 'HTML' });

        for (let i = 1; i < loadings.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 1500)); 
            await bot.editMessageText(loadings[i], {
                chat_id: chatId,
                message_id: sentMsg.message_id,
                parse_mode: 'HTML'
            });
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
        await bot.editMessageText(finalCaption, {
            chat_id: chatId,
            message_id: sentMsg.message_id,
            parse_mode: 'HTML'
        });

    } catch (err) {
        console.error("Gagal menjalankan animasi gacha:", err);
    }
});

bot.onText(/^\/ban(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const input = match[1];

  if (msg.chat.type === 'private') {
    return bot.sendMessage(chatId, "❌ Fitur ini hanya dapat digunakan di dalam grup.");
  }

  if (!isOwner(userId)) {
    try {
      const member = await bot.getChatMember(chatId, userId);
      if (member.status !== 'administrator' && member.status !== 'creator') {
        return bot.sendMessage(chatId, "⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.");
      }
    } catch (e) { return; }
  }

  let targetId;
  let targetDisplay = "";

  if (msg.reply_to_message) {
    targetId = msg.reply_to_message.from.id;
    targetDisplay = msg.reply_to_message.from.first_name || "User";
  } else if (input) {
   if (!isNaN(input)) {
      targetId = input;
      targetDisplay = `ID: ${input}`;
    } else {
      targetId = input.startsWith('@') ? input : `@${input}`;
      targetDisplay = targetId;
    }
  } else {
    return bot.sendMessage(chatId, "⚠️ <b>Format Salah!</b>\n\n<b>Cara Pakai:</b>\n1. Balas pesan user dengan <code>/ban</code>\n2. Ketik <code>/ban [ID_USER]</code>\n3. Ketik <code>/ban [USERNAME]</code>", { parse_mode: "HTML" });
  }

  try {
    await bot.banChatMember(chatId, targetId);
    
    await bot.sendMessage(chatId, `<blockquote><b>✅ USER BERHASIL DIKELUARKAN</b></blockquote>\n\n<b>👤 Target:</b> ${targetDisplay}\n<b>🆔 ID:</b> <code>${targetId}</code>\n<b>👮 Eksekutor:</b> ${msg.from.first_name}`, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Gagal ban user:", error);
    bot.sendMessage(chatId, `<blockquote><b>❌ GAGAL MENGELUARKAN USER</b></blockquote>\n<b>Pesan:</b> <code>Pastikan Bot adalah Admin & ID/Username benar.</code>`, { parse_mode: "HTML" });
  }
});

bot.onText(/^\/unban(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const input = match[1];

  if (msg.chat.type === 'private') {
    return bot.sendMessage(chatId, "❌ Fitur ini hanya dapat digunakan di dalam grup.");
  }

  if (!isOwner(userId)) {
    try {
      const member = await bot.getChatMember(chatId, userId);
      if (member.status !== 'administrator' && member.status !== 'creator') {
        return bot.sendMessage(chatId, "⚠️ Anda tidak memiliki izin (Admin) untuk menggunakan perintah ini.");
      }
    } catch (e) { return; }
  }

  let targetId;
  let targetDisplay = "";

  if (msg.reply_to_message) {
    targetId = msg.reply_to_message.from.id;
    targetDisplay = msg.reply_to_message.from.first_name;
  } else if (input) {
    // B. Lewat ID atau Username
    if (!isNaN(input)) {
      targetId = input;
      targetDisplay = `ID: ${input}`;
    } else {
      targetId = input.startsWith('@') ? input : `@${input}`;
      targetDisplay = targetId;
    }
  } else {
    return bot.sendMessage(chatId, "⚠️ <b>Format Salah!</b>\n\n<b>Cara Pakai:</b>\n1. Balas pesan user dengan <code>/unban</code>\n2. Ketik <code>/unban [ID_USER]</code>\n3. Ketik <code>/unban [USERNAME]</code>", { parse_mode: "HTML" });
  }

  try {
    await bot.unbanChatMember(chatId, targetId);
    await bot.sendMessage(chatId, `<blockquote><b>✅ AKSES GRUP DIKEMBALIKAN</b></blockquote>\n\n<b>👤 Target:</b> ${targetDisplay}\n<b>🆔 ID:</b> <code>${targetId}</code>\n<b>👮 Eksekutor:</b> ${msg.from.first_name}`, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Gagal unban user:", error);
    bot.sendMessage(chatId, `<blockquote><b>❌ GAGAL UNBAN USER</b></blockquote>\n<b>Pesan:</b> <code>User mungkin tidak diblokir atau Bot bukan admin.</code>`, { parse_mode: "HTML" });
  }
});

bot.onText(/^\/tagall$/i, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.chat.type === 'private') return;

    try {
        const chatMember = await bot.getChatMember(chatId, userId);
        if (chatMember.status !== 'creator') {
            return bot.sendMessage(chatId, "⚠️ <b>Akses Ditolak:</b> Hanya <b>Pemilik Grup</b> yang bisa menggunakan fitur ini.", { 
                parse_mode: "HTML",
                reply_to_message_id: msg.message_id 
            });
        }

        if (!msg.reply_to_message) {
            return bot.sendMessage(chatId, "❌ <b>Gagal:</b> Silahkan <b>reply</b> pada pesan yang ingin di tag.", { 
                parse_mode: "HTML",
                reply_to_message_id: msg.message_id 
            });
        }

        const admins = await bot.getChatAdministrators(chatId);
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        const allSavedUsers = data.users || [];
        
        let mentionUsers = new Set();

        mentionUsers.add(config.DEVELOPER);
        mentionUsers.add(config.BOT_JASHER);

        admins.forEach(admin => {
            if (admin.user.username) {
                mentionUsers.add(`@${admin.user.username}`);
            } else {
                mentionUsers.add(`<a href="tg://user?id=${admin.user.id}">${admin.user.first_name}</a>`);
            }
        });

        for (let uId of allSavedUsers) {
            try {
                const member = await bot.getChatMember(chatId, uId);
                if (member && member.status !== 'left' && member.status !== 'kicked' && !member.user.is_bot) {
                    if (member.user.username) {
                        mentionUsers.add(`@${member.user.username}`);
                    } else {
                        mentionUsers.add(`<a href="tg://user?id=${member.user.id}">${member.user.first_name}</a>`);
                    }
                }
            } catch (e) {  
            }
        }

        const tagList = Array.from(mentionUsers);
        let finalMessage = tagList.join(' ');
        await bot.sendMessage(chatId, finalMessage, {
            parse_mode: "HTML",
            reply_to_message_id: msg.reply_to_message.message_id
        });

    } catch (err) {
        console.error("Tagall Error:", err);
    }
});

bot.onText(/^\/backupsc$/, async (msg) => {
    if (!(await cekAkses("utama", msg))) return;

    const chatId = msg.chat.id;
    const date = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');
    const zipFileName = `MULTI_JASHER_${date}.zip`;

    try {
        const loading = await bot.sendMessage(chatId, "⏳ Sedang menyiapkan file backup script...");
        
        const zip = new AdmZip();
        
        const filesToInclude = [
            'Malszx.js', 
            'config.js', 
            'data.json', 
            'package.json'
        ];

        filesToInclude.forEach(file => {
            if (fs.existsSync(file)) {
                zip.addLocalFile(file);
            }
        });

        if (fs.existsSync('./menu_images')) {
            zip.addLocalFolder('./menu_images', 'menu_images');
        }

        const zipBuffer = zip.toBuffer();

        await bot.sendDocument(chatId, zipBuffer, {
            caption: `✅ <b>Backup Script Berhasil!</b>\n📅 Tanggal: ${getHariWaktu()}`,
            parse_mode: 'HTML'
        }, {
            filename: zipFileName,
            contentType: 'application/zip'
        });

        await bot.deleteMessage(chatId, loading.message_id);

    } catch (err) {
        console.error("Backup Error:", err);
        bot.sendMessage(chatId, "❌ Gagal melakukan backup script: " + err.message);
    }
});

bot.onText(/^\/done(?:\s+(.+))?$/i, async (msg, match) => {
  if (!(await cekAkses("premium", msg))) return;

  const chatId = msg.chat.id;
  const input = match[1]?.trim();
  const replyMsg = msg.reply_to_message;

  if (!input) {
    return bot.sendMessage(chatId, 
`<blockquote><b>❌ FORMAT SALAH!</b></blockquote>
<b>Penggunaan:</b>
<code>/done nama barang,harga,metode bayar</code>

<b>Contoh:</b>
<code>/done jasa install panel,15000,Dana</code>`, 
{ parse_mode: "HTML" });
  }

  const [namaBarang, hargaBarang, metodeBayar] = input.split(",").map(x => x?.trim());
  if (!namaBarang || !hargaBarang) {
    return bot.sendMessage(chatId, 
`<blockquote><b>❌ FORMAT TIDAK LENGKAP!</b></blockquote>
<b>Minimal isi:</b>
<b>Nama Barang</b>
<b>Harga</b>`,
{ parse_mode: "HTML" });
  }

  const hargaFormatted = `Rp${Number(hargaBarang).toLocaleString("id-ID")}`;
  const metodePembayaran = metodeBayar || "Tidak disebutkan";
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const caption = `╓──────≪≪◈≫≫──────╖
          𝗧𝗥𝗔𝗡𝗦𝗔𝗞𝗦𝗜 𝗗𝗢𝗡𝗘
╙──────≪≪◈≫≫──────╜

<blockquote>
<b>➥ Produk :</b> ${namaBarang}
<b>➥ Nominal :</b> ${hargaFormatted}
<b>➥ Payment:</b> ${metodePembayaran}
<b>➥ Waktu:</b> ${now}
</blockquote>
─────────────────────
<blockquote>Terimakasih Sudah Berbelanja Disini 🔥</blockquote>
─────────────────────
`;

  if (replyMsg && replyMsg.photo) {
    const photos = replyMsg.photo;
    const photoId = photos[photos.length - 1].file_id; 
    await bot.sendPhoto(chatId, photoId, {
      caption: caption,
      parse_mode: "HTML"
    }).catch((err) => {
      bot.sendMessage(chatId, `<blockquote><b>⚠️ GAGAL KIRIM FOTO</b></blockquote>
<b>Status :</b> <code>Kirim gagal</code>`, { parse_mode: "HTML" });
    });
  } 
  else {
    await bot.sendMessage(chatId, caption, { parse_mode: "HTML" });
  }
});

bot.onText(/^\/addbutton$/, async (msg) => {
  if (!(await cekAkses("owner", msg))) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, `<blockquote><b>❌ FORMAT SALAH</b></blockquote>
<b>Reply pesan yang mau ditambah button dulu</b>`, { parse_mode: "HTML" });
  }
  
  chatSessions[userId] = {
    active: true,
    type: "addbutton",
    messageId: msg.reply_to_message.message_id,
    chatId: chatId,
    repliedMsg: msg.reply_to_message
  };
  
  return bot.sendMessage(chatId, `<blockquote><b>📝 TAMBAH BUTTON</b></blockquote>
<b>Kirim format button:</b>
<code>Nama|URL</code>

<b>Contoh:</b>
<code>Owner|t.me/RaineCute
Channel|t.me/TestiRaineCute</code>

<b>Max 5 button per baris</b>`, { parse_mode: "HTML" });
});

bot.onText(/^\/backup$/, async (msg) => {
  if (!(await cekAkses("utama", msg))) return;

  const senderId = msg.from.id;
  const chatId = msg.chat.id;

  try {
    const backupPath = backupData();
    if (backupPath) {
      const stats = fs.statSync(backupPath);
      const fileSize = stats.size;
      const sizeFormatted = formatBytes(fileSize);
      const fileName = path.basename(backupPath);
      const createdDate = new Date(stats.birthtime).toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      const modifiedDate = new Date(stats.mtime).toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      const caption = `<blockquote><b>📁 BACKUP BERHASIL</b></blockquote>
<b>📋 Detail File:</b>
<b>Nama File:</b> <code>${fileName}</code>
<b>Ukuran:</b> ${sizeFormatted}
<b>Dibuat:</b> ${createdDate}
<b>Diubah:</b> ${modifiedDate}

<b>📊 Statistik Data:</b>
<b>Users:</b> ${loadData().users?.length || 0}
<b>Groups:</b> ${loadData().groups?.length || 0}
<b>Premium:</b> ${Object.keys(loadData().premium || {}).length}
<b>Blacklist:</b> ${loadData().blacklist?.length || 0}`;
      
      await bot.sendDocument(chatId, backupPath, { 
        caption: caption,
        parse_mode: "HTML"
      });
    } else {
      await bot.sendMessage(chatId, `<blockquote><b>⚠️ TIDAK ADA DATA</b></blockquote>
<b>Status :</b> <code>Data kosong</code>`, { parse_mode: "HTML" });
    }
  } catch (e) {
    bot.sendMessage(chatId, `<blockquote><b>❌ GAGAL MEMBUAT BACKUP</b></blockquote>
<b>Status :</b> <code>Proses gagal</code>
<b>Solusi :</b> <code>Coba lagi nanti</code>`, { parse_mode: "HTML" });
  }
});

bot.onText(/\/ping/, async (msg) => {
  if (!(await cekAkses("owner", msg))) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    const uptimeMs = Date.now() - BOT_START_TIME;
    const uptime = getUptime();
    const totalMem = os.totalmem() / (1024 ** 3);
    const freeMem = os.freemem() / (1024 ** 3);
    const usedMem = totalMem - freeMem;
    const memUsage = (usedMem / totalMem * 100).toFixed(1);
    const cpuModel = os.cpus()[0].model;
    const cpuCores = os.cpus().length;
    const platform = os.platform();
    const arch = os.arch();
    const hariWaktu = getHariWaktu();

    const teks = `<blockquote><b>🖥️ INFORMASI VPS</b></blockquote>
<blockquote>💻 <b>CPU Information</b> :</blockquote>
<b>Model:</b> ${cpuModel}
<b>Cores:</b> ${cpuCores} CORE
<b>Platform:</b> ${platform}
<b>Architecture:</b> ${arch}

<blockquote>💾 <b>RAM Information</b> :</blockquote>
<b>Total RAM:</b> ${totalMem.toFixed(2)} GB
<b>Used RAM:</b> ${usedMem.toFixed(2)} GB
<b>Free RAM:</b> ${freeMem.toFixed(2)} GB
<b>Usage:</b> ${memUsage}%

<blockquote>⏱️ <b>System Information</b> :</blockquote>
<b>Uptime:</b> ${uptime}
<b>Hari/Waktu:</b> ${hariWaktu}
<b>Hostname:</b> ${os.hostname()}`;

    bot.sendMessage(chatId, teks, { parse_mode: 'HTML' });
  } catch (err) {
    bot.sendMessage(chatId, `<blockquote><b>❌ GAGAL MEMBACA INFO</b></blockquote>
<b>Status :</b> <code>Proses gagal</code>
<b>Solusi :</b> <code>Coba lagi nanti</code>`, { parse_mode: "HTML" });
  }
});

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  console.log('✅ Folder menu_images telah dibuat');
}

let lastUserCount = loadData().users.length;
let lastGroupCount = loadData().groups.length;

setInterval(async () => {
    try {
        const chatId = config.OWNER_IDS[0];
        const data = loadData();
        const timeString = getHariWaktu();
        
        if (fs.existsSync(DATA_FILE)) {
            
            const currentUserCount = data.users.length;
            const currentGroupCount = data.groups.length;
            const stats = fs.statSync(DATA_FILE);
            const fileSize = stats.size < 1024 * 1024 
                ? (stats.size / 1024).toFixed(2) + ' KB' 
                : (stats.size / (1024 * 1024)).toFixed(2) + ' MB';

            const diffUser = currentUserCount - lastUserCount;
            const diffGroup = currentGroupCount - lastGroupCount;

            const caption = `<blockquote><b>AUTO BACKUP FILE DATA.JSON TELAH SELESAI</b></blockquote>\n\n` +
                `<b>❍ Users :</b> ${currentUserCount}\n` +
                `<b>❍ Groups :</b> ${currentGroupCount}\n` +
                `<b>❍ Waktu :</b> ${timeString}\n` +
                `<b>❍ Ukuran File :</b> ${fileSize}\n` +
                `<b>❍ Penambahan Akses :</b> ${diffUser > 0 ? '+' + diffUser : 'Tidak ada'}\n` +
                `<b>❍ Penambahan Group :</b> ${diffGroup > 0 ? '+' + diffGroup : 'Tidak ada'}\n\n` +
                `<blockquote><b>Simpan baik baik data ini dan jangan sampai orang lain mengetahuinya atau ada yang membocorkannya</b></blockquote>`;

            await bot.sendDocument(chatId, DATA_FILE, {
                caption: caption,
                parse_mode: 'HTML'
            });

            lastUserCount = currentUserCount;
            lastGroupCount = currentGroupCount;
            
            console.log(chalk.green.bold(`[${timeString}] ✅ Auto Backup data.json berhasil dikirim.`));
        }
    } catch (err) {
        console.error(chalk.red('❌ Gagal menjalankan Auto Backup:'), err);
    }
}, 3600000);


setInterval(() => {
    const timeString = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    console.log(chalk.red.bold(`[${timeString}] 🕒 Restart Setiap 1 Jam Online...`));
    
    process.exit();
}, 3900000);

setInterval(async () => {
    try {
        const date = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\//g, '-');
        const zipFileName = `Auto_Backup_SC_${date.replace(/[: ]/g, '_')}.zip`;
        
        const developerChatId = OWNER_IDS[0]; 

        const zip = new AdmZip();
        
        const filesToInclude = [
            'Malszx.js', 
            'config.js', 
            'data.json', 
            'package.json'
        ];

        filesToInclude.forEach(file => {
            if (fs.existsSync(file)) {
                zip.addLocalFile(file);
            }
        });

        if (fs.existsSync('./menu_images')) {
            zip.addLocalFolder('./menu_images', 'menu_images');
        }

        const zipBuffer = zip.toBuffer();

        await bot.sendDocument(developerChatId, zipBuffer, {
            caption: `📦 <b>AUTO BACKUP SYSTEM</b>\n\n✅ Seluruh script dan data berhasil dicadangkan secara otomatis.\n📅 Waktu: <code>${date}</code>\n\n#AutoBackup #SafeData`,
            parse_mode: 'HTML'
        }, {
            filename: zipFileName,
            contentType: 'application/zip'
        });

        console.log(chalk.green.bold(`[${date}] ✅ Auto Backup SC berhasil dikirim ke Developer.`));

    } catch (err) {
        console.error(chalk.red('❌ Gagal menjalankan Auto Backup SC:'), err);
    }
}, 7200000);

const hr = chalk.hex("#FF4500")("━".repeat(45));
const v = chalk.hex("#FF4500")("┃");

console.log(`
${chalk.hex("#FF4500")("┏")}${hr}
${v}  ${chalk.hex("#FFD700").bold("🚀  MULTI JASHER VVIP SYSTEM")}
${chalk.hex("#FF4500")("┣")}${hr}
${v}  ${chalk.hex("#FF8C00")("👤  Developer  :")} ${chalk.hex("#00FFFF").bold(DEVELOPER)}
${v}  ${chalk.hex("#1E90FF")("🆔  Telegram ID:")} ${chalk.hex("#00FFFF")(OWNER_IDS.join(", "))}
${v}  ${chalk.hex("#32CD32")("🔑  Bot Token  :")} ${chalk.hex("#00FFFF")(BOT_TOKEN.substring(0, 10) + "...")}
${v}  ${chalk.hex("#BA55D3")("📅  Waktu      :")} ${chalk.hex("#00FFFF")(getHariWaktu())}
${chalk.hex("#FF4500")("┣")}${hr}
${v}  ${chalk.greenBright("✓ System is currently active and running")}
${chalk.hex("#FF4500")("┗")}${hr}
`);