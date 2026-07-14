# MikroTik Pakasir Payment Gateway
<img src="media/pakasir.png" width="200" alt="Pakasir Logo" align="right"/>

Payment Gateway MikroTik Dengan Integrasi API Pakasir

<a href="https://github.com/maizil41/mikrotik-pakasir-payment"><img src="https://img.shields.io/github/languages/code-size/maizil41/mikrotik-pakasir-payment" alt="GitHub Code Size"></a>
<a href="https://github.com/maizil41/mikrotik-pakasir-payment"><img src="https://img.shields.io/github/license/maizil41/mikrotik-pakasir-payment" alt="GitHub License"></a>
<a href="https://github.com/maizil41/mikrotik-pakasir-payment"><img src="https://img.shields.io/github/stars/maizil41/mikrotik-pakasir-payment" alt="GitHub Stars"></a>
<a href="https://github.com/maizil41/mikrotik-pakasir-payment"><img src="https://img.shields.io/github/forks/maizil41/mikrotik-pakasir-payment" alt="GitHub Forks"></a>
<a href="https://github.com/maizil41/mikrotik-pakasir-payment"><img src="https://img.shields.io/github/watchers/maizil41/mikrotik-pakasir-payment" alt="GitHub Watchers"></a>

## 📦 Depedensi

```bash
{
    "axios",
    "cors",
    "crypto",
    "dayjs",
    "express",
    "node-routeros",
    "mikrotik-pakasir-payment",
    "qrcode",
    "sharp",
    "sqlite3"
}
```

## 📦 Instalasi

Bypass IP Openwrt Di `Mikrotik` Agar bisa Mengaskses API, Pastekan kode Berikut di Terminal Winbox

```bash
/ip hotspot walled-garden ip
add dst-address=192.168.1.1 action=accept
```

# Konfigurasi Di Openwrt:

Untuk `openwrt 24` dan lebih rendah:

```bash
wget -O /tmp/luci-app-wifi-payment_1.1_all.ipk https://github.com/Maizil41/mikrotik-pakasir-payment/releases/download/v1.1/luci-app-wifi-payment_1.1_all.ipk

opkg install /tmp/luci-app-wifi-payment_1.1_all.ipk
```

Untuk `openwrt 25` dan lebih baru:

```bash
wget -O /tmp/luci-app-wifi-payment-1.1-r1.apk https://github.com/Maizil41/mikrotik-pakasir-payment/releases/download/v1.1/luci-app-wifi-payment-1.1-r1.apk

apk add --allow-untrusted /tmp/luci-app-wifi-payment-1.1-r1.apk
```
