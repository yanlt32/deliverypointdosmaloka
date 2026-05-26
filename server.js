require('dotenv').config({ path: '.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Root redirect must come BEFORE static middleware (otherwise index.html would be served)
app.get('/', (req, res) => res.redirect('/menu'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// API Routes
app.use('/api', require('./routes/clientRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/pagbank', require('./routes/pagbankRoutes'));

// Page routes
app.get('/menu', (req, res) => res.sendFile(path.join(__dirname, 'public', 'menu.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/pedido', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pedido.html')));
app.get('/meus-pedidos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'meus-pedidos.html')));

// Admin
app.get('/admin', (req, res) => res.redirect('/admin/login.html'));
app.get('/admin/', (req, res) => res.redirect('/admin/login.html'));

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Point dos Malokas — Servidor rodando em http://localhost:${PORT}`);
  console.log(`📦 Admin: http://localhost:${PORT}/admin`);
  console.log(`🔗 Webhook PagBank: http://localhost:${PORT}/api/pagbank/webhook`);
});
