const express = require('express');
const router  = express.Router();
const db      = require('../database/database');

function confirmOrder(orderNumber, valor) {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);
  if (!order) {
    console.log(`[PagBank] Pedido não encontrado: ${orderNumber}`);
    return;
  }
  if (order.payment_status === 'pago') {
    console.log(`[PagBank] ${orderNumber} já estava pago.`);
    return;
  }

  const amountOk = valor === 0 || Math.abs(valor - order.total) < 0.02;
  if (!amountOk) {
    console.warn(`[PagBank] Valor divergente em ${orderNumber}: esperado ${order.total}, recebido ${valor}`);
    return;
  }

  db.prepare(`
    UPDATE orders
    SET payment_status = 'pago',
        order_status   = CASE WHEN order_status = 'novo' THEN 'confirmado' ELSE order_status END,
        updated_at     = datetime('now','localtime')
    WHERE order_number = ?
  `).run(orderNumber);

  console.log(`✅ [PagBank] Pago: ${orderNumber} — R$ ${valor.toFixed(2)}`);
}

// POST /api/pagbank/webhook
router.post('/webhook', (req, res) => {
  try {
    const body = req.body;

    // ── Formato 1: Charges API (PIX dinâmico)
    // { "charges": [{ "reference_id": "PDM-123", "status": "PAID", "amount": { "value": 5000 } }] }
    const charges = body.charges || (body.charge ? [body.charge] : []);
    if (charges.length) {
      for (const charge of charges) {
        const status = (charge.status || '').toUpperCase();
        if (status !== 'PAID') continue;

        const orderNumber = charge.reference_id;
        const valor = (charge.amount?.summary?.paid ?? charge.amount?.value ?? 0) / 100;
        if (orderNumber) confirmOrder(orderNumber, valor);
      }
      return res.status(200).json({ ok: true });
    }

    // ── Formato 2: Pix BACEN padrão (PIX estático / legacy)
    // { "pix": [{ "txid": "PDM-123", "valor": "50.00", "status": "CONCLUIDA" }] }
    const pixList = [
      ...(body.pix || body.data?.pix || []),
      ...(body.txid ? [body] : []),
    ];

    for (const pix of pixList) {
      const txid = pix.txid || pix.referencia;
      if (!txid) continue;
      const orderNumber = txid.replace(/^PDM(\d+)$/, 'PDM-$1');
      const valor = parseFloat(pix.valor || pix.amount || 0);
      confirmOrder(orderNumber, valor);
    }

    if (!charges.length && !pixList.length) {
      console.log('[PagBank] Webhook recebido sem dados reconhecidos:', JSON.stringify(body).slice(0, 200));
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[PagBank] Erro no webhook:', err.message);
    res.status(200).json({ ok: true });
  }
});

// GET /api/pagbank/test — cria cobrança de R$0.01 para testar se o token funciona
router.get('/test', async (req, res) => {
  const token = process.env.PAGBANK_TOKEN;
  if (!token) return res.json({ ok: false, error: 'PAGBANK_TOKEN não configurado no .env' });

  const expiration_date = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace('Z', '-03:00');
  try {
    const r = await fetch('https://api.pagseguro.com/charges', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        reference_id: 'TEST-' + Date.now(),
        description: 'Teste de integração PIX',
        amount: { value: 1, currency: 'BRL' },
        payment_method: {
          type: 'PIX',
          installments: 1,
          capture: true,
          pix: { expiration_date },
        },
      }),
    });
    const text = await r.text();
    res.json({ ok: r.ok, status: r.status, token_length: token.length, response: text.slice(0, 800) });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// PATCH /api/pagbank/confirm/:orderId — confirmação manual pelo admin
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
