const axios = require('axios');
const pakasir = require('./pakasir');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { execSync } = require('child_process');
const { RouterOSAPI } = require('node-routeros');
const { db, saveLog, tambahUserMikrotik } = require('./function');

async function prosesTransaksi() {
  try {
    const payments = await new Promise((resolve) => {
      db.all(`SELECT * FROM orders WHERE status = 'pending'`, [], (err, rows) => resolve(rows || []));
    });
    
    if (payments.length === 0) return;

    for (const payment of payments) {
      const now = dayjs();
      const orderTime = dayjs(payment.created_at);
      if (now.diff(orderTime, 'minute') >= 5) {
        const res = await pakasir.cancel(payment.order_id, payment.amount);
        await new Promise(resolve => db.run(`DELETE FROM orders WHERE order_id = ?`, [payment.order_id], resolve));
        saveLog(`🗑️ Order ${payment.order_id} kadaluarsa.`);
        continue;
      }

      const res = await pakasir.status(payment.order_id, payment.amount);

      if (res && res.status === 'completed') {
        await new Promise(resolve => 
          db.run(
            `UPDATE orders SET status = ?, paid_at = ? WHERE order_id = ?`,
            ['complete', dayjs().format('YYYY-MM-DD HH:mm:ss'), payment.order_id], 
            resolve
          )
        );

        saveLog(`✅ Order ${payment.order_id} Sukses!`);

        const userBaru = await tambahUserMikrotik(payment.mac_addr, payment.paket, payment.order_id, payment.durasi);
        if (userBaru) {
          await new Promise(resolve => 
            db.run(`UPDATE orders SET voucher_code = ? WHERE order_id = ?`, [userBaru, payment.order_id], resolve)
          );
        }
      }
    }
  } catch (err) {
    saveLog(`❌ Error prosesTransaksi: ${err.message}`);
  }
}

function startPayment(intervalMs = 3000) {
  setInterval(prosesTransaksi, intervalMs);
}

module.exports = { prosesTransaksi, startPayment };