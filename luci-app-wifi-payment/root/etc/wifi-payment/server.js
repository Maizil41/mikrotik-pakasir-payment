process.env.TZ = 'Asia/Jakarta';
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const pakasir = require('./pakasir');
const { execSync } = require('child_process');
const { RouterOSAPI } = require('node-routeros');
const { prosesTransaksi, startPayment } = require('./order-checker');
const { db, getUciValue, generateQRWithLogoBuffer, saveLog, tambahUserMikrotik } = require('./function');

const getWIBString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const app = express();
const PORT = getUciValue('wifi-payment.@wifi_payment[0].app_port') || 3000;
const MODE = getUciValue('wifi-payment.@wifi_payment[0].mode') || 'polling';

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

app.post('/api/order', (req, res) => {
    const { paket, harga, mac, durasi } = req.body;
    const tanggal = getWIBString();

    const cekQuery = `
        SELECT order_id FROM orders
        WHERE mac_addr = ?
        AND status = 'pending'
        AND datetime(created_at) > datetime('now', '-5 minutes')
        LIMIT 1`;

    db.get(cekQuery, [mac], async (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        if (row) {
            return res.status(409).json({ error: 'Order aktif ditemukan', id: row.order_id });
        }

        const order_id = 'VC' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
        let result;
        let qrBase64;

        try {
            result = await pakasir.create(order_id, harga);
            const logoPath = path.join(__dirname, 'qris', 'logo.png');
            const qrBuffer = await generateQRWithLogoBuffer(result.payment_number, logoPath);
            qrBase64 = `data:image/png;base64,${qrBuffer.toString('base64')}`;
        } catch (err) {
            saveLog(err);
            return res.status(500).json({ error: 'Gagal membuat QRIS' });
        }

        db.run(
            `INSERT INTO orders (
                order_id, mac_addr, amount, fee, total_payment, status, payment_number, created_at, paket, durasi
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                result.order_id, mac, result.amount, result.fee, result.total_payment, result.status, result.payment_number, tanggal, paket, durasi
            ],
            function (err) {
                if (err) {
                    saveLog(err);
                    return res.status(500).json({ error: 'Gagal membuat order' });
                }

                res.json({
                    id: result.order_id,
                    mac,
                    paket,
                    harga: result.amount,
                    fee: result.fee,
                    total_payment: result.total_payment,
                    status: result.status,
                    payment_number: result.payment_number,
                    qr: `/api/qr/${result.order_id}`
                });
            }
        );
    });
});

app.get('/api/order/:id', (req, res) => {
  db.get(`SELECT * FROM orders WHERE order_id = ?`, [req.params.id], (err, row) => {
    if (!row) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json(row); 
  });
});

app.get('/api/get/:id', (req, res) => {
    db.get(
        `SELECT order_id FROM orders WHERE mac_addr = ? AND status = 'complete' AND used = '0'`,
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Tidak ditemukan' });
            res.json(row);
        }
    );
});

app.post('/api/set/:id', (req, res) => {
    db.run(
        `UPDATE orders SET used = 1 WHERE order_id = ? AND used = 0`,
        [req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, updated: this.changes > 0 });
        }
    );
});

app.get('/api/qr/:order_id', async (req, res) => {
    db.get(
        `SELECT payment_number FROM orders WHERE order_id = ?`,
        [req.params.order_id],
        async (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!row) return res.status(404).json({ error: 'Order tidak ditemukan' });

            try {
                const logoPath = path.join(__dirname, 'qris', 'logo.png');
                const qrBuffer = await generateQRWithLogoBuffer(row.payment_number, logoPath);
                res.setHeader('Content-Type', 'image/png');
                res.send(qrBuffer);
            } catch (err) {
                saveLog(err);
                res.status(500).json({ error: 'Gagal membuat QR' });
            }
        }
    );
});

app.get("/api/profile", async (req, res) => {
  try {
    const host = getUciValue('wifi-payment.@wifi_payment[0].mt_host');
    const user = getUciValue('wifi-payment.@wifi_payment[0].mt_user');
    const pass = getUciValue('wifi-payment.@wifi_payment[0].mt_pass');

    const api = new RouterOSAPI({ host, user, password: pass, timeout: 5000 });
    await api.connect();
    const profiles = await api.write('/ip/hotspot/user/profile/print');
    await api.close();
    
    const formatUptime = (raw) => {
      if (!raw) return "00:00:00";
      const d = (raw.match(/(\d+)d/) || [0, 0])[1];
      const h = (raw.match(/(\d+)h/) || [0, 0])[1];
      const m = (raw.match(/(\d+)m/) || [0, 0])[1];
      const s = (raw.match(/(\d+)s/) || [0, 0])[1];
      const pad = (n) => n.toString().padStart(2, '0');
      const timePart = `${pad(h)}:${pad(m)}:${pad(s)}`;
      return d > 0 ? `${d}d ${timePart}` : timePart;
    };

    const formatDuration = (raw) => {
      const units = { 'w': 'minggu', 'd': 'hari', 'h': 'jam', 'm': 'menit', 's': 'detik' };
      return raw.replace(/(\d+)([wdhms])/g, (match, p1, p2) => `${p1} ${units[p2]} `).trim();
    };

    const data = profiles.map(p => {
      const onLogin = p['on-login'] || "";
      const parts = onLogin.split(',');
      const durasiRaw = parts[3] || "0h";
      return {
        name: p.name,
        harga: parts[4] || "0",
        durasi: formatDuration(durasiRaw),
        durasiUptime: formatUptime(durasiRaw)
      };
    });

    res.json(data);
  } catch (err) {
    saveLog("Gagal mengambil profile:", err.message);
    res.status(500).json({ error: "Gagal memuat daftar paket" });
  }
});

app.post('/api/callback/payment', async (req, res) => {
    
    if (MODE !== 'callback') {
        return res.status(200).json({ 
            success: false, 
            message: "Callback ignored: Server is in polling mode" 
        });
    }
    
    const { order_id, status, amount, payment_method } = req.body;
    
    saveLog(`[CALLBACK] Menerima push status ${status} untuk order ${order_id}`);

    res.status(200).json({ 
        success: true, 
        message: "Callback received" 
    });

    if (status === 'completed') {
        db.get(`SELECT * FROM orders WHERE order_id = ?`, [order_id], async (err, payment) => {
            if (err || !payment) return saveLog(`⚠️ Callback Error: Order ${order_id} tidak ditemukan/DB error.`);
            
            if (payment.status === 'complete') return;

            db.run(
                `UPDATE orders SET status = ?, paid_at = ? WHERE order_id = ?`,
                ['complete', dayjs().format('YYYY-MM-DD HH:mm:ss'), order_id], 
                async (err) => {
                    if (err) return saveLog(`❌ Gagal update status di database untuk ${order_id}`);
                    
                    saveLog(`✅ Order ${order_id} Sukses (via Callback)! Dibayar pakai ${payment_method || 'QRIS'}`);

                    const username = await tambahUserMikrotik(payment.mac_addr, payment.paket, order_id, payment.durasi);
                    
                    if (username) {
                        db.run(`UPDATE orders SET voucher_code = ? WHERE order_id = ?`, [username, order_id]);
                    }
                }
            );
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
  saveLog(`Server API & QRIS aktif di port ${PORT}`);
  if (MODE === 'callback') {
    saveLog(`⚙️ Berjalan di mode: CALLBACK (Webhook)`);
  } else {
    saveLog(`⚙️ Berjalan di mode: POLLING`);
    startPayment();
  }
});
