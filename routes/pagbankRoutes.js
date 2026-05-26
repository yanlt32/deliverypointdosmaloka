const express = require('express');
const router = express.Router();
const db = require('../database/database');

// PagBank sends POST to this endpoint when a Pix payment is received.
// Configure this URL in your PagBank dashboard under:
// Pix > Configurações > Webhooks > URL: https://seusite.com/api/pagbank/webhook

router.post('/webhook', (req, res) => {
  try {
    const body = req.body;

    // PagBank Pix webhook structure (BACEN standard):
    // { "pix": [{ "txid": "...", "valor": "...", "status": "CONCLUIDA", ... }] }
    const pixList = body.pix || body.data?.pix || [];

    if (!Array.isArray(pixList) || pixList.length === 0) {
      // Some PagBank versions send a single object
      const single = body.txid ? [body] : [];
      if (!single.length) {
        console.log('[PagBank Webhook] Payload sem pix:', JSON.stringify(body).slice(0, 200));
        return res.status(200).json({ ok: true });
      }
      pixList.push(...single);
    }

    for (const pix of pixList) {
      const txid = pix.txid || pix.referencia;
      const valor = parseFloat(pix.valor || pix.amount || 0);
      const status = (pix.status || '').toUpperCase();

      if (!txid) continue;

      // txid matches our order_number (e.g. "PDM-303398")
      // PagBank may send it with or without the dash
      const orderNumber = txid.replace(/^PDM(\d+)$/, 'PDM-$1') || txid;

      const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);
      if (!order) {
        console.log(`[PagBank Webhook] Pedido não encontrado: txid=${txid}`);
        continue;
      }

      if (order.payment_status === 'pago') {
        console.log(`[PagBank Webhook] Pedido ${orderNumber} já estava pago.`);
        continue;
      }

      // Confirm if amount matches (tolerance of R$0.01)
      const amountMatch = Math.abs(valor - order.total) < 0.02;

      if (amountMatch || valor === 0) {
        db.prepare(`
          UPDATE orders
          SET payment_status = 'pago',
              order_status   = CASE WHEN order_status = 'novo' THEN 'confirmado' ELSE order_status END,
              updated_at     = datetime('now','localtime')
          WHERE order_number = ?
        `).run(orderNumber);

        console.log(`✅ [PagBank Webhook] Pagamento confirmado: ${orderNumber} — R$ ${valor}`);
      } else {
        console.warn(`⚠️ [PagBank Webhook] Valor divergente para ${orderNumber}: esperado ${order.total}, recebido ${valor}`);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[PagBank Webhook] Erro:', err.message);
    res.status(200).json({ ok: true }); // always 200 so PagBank doesn't retry indefinitely
  }
});

// Optional: manual payment confirmation by admin
// PATCH /api/pagbank/confirm/:orderId
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
