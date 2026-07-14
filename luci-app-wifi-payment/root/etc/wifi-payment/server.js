process.env.TZ = 'Asia/Jakarta';
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');
const db = require('./db');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const pakasir = require('./pakasir');
const { execSync } = require('child_process');
const { RouterOSAPI } = require('node-routeros');
const { prosesTransaksi, startPayment } = require('./order-checker');

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

function getUciValue(path) {
  try { return execSync(`uci get '${path}'`).toString().trim(); }
  catch (e) { return null; }
}

const app = express();
const PORT = getUciValue('wifi-payment.@wifi_payment[0].app_port');

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

function saveLog(msg) { console.log(`[${dayjs().format('HH:mm:ss')}] ${msg}`); }

async function generateQRWithLogoBuffer(data, logoPath) {
  const qrBuffer = await QRCode.toBuffer(data, { width: 512, margin: 4, errorCorrectionLevel: 'H' });
  const logoBuffer = await sharp(logoPath).resize(100, 100).toBuffer();
  return await sharp(qrBuffer).composite([{ input: logoBuffer, gravity: 'center' }]).png().toBuffer();
}

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
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (row) {
            return res.status(409).json({
                error: 'Order aktif ditemukan',
                id: row.order_id
            });
        }

        const order_id = 'VC' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();

        let result;
        let qrBase64;

        try {
            result = await pakasir.create(order_id, harga);

            const logoPath = path.join(__dirname, 'qris', 'logo.png');

            const qrBuffer = await generateQRWithLogoBuffer(
                result.payment_number,
                logoPath
            );

            qrBase64 = `data:image/png;base64,${qrBuffer.toString('base64')}`;

        } catch (err) {
            saveLog(err);
            return res.status(500).json({
                error: 'Gagal membuat QRIS'
            });
        }

        db.run(
            `INSERT INTO orders (
                order_id,
                mac_addr,
                amount,
                fee,
                total_payment,
                status,
                payment_number,
                created_at,
                paket,
                durasi
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                result.order_id,
                mac,
                result.amount,
                result.fee,
                result.total_payment,
                result.status,
                result.payment_number,
                tanggal,
                paket,
                durasi
            ],
            function (err) {
                if (err) {
                    saveLog(err);
                    return res.status(500).json({
                        error: 'Gagal membuat order'
                    });
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
        `SELECT order_id
         FROM orders
         WHERE mac_addr = ?
           AND status = 'complete'
           AND used = '0'`,
        [req.params.id],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            if (!row) {
                return res.status(404).json({ error: 'Tidak ditemukan' });
            }

            res.json(row);
        }
    );
});

app.post('/api/set/:id', (req, res) => {
    db.run(
        `UPDATE orders
         SET used = 1
         WHERE order_id = ?
           AND used = 0`,
        [req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                success: true,
                updated: this.changes > 0
            });
        }
    );
});

app.get('/api/qr/:order_id', async (req, res) => {
    db.get(
        `SELECT payment_number FROM orders WHERE order_id = ?`,
        [req.params.order_id],
        async (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (!row) {
                return res.status(404).json({ error: 'Order tidak ditemukan' });
            }

            try {
                const logoPath = path.join(__dirname, 'qris', 'logo.png');

                const qrBuffer = await generateQRWithLogoBuffer(
                    row.payment_number,
                    logoPath
                );

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
    
    const formatToMikrotikUptime = (raw) => {
      if (!raw) return "00:00:00";
  
      const d = (raw.match(/(\d+)d/) || [0, 0])[1];
      const h = (raw.match(/(\d+)h/) || [0, 0])[1];
      const m = (raw.match(/(\d+)m/) || [0, 0])[1];
      const s = (raw.match(/(\d+)s/) || [0, 0])[1];

      const pad = (n) => n.toString().padStart(2, '0');
  
      const timePart = `${pad(h)}:${pad(m)}:${pad(s)}`;
      return d > 0 ? `${d}d ${timePart}` : timePart;
    };

    const terjemahkanDurasi = (raw) => {
      const units = { 'w': 'minggu', 'd': 'hari', 'h': 'jam', 'm': 'menit', 's': 'detik' };
      return raw.replace(/(\d+)([wdhms])/g, (match, p1, p2) => `${p1} ${units[p2]} `).trim();
    };

    const data = profiles.map(p => {
      const onLogin = p['on-login'] || "";
      const parts = onLogin.split(',');
      const durasiRaw = parts[3] || "0h";

      return {
        name: p.name,
        harga: parts[2] || "0",
        durasi: terjemahkanDurasi(durasiRaw),
        durasiUptime: formatToMikrotikUptime(durasiRaw)
      };
    });

    res.json(data);
  } catch (err) {
    saveLog("Gagal mengambil profile:", err.message);
    res.status(500).json({ error: "Gagal memuat daftar paket" });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  saveLog(`Server API & QRIS aktif di port ${PORT}`);
  startPayment();
});