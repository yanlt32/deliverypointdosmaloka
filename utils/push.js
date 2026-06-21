const webpush = require('web-push');
const db = require('../database/database');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:contato@pointdosmalokas.com.br', PUBLIC_KEY, PRIVATE_KEY);
}

const STATUS_MESSAGES = {
  confirmado: { title: 'Pedido confirmado! ✅', body: 'Seu pedido foi confirmado e já vai entrar em preparo.' },
  preparando: { title: 'Preparando seu pedido 🔥', body: 'Seu pedido está sendo preparado na cozinha.' },
  saiu:       { title: 'Saiu para entrega! 🛵', body: 'Seu pedido está a caminho.' },
  entregue:   { title: 'Pedido entregue! 🎉', body: 'Bom apetite! Obrigado por pedir com a gente.' },
  cancelado:  { title: 'Pedido cancelado', body: 'Seu pedido foi cancelado.' },
};

async function notifyOrderStatus(orderId, orderNumber, status) {
  const msg = STATUS_MESSAGES[status];
  if (!msg) { console.log(`[Push] Status "${status}" não gera notificação.`); return; }
  if (!PUBLIC_KEY) { console.warn('[Push] VAPID_PUBLIC_KEY não configurada — push desativado.'); return; }

  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE order_id = ?').all(orderId);
  console.log(`[Push] Pedido ${orderNumber}: ${subs.length} inscrição(ões) encontrada(s) para status "${status}".`);
  if (!subs.length) return;

  const payload = JSON.stringify({
    title: msg.title,
    body: `${msg.body} Pedido ${orderNumber}.`,
    url: `/pedido?id=${orderId}`,
  });

  for (const sub of subs) {
    try {
      const subscription = { endpoint: sub.endpoint, keys: JSON.parse(sub.keys_json) };
      await webpush.sendNotification(subscription, payload);
      console.log(`[Push] Notificação enviada com sucesso para ${orderNumber}.`);
    } catch (err) {
      console.error(`[Push] Erro ao enviar notificação (${err.statusCode || ''}):`, err.message);
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      }
    }
  }
}

module.exports = { notifyOrderStatus, PUBLIC_KEY };
