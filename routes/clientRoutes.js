const express = require('express');
const router = express.Router();
const db = require('../database/database');
const { generatePixQR, generatePixQRDynamic } = require('../utils/pix');
const { PUBLIC_KEY } = require('../utils/push');
const crypto = require('crypto');

// GET /api/menu
router.get('/menu', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY sort_order').all();

  const result = categories.map(cat => {
    const products = db.prepare(`
      SELECT p.*, GROUP_CONCAT(pv.id || '|' || pv.name || '|' || pv.price || '|' || pv.sort_order, ';;') as variants_raw
      FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      WHERE p.category_id = ? AND p.active = 1
      GROUP BY p.id
      ORDER BY p.sort_order
    `).all(cat.id);

    const productsWithData = products.map(p => {
      const variants = p.variants_raw
        ? p.variants_raw.split(';;').map(v => {
            const [id, name, price, sort_order] = v.split('|');
            return { id: parseInt(id), name, price: parseFloat(price), sort_order: parseInt(sort_order) };
          })
        : [];

      const options = db.prepare(`
        SELECT * FROM product_options
        WHERE product_id = ? OR category_id = ?
        ORDER BY option_group, sort_order
      `).all(p.id, cat.id);

      const optionGroups = {};
      options.forEach(opt => {
        if (!optionGroups[opt.option_group]) optionGroups[opt.option_group] = [];
        optionGroups[opt.option_group].push({ id: opt.id, name: opt.name, price: opt.price, maxSelect: opt.max_select || null });
      });

      return { ...p, variants_raw: undefined, variants, options: optionGroups };
    });

    return { ...cat, products: productsWithData };
  });

  res.json(result);
});

// GET /api/combos
router.get('/combos', (req, res) => {
  const combos = db.prepare('SELECT * FROM combos WHERE active = 1 ORDER BY sort_order').all();
  res.json(combos);
});

// GET /api/settings (público)
router.get('/settings', (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('store_open','delivery_fee','store_name','store_phone','pix_key')").all();
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  res.json(s);
});

// GET /api/promotions/active
router.get('/promotions/active', (req, res) => {
  const promos = db.prepare('SELECT * FROM promotions WHERE active = 1 ORDER BY id DESC').all();
  res.json(promos);
});

// POST /api/orders
router.post('/orders', async (req, res) => {
  const { customer_name, customer_phone, street, number, complement, neighborhood, city, reference, items, payment_method, notes, change_for, delivery_fee, delivery_type, pix_pay_option } = req.body;

  if (!customer_name || !customer_phone || !street || !number || !neighborhood || !items || !items.length || !payment_method) {
    return res.status(400).json({ error: 'Dados incompletos. Verifique todos os campos.' });
  }

  const total = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  if (total <= 0) return res.status(400).json({ error: 'Valor do pedido inválido.' });

  // Rate limit: máx 5 pedidos por telefone em 15 minutos
  const cleanPhone = customer_phone.replace(/\D/g, '');
  if (cleanPhone.length < 8) return res.status(400).json({ error: 'Telefone inválido.' });
  const recentCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM orders
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone,' ',''),'-',''),'(',''),')',''),'+','') LIKE ?
    AND created_at > datetime('now', '-15 minutes', 'localtime')
  `).get(`%${cleanPhone.slice(-9)}`);
  if (recentCount.cnt >= 5) {
    return res.status(429).json({ error: 'Você fez muitos pedidos recentemente. Aguarde alguns minutos antes de tentar novamente.' });
  }

  const id = crypto.randomUUID();
  const orderNumber = 'PDM-' + Date.now().toString().slice(-6);

  const fee = parseFloat(delivery_fee) || 0;
  const dtype = delivery_type === 'retirada' ? 'retirada' : 'entrega';
  db.prepare(`
    INSERT INTO orders (id, order_number, customer_name, customer_phone, street, number, complement, neighborhood, city, reference, items_json, total, payment_method, notes, change_for, delivery_fee, delivery_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, orderNumber, customer_name, customer_phone, street, number, complement || '', neighborhood, city || 'São Paulo', reference || '', JSON.stringify(items), total, payment_method, notes || '', change_for || null, fee, dtype);

  // PIX "pagar agora" — ocultar do admin até o cliente confirmar pagamento
  if (payment_method === 'pix' && pix_pay_option === 'antes') {
    db.prepare("UPDATE orders SET awaiting_pix_claim = 1 WHERE id = ?").run(id);
  }

  let pixData = null;
  if (payment_method === 'pix') {
    if (process.env.MP_ACCESS_TOKEN) {
      try {
        pixData = await generatePixQRDynamic(total, orderNumber);
        db.prepare('UPDATE orders SET pix_dynamic = 1 WHERE id = ?').run(id);
      } catch (e) {
        console.error('Erro ao gerar PIX dinâmico:', e.message);
      }
    }
    if (!pixData) {
      try {
        pixData = await generatePixQR(total, orderNumber);
      } catch (e) {
        console.error('Erro ao gerar PIX estático:', e.message);
      }
    }
    if (pixData?.payload) {
      db.prepare('UPDATE orders SET pix_payload = ? WHERE id = ?').run(pixData.payload, id);
    }
  }

  res.status(201).json({
    success: true,
    orderId: id,
    orderNumber,
    total,
    pix: pixData,
  });
});

// GET /api/push/vapid-public-key
router.get('/push/vapid-public-key', (req, res) => {
  res.json({ key: PUBLIC_KEY || null });
});

// POST /api/orders/:id/subscribe — salva inscrição push para esse pedido
router.post('/orders/:id/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys) return res.status(400).json({ error: 'Dados de inscrição inválidos.' });

  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  db.prepare(`
    INSERT INTO push_subscriptions (order_id, endpoint, keys_json) VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET order_id = excluded.order_id
  `).run(req.params.id, endpoint, JSON.stringify(keys));

  res.json({ success: true });
});

// POST /api/orders/:orderNumber/pix-claimed
router.post('/orders/:orderNumber/pix-claimed', (req, res) => {
  const order = db.prepare('SELECT id FROM orders WHERE order_number = ?').get(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  db.prepare("UPDATE orders SET pix_claimed = 1, awaiting_pix_claim = 0, updated_at = datetime('now','localtime') WHERE order_number = ?").run(req.params.orderNumber);
  res.json({ success: true });
});

// POST /api/orders/:orderNumber/cancel
router.post('/orders/:orderNumber/cancel', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  if (!['novo', 'confirmado'].includes(order.order_status)) {
    return res.status(400).json({ error: 'Não é possível cancelar — pedido já está sendo preparado.' });
  }

  db.prepare(`
    UPDATE orders SET order_status = 'cancelado', updated_at = datetime('now','localtime')
    WHERE order_number = ?
  `).run(req.params.orderNumber);

  res.json({ success: true });
});

// GET /api/orders/by-phone?phone=11999999999
router.get('/orders/by-phone', (req, res) => {
  const phone = (req.query.phone || '').replace(/\D/g, '');
  if (!phone || phone.length < 8) return res.status(400).json({ error: 'Telefone inválido.' });

  const last9 = phone.slice(-9);
  const orders = db.prepare(`
    SELECT id, order_number, customer_name, total, payment_method, order_status, created_at
    FROM orders
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone,' ',''),'-',''),'(',''),')',''),'+','') LIKE ?
    ORDER BY created_at DESC
    LIMIT 15
  `).all(`%${last9}`);

  res.json(orders);
});

// GET /api/orders/:id
router.get('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  order.items = JSON.parse(order.items_json);
  delete order.items_json;

  const statusSteps = ['novo', 'confirmado', 'preparando', 'saiu', 'entregue'];
  order.status_steps = statusSteps;
  order.status_index = statusSteps.indexOf(order.order_status);

  res.json(order);
});

module.exports = router;
