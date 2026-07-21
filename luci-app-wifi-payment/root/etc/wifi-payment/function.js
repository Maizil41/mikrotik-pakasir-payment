const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');
const dayjs = require('dayjs');
const { execSync } = require('child_process');
const { RouterOSAPI } = require('node-routeros');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT NOT NULL,
      mac_addr TEXT NOT NULL,
      amount INTEGER NOT NULL,
      fee INTEGER NOT NULL,
      total_payment INTEGER NOT NULL,
      payment_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME,
      paid_at DATETIME,
      paket TEXT,
      voucher_code TEXT,
      durasi TEXT,
      used INTEGER NOT NULL DEFAULT '0'
    )
  `);
});

function getUciValue(path) {
  try { return execSync(`uci get '${path}'`).toString().trim(); }
  catch (e) { return null; }
}

async function generateQRWithLogoBuffer(data, logoPath) {
  const qrBuffer = await QRCode.toBuffer(data, { width: 512, margin: 4, errorCorrectionLevel: 'H' });
  const logoBuffer = await sharp(logoPath).resize(100, 100).toBuffer();
  return await sharp(qrBuffer).composite([{ input: logoBuffer, gravity: 'center' }]).png().toBuffer();
}

function saveLog(msg) { 
  console.log(`[${dayjs().format('HH:mm:ss')}] ${msg}`); 
}

async function tambahUserMikrotik(mac, namaPaket, order_id, durasiUptime) {
  try {
    const host = getUciValue('wifi-payment.@wifi_payment[0].mt_host');
    const user = getUciValue('wifi-payment.@wifi_payment[0].mt_user');
    const pass = getUciValue('wifi-payment.@wifi_payment[0].mt_pass');

    const api = new RouterOSAPI({ host, user, password: pass, timeout: 5000 });
    await api.connect();

    const username = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await api.write('/ip/hotspot/user/add', [
      `=name=${username}`,
      `=password=${username}`,
      `=profile=${namaPaket}`,
      `=limit-uptime=${durasiUptime}`,
      `=comment=${order_id}`
    ]);

    await api.close();
    saveLog(`🚀 Akun Hotspot dibuat: ${username}`);
    return username;
  } catch (err) {
    saveLog(`❌ Error Mikrotik: ${err.message}`);
    return null;
  }
}

module.exports = {
  db,
  getUciValue,
  generateQRWithLogoBuffer,
  saveLog,
  tambahUserMikrotik
};