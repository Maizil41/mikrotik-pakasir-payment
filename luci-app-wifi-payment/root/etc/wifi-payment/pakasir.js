const { Pakasir } = require('pakasir-sdk');
const { execSync } = require('child_process');

const slug = getUciValue('wifi-payment.@wifi_payment[0].slug');
const apikey = getUciValue('wifi-payment.@wifi_payment[0].apikey');

function getUciValue(path) {
  try { return execSync(`uci get '${path}'`).toString().trim(); }
  catch (e) { return null; }
}

function client() {
  return new Pakasir({
    slug,
    apikey,
  });
}

async function create(trxid, amount) {
  return client().createPayment('qris', trxid, amount);
}

async function cancel(trxid, amount) {
  return client().cancelPayment(trxid, amount);
}

async function status(trxid, amount) {
  return client().detailPayment(trxid, amount);
}

module.exports = {
  create,
  cancel,
  status,
};