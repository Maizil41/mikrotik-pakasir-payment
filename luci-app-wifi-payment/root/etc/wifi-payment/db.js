const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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

module.exports = db;
