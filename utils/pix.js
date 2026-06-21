const QRCode = require('qrcode');

// ── PIX DINÂMICO VIA MERCADO PAGO ─────────────────────────────────────────────
async function generatePixQRDynamic(amount, orderNumber) {
  const token = process.env.MP_ACCESS_TOKEN;
  const appUrl = process.env.APP_URL || 'http://localhost:3003';

  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': orderNumber,
    },
    body: JSON.stringify({
      transaction_amount: parseFloat(parseFloat(amount).toFixed(2)),
      description: `Pedido ${orderNumber} - Point dos Malokas Lanches e Bebidas`,
      payment_method_id: 'pix',
      payer: { email: 'cliente@pointdosmalokas.com.br' },
      external_reference: orderNumber,
      notification_url: `${appUrl}/api/mp/webhook`,
      date_of_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mercado Pago API ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const txData = data.point_of_interaction?.transaction_data;
  if (!txData?.qr_code) throw new Error('Mercado Pago não retornou QR code');

  // MP já retorna o QR como base64 — não precisa gerar
  const qrBase64 = txData.qr_code_base64
    ? `data:image/png;base64,${txData.qr_code_base64}`
    : await QRCode.toDataURL(txData.qr_code, { errorCorrectionLevel: 'M', margin: 2, width: 300 });

  return {
    payload: txData.qr_code,
    qrBase64,
    paymentId: data.id,
    pixKey: null,
  };
}

// ── PIX ESTÁTICO (fallback sem token) ─────────────────────────────────────────
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
  const additionalData  = tlv('05', cleanTxid);

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

  return payload + crc16(payload);
}

async function generatePixQR(amount, txid) {
  const pixKey      = process.env.PIX_KEY          || '+5511947291983';
  const merchantName = process.env.PIX_MERCHANT_NAME || 'Point dos Malokas';
  const merchantCity = process.env.PIX_MERCHANT_CITY || 'Sao Paulo';

  const payload   = buildPixPayload(pixKey, amount, merchantName, merchantCity, txid);
  const qrBase64  = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 300 });

  return { payload, qrBase64, pixKey };
}

module.exports = { generatePixQR, generatePixQRDynamic };
