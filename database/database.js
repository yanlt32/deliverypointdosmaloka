const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let dbDir = process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname);
try {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
} catch {
  console.warn(`[DB] Não foi possível usar ${dbDir}, usando diretório local.`);
  dbDir = path.join(__dirname);
}

const db = new Database(path.join(dbDir, 'delivery.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT '🍽️',
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      has_variants INTEGER DEFAULT 0,
      has_options INTEGER DEFAULT 0,
      base_price REAL,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      category_id INTEGER,
      option_group TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS combos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tag TEXT,
      description TEXT,
      price REAL NOT NULL,
      type TEXT DEFAULT 'paid',
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      street TEXT NOT NULL,
      number TEXT NOT NULL,
      complement TEXT,
      neighborhood TEXT NOT NULL,
      city TEXT DEFAULT 'São Paulo',
      reference TEXT,
      items_json TEXT NOT NULL,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT DEFAULT 'pendente',
      order_status TEXT DEFAULT 'novo',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  seed();
}

function seed() {
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get();
  if (adminCount.c === 0) {
    const user = process.env.ADMIN_USER || 'admin';
    const pass = process.env.ADMIN_PASS || 'pointmalokas2025';
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(user, hash);
    console.log(`✅ Admin criado: ${user} / ${pass}`);
  }

  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (catCount.c > 0) return;

  const insertCat = db.prepare('INSERT INTO categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)');
  const insertProd = db.prepare(`INSERT INTO products (category_id, name, description, has_variants, has_options, base_price, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertVariant = db.prepare('INSERT INTO product_variants (product_id, name, price, sort_order) VALUES (?, ?, ?, ?)');
  const insertOption = db.prepare('INSERT INTO product_options (product_id, category_id, option_group, name, price, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const insertCombo = db.prepare('INSERT INTO combos (name, tag, description, price, type, sort_order) VALUES (?, ?, ?, ?, ?, ?)');

  db.transaction(() => {
    // Categories
    const acaiCat = insertCat.run('Açaí', 'acai', '🍇', 1).lastInsertRowid;
    const burgerCat = insertCat.run('Hambúrguer', 'hamburguer', '🍔', 2).lastInsertRowid;
    const pastelCat = insertCat.run('Pastel de Feira', 'pastel', '🥟', 3).lastInsertRowid;
    const bebidaCat = insertCat.run('Bebidas', 'bebidas', '🥤', 4).lastInsertRowid;

    // Açaí Tradicional
    const acai1 = insertProd.run(acaiCat, 'Açaí Tradicional', 'Açaí · Cupuaçu · Sorvete', 1, 1, null, 1).lastInsertRowid;
    insertVariant.run(acai1, '300ml', 8.00, 1);
    insertVariant.run(acai1, '400ml', 10.00, 2);
    insertVariant.run(acai1, '500ml', 12.00, 3);
    insertVariant.run(acai1, '700ml', 15.00, 4);

    // Açaí Trufado
    const acai2 = insertProd.run(acaiCat, 'Açaí Trufado', 'Premium · Com cobertura especial', 1, 1, null, 2).lastInsertRowid;
    insertVariant.run(acai2, '300ml', 11.00, 1);
    insertVariant.run(acai2, '400ml', 13.00, 2);
    insertVariant.run(acai2, '500ml', 15.00, 3);
    insertVariant.run(acai2, '700ml', 18.00, 4);

    // Vitaminas
    const vita = insertProd.run(acaiCat, 'Vitaminas 500ml', 'Açaí batido com frutas', 1, 0, null, 3).lastInsertRowid;
    insertVariant.run(vita, 'Açaí c/ Banana', 12.00, 1);
    insertVariant.run(vita, 'Açaí c/ Morango', 12.00, 2);
    insertVariant.run(vita, 'Açaí c/ Banana & Morango', 13.00, 3);

    // Options para açaí (linked to category)
    const acaiOpts = [
      ['Gelados', 'Açaí', 0], ['Gelados', 'Cupuaçu', 0], ['Gelados', 'Mangaba', 0],
      ['Gelados', 'Flocos', 0], ['Gelados', 'Sensação', 0], ['Gelados', 'Chocolate', 0],
      ['Gelados', 'Morango', 0], ['Gelados', 'Maracujá', 0],
      ['Acompanhamentos', 'Confetti', 0], ['Acompanhamentos', 'Paçoca', 0],
      ['Acompanhamentos', 'Granola', 0], ['Acompanhamentos', 'Amendoim', 0],
      ['Acompanhamentos', 'Sucrilhos', 0], ['Acompanhamentos', 'Chocoboll', 0],
      ['Acompanhamentos', 'Gotas de Choc.', 0], ['Acompanhamentos', 'Bolinha P&B', 0],
      ['Acompanhamentos', 'Ovomaltine', 0],
      ['Frutas', 'Morango', 0], ['Frutas', 'Banana', 0], ['Frutas', 'Abacaxi', 0], ['Frutas', 'Kiwi', 0],
      ['Coberturas', 'Morango', 0], ['Coberturas', 'Leite Condensado', 0],
      ['Coberturas', 'Maracujá', 0], ['Coberturas', 'Limão', 0],
      ['Coberturas', 'Chocolate', 0], ['Coberturas', 'Caramelo', 0],
      ['Adicionais Extras', 'Bis', 3.00], ['Adicionais Extras', '01 Camada de Nutella', 5.00],
      ['Adicionais Extras', '03 Camadas de Morango', 3.00],
    ];
    acaiOpts.forEach(([group, name, price], i) => {
      insertOption.run(null, acaiCat, group, name, price, i);
    });

    // Hambúrguer
    insertProd.run(burgerCat, 'Hambúrguer de Picanha', 'Artesanal · Pão brioche · Queijo prato · Bacon crocante', 0, 0, 32.00, 1);
    insertProd.run(burgerCat, 'Hambúrguer Clássico', 'Pão de hambúrguer · Blend 180g · Queijo · Alface · Tomate', 0, 0, 24.00, 2);
    insertProd.run(burgerCat, 'Hambúrguer Duplo', 'Dobro de carne · Dobro de sabor', 0, 0, 38.00, 3);

    // Pastel
    insertProd.run(pastelCat, '1 Pastel', 'Sabores: frango, carne, queijo, calabresa ou misto', 0, 0, 10.00, 1);
    insertProd.run(pastelCat, '3 Pastéis', 'Escolha 3 sabores diferentes', 0, 0, 27.00, 2);
    insertProd.run(pastelCat, '6 Pastéis', 'O combo perfeito pra galera', 0, 0, 45.00, 3);

    // Bebidas
    insertProd.run(bebidaCat, 'Refrigerante Lata', 'Coca-Cola, Guaraná, Sprite', 0, 0, 6.00, 1);
    insertProd.run(bebidaCat, 'Refrigerante 2L', 'Coca-Cola, Guaraná ou Sprite', 0, 0, 12.00, 2);
    insertProd.run(bebidaCat, 'Água Mineral', 'Garrafa 500ml', 0, 0, 4.00, 3);
    insertProd.run(bebidaCat, 'Vinho Quente', 'Copo quentinho para aquecer o corpo e o coração', 0, 0, 7.00, 4);

    // Combos
    insertCombo.run('Promoção Pastéis', '🔥 Promoção', '6 pastéis deliciosos + refrigerante 2 litros. Perfeito para a galera e a família!', 50.00, 'paid', 1);
    insertCombo.run('Oferta Açaí', '❄️ Oferta', 'Dois açaís 500ml por apenas R$20. Sabor irresistível e geladinho!', 20.00, 'paid', 2);
    insertCombo.run('Vinho Quente', '🍷 Especial', 'Copo quentinho para aquecer o corpo e o coração. Perfeito para noites frias!', 7.00, 'paid', 3);
    insertCombo.run('Combo Black Label', '👑 Elite', 'Whisky Original + 4 Gelo de Coco + 4 Red Bull. Para quem sabe o que quer.', 349.90, 'paid', 4);
    insertCombo.run('Gin Tanqueray VIP', '💎 VIP', 'Tanqueray + Tônica + Botânicos Especiais. Sofisticação da quebrada.', 289.00, 'paid', 5);

    console.log('✅ Banco de dados populado com sucesso!');
  })();
}

init();

module.exports = db;
