const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/database');
const auth = require('../middleware/auth');

const JWT_SECRET = () => process.env.JWT_SECRET || 'secret_dev';

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET(), { expiresIn: '24h' });
  res.json({ token, username: admin.username });
});

// All routes below require auth
router.use(auth);

// GET /api/admin/orders
router.get('/orders', (req, res) => {
  const { status, date } = req.query;
  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (status && status !== 'todos') {
    query += ' AND order_status = ?';
    params.push(status);
  }
  if (date) {
    query += ' AND DATE(created_at) = ?';
    params.push(date);
  }

  query += ' ORDER BY created_at DESC';
  const orders = db.prepare(query).all(...params);
  orders.forEach(o => { o.items = JSON.parse(o.items_json); delete o.items_json; });
  res.json(orders);
});

// GET /api/admin/orders/search?q=... (must come before /:id routes)
router.get('/orders/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 3) return res.status(400).json({ error: 'Mínimo 3 caracteres.' });

  const digit = q.replace(/\D/g, '');
  const last9 = digit.slice(-9);

  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE order_number LIKE ?
       OR customer_name LIKE ?
       OR (? != '' AND REPLACE(REPLACE(REPLACE(REPLACE(customer_phone,' ',''),'-',''),'(',''),')','') LIKE ?)
    ORDER BY created_at DESC
    LIMIT 25
  `).all(`%${q}%`, `%${q}%`, last9, `%${last9}`);

  orders.forEach(o => { o.items = JSON.parse(o.items_json || '[]'); delete o.items_json; });
  res.json(orders);
});

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['novo', 'confirmado', 'preparando', 'saiu', 'entregue', 'cancelado'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status inválido.' });

  const result = db.prepare(`
    UPDATE orders SET order_status = ?, updated_at = datetime('now','localtime') WHERE id = ?
  `).run(status, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ success: true });
});

// PATCH /api/admin/orders/:id/payment
router.patch('/orders/:id/payment', (req, res) => {
  const { payment_status } = req.body;
  const result = db.prepare(`
    UPDATE orders SET payment_status = ?, updated_at = datetime('now','localtime') WHERE id = ?
  `).run(payment_status, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ success: true });
});

// ── PRODUCTS ──────────────────────────────────────────────────────────────────

router.get('/products', (req, res) => {
  const products = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p JOIN categories c ON c.id = p.category_id
    ORDER BY c.sort_order, p.sort_order
  `).all();

  products.forEach(p => {
    p.variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order').all(p.id);
  });
  res.json(products);
});

router.post('/products', (req, res) => {
  const { category_id, name, description, has_variants, has_options, base_price, variants } = req.body;
  const result = db.prepare(`
    INSERT INTO products (category_id, name, description, has_variants, has_options, base_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(category_id, name, description || '', has_variants ? 1 : 0, has_options ? 1 : 0, base_price || null);

  const productId = result.lastInsertRowid;

  if (has_variants && variants && variants.length) {
    const ins = db.prepare('INSERT INTO product_variants (product_id, name, price, sort_order) VALUES (?, ?, ?, ?)');
    variants.forEach((v, i) => ins.run(productId, v.name, v.price, i));
  }

  res.status(201).json({ success: true, id: productId });
});

router.put('/products/:id', (req, res) => {
  const { name, description, has_variants, has_options, base_price, active, variants } = req.body;

  db.prepare(`
    UPDATE products SET name=?, description=?, has_variants=?, has_options=?, base_price=?, active=? WHERE id=?
  `).run(name, description || '', has_variants ? 1 : 0, has_options ? 1 : 0, base_price || null, active ? 1 : 0, req.params.id);

  if (variants !== undefined) {
    db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(req.params.id);
    if (variants.length) {
      const ins = db.prepare('INSERT INTO product_variants (product_id, name, price, sort_order) VALUES (?, ?, ?, ?)');
      variants.forEach((v, i) => ins.run(req.params.id, v.name, v.price, i));
    }
  }

  res.json({ success: true });
});

router.delete('/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── CATEGORIES ────────────────────────────────────────────────────────────────

router.get('/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order').all());
});

// ── COMBOS ────────────────────────────────────────────────────────────────────

router.get('/combos', (req, res) => {
  res.json(db.prepare('SELECT * FROM combos ORDER BY sort_order').all());
});

router.post('/combos', (req, res) => {
  const { name, tag, description, price, type } = req.body;
  const result = db.prepare('INSERT INTO combos (name, tag, description, price, type) VALUES (?, ?, ?, ?, ?)').run(name, tag || '', description || '', price, type || 'paid');
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.put('/combos/:id', (req, res) => {
  const { name, tag, description, price, type, active } = req.body;
  db.prepare('UPDATE combos SET name=?, tag=?, description=?, price=?, type=?, active=? WHERE id=?')
    .run(name, tag || '', description || '', price, type || 'paid', active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/combos/:id', (req, res) => {
  db.prepare('DELETE FROM combos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── PROMOÇÕES DO DIA ─────────────────────────────────────────────────────────

router.get('/promotions', (req, res) => {
  res.json(db.prepare('SELECT * FROM promotions ORDER BY id DESC').all());
});

router.post('/promotions', (req, res) => {
  const { title, message, tag, image_url, price, active } = req.body;
  if (!title) return res.status(400).json({ error: 'Título é obrigatório.' });
  const result = db.prepare('INSERT INTO promotions (title, message, tag, image_url, price, active) VALUES (?, ?, ?, ?, ?, ?)')
    .run(title, message || '', tag || '', image_url || '', price || null, active === false ? 0 : 1);
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.put('/promotions/:id', (req, res) => {
  const { title, message, tag, image_url, price, active } = req.body;
  if (!title) return res.status(400).json({ error: 'Título é obrigatório.' });
  db.prepare('UPDATE promotions SET title=?, message=?, tag=?, image_url=?, price=?, active=? WHERE id=?')
    .run(title, message || '', tag || '', image_url || '', price || null, active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/promotions/:id', (req, res) => {
  db.prepare('DELETE FROM promotions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── REPORTS ───────────────────────────────────────────────────────────────────

router.get('/reports', (req, res) => {
  const { period } = req.query; // 'today', 'week', 'month'

  let dateFilter = "DATE(created_at) = DATE('now','localtime')";
  if (period === 'week') dateFilter = "DATE(created_at) >= DATE('now','localtime','-7 days')";
  if (period === 'month') dateFilter = "DATE(created_at) >= DATE('now','localtime','-30 days')";

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_orders,
      SUM(CASE WHEN order_status != 'cancelado' THEN total ELSE 0 END) as total_revenue,
      SUM(CASE WHEN order_status = 'entregue' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN order_status = 'cancelado' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN order_status = 'novo' THEN 1 ELSE 0 END) as pending
    FROM orders WHERE ${dateFilter}
  `).get();

  const byDay = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as orders, SUM(CASE WHEN order_status != 'cancelado' THEN total ELSE 0 END) as revenue
    FROM orders
    WHERE ${dateFilter}
    GROUP BY day ORDER BY day DESC
  `).all();

  const byPayment = db.prepare(`
    SELECT payment_method, COUNT(*) as count, SUM(total) as total
    FROM orders WHERE ${dateFilter} AND order_status != 'cancelado'
    GROUP BY payment_method
  `).all();

  res.json({ summary, byDay, byPayment });
});

// ── ROTA DE ENTREGA ───────────────────────────────────────────────────────────

let _storeCoords = null; // cache em memória

async function geocodeSingle(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=br`;
  const r = await fetch(url, { headers: { 'User-Agent': 'PointDosMalokas/1.0 ladeiatortelli8@gmail.com' } });
  const data = await r.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function geocode(address) { return geocodeSingle(address); }

async function calcOSRM(origin, dest) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PointDosMalokas/1.0' } });
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) return null;
  return {
    minutes: Math.round(data.routes[0].duration / 60),
    km: (data.routes[0].distance / 1000).toFixed(1),
  };
}

// GET /api/admin/route/:orderId
router.get('/route/:orderId', async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  const storeAddr = process.env.STORE_ADDRESS || 'Rua Esperantinópolis, 346, São Paulo, SP';
  const customerAddr = [order.street, order.number, order.neighborhood, order.city || 'São Paulo'].filter(Boolean).join(', ');

  // Navigation URLs are always available regardless of geocoding result
  const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(customerAddr)}&navigate=yes`;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(storeAddr)}&destination=${encodeURIComponent(customerAddr)}&travelmode=driving`;

  try {
    // Geocode store (cached after first call)
    if (!_storeCoords) {
      _storeCoords = await geocodeSingle(storeAddr);
      if (_storeCoords) {
        console.log(`[Route] Loja geocodificada: ${_storeCoords.lat},${_storeCoords.lng}`);
      } else {
        console.warn('[Route] Loja não geocodificada, retornando só links de navegação.');
        return res.json({ minutes: null, km: null, wazeUrl, mapsUrl, customerAddr });
      }
    }

    // Geocode customer with progressive fallbacks
    const fallbacks = [
      customerAddr,
      [order.street, order.number, order.city || 'São Paulo'].join(', '),
      [order.street, order.city || 'São Paulo'].join(', '),
    ];
    let destCoords = null;
    for (const addr of fallbacks) {
      await new Promise(r => setTimeout(r, 350));
      destCoords = await geocodeSingle(addr);
      if (destCoords) { console.log(`[Route] Cliente geocodificado via: ${addr}`); break; }
    }
    if (!destCoords) {
      console.warn(`[Route] Cliente não geocodificado: ${customerAddr}`);
      return res.json({ minutes: null, km: null, wazeUrl, mapsUrl, customerAddr });
    }

    // Calculate route via OSRM
    const route = await calcOSRM(_storeCoords, destCoords);
    if (!route) {
      console.warn('[Route] OSRM não retornou rota');
      return res.json({ minutes: null, km: null, wazeUrl, mapsUrl, customerAddr });
    }

    console.log(`[Route] ${customerAddr} → ${route.minutes}min / ${route.km}km`);
    res.json({ ...route, wazeUrl, mapsUrl, customerAddr });

  } catch (err) {
    console.error('[Route] Erro:', err.message);
    // Even on error, return navigation URLs so the admin can still navigate
    res.json({ minutes: null, km: null, wazeUrl, mapsUrl, customerAddr, warning: err.message });
  }
});

// GET /api/admin/me
router.get('/me', (req, res) => {
  res.json({ username: req.admin.username });
});

// PUT /api/admin/password
router.put('/password', (req, res) => {
  const { current_password, new_password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);

  if (!bcrypt.compareSync(current_password, admin.password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, req.admin.id);
  res.json({ success: true });
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────

// GET /api/admin/settings
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  res.json(s);
});

// PUT /api/admin/settings
router.put('/settings', (req, res) => {
  const allowed = ['store_open', 'delivery_fee', 'pix_key', 'store_phone', 'store_name'];
  const upd = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  allowed.forEach(key => {
    if (req.body[key] !== undefined) upd.run(String(req.body[key]), key);
  });
  res.json({ ok: true });
});

// PUT /api/admin/settings/password
router.put('/settings/password', (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Nova senha deve ter ao menos 6 caracteres.' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(req.admin.username);
  if (!admin || !bcrypt.compareSync(current_password, admin.password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }
  db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?')
    .run(bcrypt.hashSync(new_password, 10), req.admin.username);
  res.json({ ok: true });
});

module.exports = router;
