const express = require('express');
const router = express.Router();
const db = require('../database/database');
const { generatePixQR, generatePixQRDynamic } = require('../utils/pix');
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
        optionGroups[opt.option_group].push({ id: opt.id, name: opt.name, price: opt.price });
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

// GET /api/promotions/active
router.get('/promotions/active', (req, res) => {
  const promos = db.prepare('SELECT * FROM promotions WHERE active = 1 ORDER BY id DESC').all();
  res.json(promos);
});

// POST /api/orders
router.post('/orders', async (req, res) => {
  const { customer_name, customer_phone, street, number, complement, neighborhood, city, reference, items, payment_method, notes, change_for } = req.body;

  if (!customer_name || !customer_phone || !street || !number || !neighborhood || !items || !items.length || !payment_method) {
    return res.status(400).json({ error: 'Dados incompletos. Verifique todos os campos.' });
  }

  const total = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  if (total <= 0) return res.status(400).json({ error: 'Valor do pedido inválido.' });

  const id = crypto.randomUUID();
  const orderNumber = 'PDM-' + Date.now().toString().slice(-6);

  db.prepare(`
    INSERT INTO orders (id, order_number, customer_name, customer_phone, street, number, complement, neighborhood, city, reference, items_json, total, payment_method, notes, change_for)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, orderNumber, customer_name, customer_phone, street, number, complement || '', neighborhood, city || 'São Paulo', reference || '', JSON.stringify(items), total, payment_method, notes || '', change_for || null);

  let pixData = null;
  if (payment_method === 'pix') {
    try {
      if (process.env.PAGBANK_TOKEN) {
        pixData = await generatePixQRDynamic(total, orderNumber);
      } else {
        pixData = await generatePixQR(total, orderNumber);
      }
    } catch (e) {
      console.error('Erro ao gerar PIX dinâmico:', e.message);
      try { pixData = await generatePixQR(total, orderNumber); } catch {}
    }
  }

  res.status(201).json({
    success: true,
    orderId: id,
    orderNumber,
    total,
    pix: pixData,
    pagbankLink: process.env.PAGBANK_LINK || null,
  });
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
