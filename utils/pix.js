const QRCode = require('qrcode');

function tlv(id, value) {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16(str) {
  let crc = 0xFFFF;
  for (const ch of str) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function removeAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function buildPixPayload(pixKey, amount, merchantName, merchantCity, txid) {
  const cleanTxid = txid.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || 'POINTMALOKAS';
  const cleanName = removeAccents(merchantName).substring(0, 25).toUpperCase();
  const cleanCity = removeAccents(merchantCity).substring(0, 15).toUpperCase();

  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', pixKey);
  const additionalData = tlv('05', cleanTxid);

  let payload = [
    tlv('00', '01'),
    tlv('01', '12'),
    tlv('26', merchantAccount),
    tlv('52', '0000'),
    tlv('53', '986'),
    tlv('54', parseFloat(amount).toFixed(2)),
    tlv('58', 'BR'),
    tlv('59', cleanName),
    tlv('60', cleanCity),
    tlv('62', additionalData),
    '6304',
  ].join('');

  return payload.slice(0, -4) + crc16(payload);
}

async function generatePixQR(amount, txid) {
  const pixKey = process.env.PIX_KEY || '+5511947291983';
  const merchantName = process.env.PIX_MERCHANT_NAME || 'Point dos Malokas';
  const merchantCity = process.env.PIX_MERCHANT_CITY || 'Sao Paulo';

  const payload = buildPixPayload(pixKey, amount, merchantName, merchantCity, txid);
  const qrBase64 = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 300 });

  return { payload, qrBase64, pixKey };
}

module.exports = { generatePixQR };
