const express = require('express');
const router  = express.Router();
const db      = require('../database/database');

function confirmOrder(orderNumber, valor) {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);
  if (!order) {
    console.log(`[MP] Pedido não encontrado: ${orderNumber}`);
    return;
  }
  if (order.payment_status === 'pago') {
    console.log(`[MP] ${orderNumber} já estava pago.`);
    return;
  }

  const amountOk = valor === 0 || Math.abs(valor - order.total) < 0.02;
  if (!amountOk) {
    console.warn(`[MP] Valor divergente em ${orderNumber}: esperado ${order.total}, recebido ${valor}`);
    return;
  }

  db.prepare(`
    UPDATE orders
    SET payment_status = 'pago',
        order_status   = CASE WHEN order_status = 'novo' THEN 'confirmado' ELSE order_status END,
        updated_at     = datetime('now','localtime')
    WHERE order_number = ?
  `).run(orderNumber);

  console.log(`✅ [MP] Pago: ${orderNumber} — R$ ${valor.toFixed(2)}`);
}

// POST /api/mp/webhook
// Mercado Pago envia: { "action": "payment.updated", "data": { "id": "123456" } }
router.post('/webhook', async (req, res) => {
  // Responde 200 imediatamente para o MP não retentar
  res.status(200).json({ ok: true });

  try {
    const { action, data } = req.body || {};
    if (!action?.startsWith('payment') || !data?.id) return;

    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return;

    // Busca detalhes do pagamento na API do MP
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) {
      console.warn(`[MP] Falha ao buscar pagamento ${data.id}: ${r.status}`);
      return;
    }

    const payment = await r.json();
    if (payment.status !== 'approved') return;

    const orderNumber = payment.external_reference;
    const valor = parseFloat(payment.transaction_amount || 0);
    if (orderNumber) confirmOrder(orderNumber, valor);
  } catch (err) {
    console.error('[MP] Erro no webhook:', err.message);
  }
});

// GET /api/mp/test — verifica se o token está funcional
router.get('/test', async (req, res) => {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return res.json({ ok: false, error: 'MP_ACCESS_TOKEN não configurado no .env' });

  try {
    const r = await fetch('https://api.mercadopago.com/v1/payment_methods?payment_type_id=pix', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await r.json();
    res.json({ ok: r.ok, status: r.status, token_prefix: token.slice(0, 8) + '...', response: JSON.stringify(data).slice(0, 400) });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// PATCH /api/mp/confirm/:orderId — confirmação manual pelo admin
router.patch('/confirm/:orderId', (req, res) => {
  const { payment_status } = req.body;
  const validStatuses = ['pago', 'pendente', 'cancelado'];
  if (!validStatuses.includes(payment_status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  const result = db.prepare(`
    UPDATE orders
    SET payment_status = ?,
        order_status   = CASE WHEN ? = 'pago' AND order_status = 'novo' THEN 'confirmado' ELSE order_status END,
        updated_at     = datetime('now','localtime')
    WHERE id = ?
  `).run(payment_status, payment_status, req.params.orderId);

  if (result.changes === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
