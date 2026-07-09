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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS product_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      category_id INTEGER,
      option_group TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      max_select INTEGER DEFAULT NULL
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

    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT,
      tag TEXT,
      image_url TEXT DEFAULT '',
      price REAL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
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

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      keys_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // migrações para bancos já existentes
  try { db.exec("ALTER TABLE promotions ADD COLUMN image_url TEXT DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE promotions ADD COLUMN price REAL"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN change_for REAL"); } catch {}
  try { db.exec("ALTER TABLE product_options ADD COLUMN max_select INTEGER DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN delivery_fee REAL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN delivery_type TEXT DEFAULT 'entrega'"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN pix_dynamic INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN pix_claimed INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN pix_payload TEXT"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN awaiting_pix_claim INTEGER DEFAULT 0"); } catch {}
  db.exec(`UPDATE product_options SET max_select = 1 WHERE option_group IN ('Sabor','Sabores','Recheio 1','Recheio 2') AND max_select IS NULL`);
  db.exec(`UPDATE product_options SET max_select = 3 WHERE option_group = 'Recheios (até 3)' AND max_select IS NULL`);

  migrateMenuPrices();
  migrateAcaiPerSize();
  migrateCaipirinhaSabores();

  seedSettings();
  seed();
}

function seedSettings() {
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  [
    ['store_open',    '1'],
    ['delivery_fee',  '0'],
    ['pix_key',       process.env.PIX_KEY || '+5511961962855'],
    ['store_phone',   '(11) 94729-1983'],
    ['store_name',    'Point dos Malokas Lanches e Bebidas'],
  ].forEach(([k, v]) => ins.run(k, v));

  // Sincroniza pix_key com env var sempre que o servidor iniciar
  if (process.env.PIX_KEY) {
    db.prepare("UPDATE settings SET value = ? WHERE key = 'pix_key'").run(process.env.PIX_KEY);
  }
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

  const iCat   = db.prepare('INSERT INTO categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)');
  const iProd  = db.prepare('INSERT INTO products (category_id, name, description, has_variants, has_options, base_price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const iVar   = db.prepare('INSERT INTO product_variants (product_id, name, price, sort_order) VALUES (?, ?, ?, ?)');
  const iOpt   = db.prepare('INSERT INTO product_options (product_id, category_id, option_group, name, price, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const iCombo = db.prepare('INSERT INTO combos (name, tag, description, price, type, sort_order) VALUES (?, ?, ?, ?, ?, ?)');

  function addSucoVariants(pid) {
    iVar.run(pid, '500ml c/ Água',  13.00, 1);
    iVar.run(pid, '500ml c/ Leite', 15.00, 2);
    iVar.run(pid, '700ml c/ Água',  16.00, 3);
    iVar.run(pid, '700ml c/ Leite', 20.00, 4);
  }

  db.transaction(() => {
    // ── 1. AÇAÍ ──────────────────────────────────────────────────────────────
    const acaiCat = iCat.run('Açaí', 'acai', '🍇', 1).lastInsertRowid;

    const iOptMax = db.prepare('INSERT INTO product_options (product_id, category_id, option_group, name, price, sort_order, max_select) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const _gel  = ['Açaí','Cupuaçu','Mangaba','Sorvete Morango','Sorvete Chocolate','Sorvete Céu Azul','Sorvete Ninho Trufado','Sorvete Flocos','Sorvete Ferrero Rocher','Sorvete Sensação'];
    const _fr   = ['Banana','Morango','Abacaxi','Kiwi','Manga','Uva Verde'];
    const _ing  = ['Ovomaltine','Chocoboll','Amendoim','Paçoca','Leite em Pó','Granulado','Gotas de Chocolate','Bolinha P&B','Granola','Sucrilhos'];
    const _cald = ['Morango','Leite Condensado','Maracujá','Limão','Caramelo','Chocolate'];

    const addAcaiOpts = (pid, frMax, ingMax) => {
      let o = 0;
      _gel.forEach(n  => iOptMax.run(pid, null, 'Gelado',           n, 0,    o++, 1));
      _fr.forEach(n   => iOptMax.run(pid, null, 'Frutas',           n, 0,    o++, frMax));
      _ing.forEach(n  => iOptMax.run(pid, null, 'Ingredientes',     n, 0,    o++, ingMax));
      _cald.forEach(n => iOptMax.run(pid, null, 'Caldas',           n, 0,    o++, 1));
      iOptMax.run(pid, null, 'Adicionais Extras', '1 Camada de Nutella', 6.00, o++, null);
      iOptMax.run(pid, null, 'Adicionais Extras', 'Creme de Ninho',      3.00, o++, null);
    };

    [
      { ml:'300ml', base:9.00,  truf:12.00, fr:1, ing:2, s:1, st:5 },
      { ml:'400ml', base:12.00, truf:15.00, fr:2, ing:2, s:2, st:6 },
      { ml:'500ml', base:13.00, truf:16.00, fr:2, ing:3, s:3, st:7 },
      { ml:'700ml', base:20.00, truf:23.00, fr:2, ing:5, s:4, st:8 },
    ].forEach(sz => {
      const fl = sz.fr === 1 ? '1 fruta' : `${sz.fr} frutas`;
      addAcaiOpts(iProd.run(acaiCat, `Açaí ${sz.ml}`,        `Monte do seu jeito · 1 calda · ${fl} · ${sz.ing} ingredientes`,              0, 1, sz.base, sz.s ).lastInsertRowid, sz.fr, sz.ing);
      addAcaiOpts(iProd.run(acaiCat, `Açaí Trufado ${sz.ml}`,`Premium · Com cobertura especial · 1 calda · ${fl} · ${sz.ing} ingredientes`, 0, 1, sz.truf, sz.st).lastInsertRowid, sz.fr, sz.ing);
    });

    // ── 2. GARRAFINHAS DE AÇAÍ ───────────────────────────────────────────────
    const garrCat = iCat.run('Garrafinhas de Açaí', 'garrafinhas', '🍶', 2).lastInsertRowid;
    [
      ['Açaí c/ Mousse de Maracujá', 'Maracujá fresco com açaí gelado'],
      ['Açaí c/ Mousse de Morango',  'Morango fresco com açaí gelado'],
      ['Açaí c/ Creme de Ninho',     'Creme de Ninho com açaí gelado'],
      ['Açaí c/ Nutella',            'Nutella com açaí gelado'],
    ].forEach(([name, desc], i) => {
      const pid = iProd.run(garrCat, name, desc, 1, 0, null, i + 1).lastInsertRowid;
      iVar.run(pid, '300ml', 15.00, 1); iVar.run(pid, '500ml', 18.00, 2);
    });

    // ── 3. SUCOS NATURAIS ─────────────────────────────────────────────────────
    const sucosCat = iCat.run('Sucos Naturais', 'sucos', '🥤', 3).lastInsertRowid;
    [
      ['Morango','Feito com frutas selecionadas · 100% Natural',1],
      ['Maracujá','Feito com frutas selecionadas · 100% Natural',2],
      ['Melancia','Feito com frutas selecionadas · 100% Natural',3],
      ['Abacaxi','Feito com frutas selecionadas · 100% Natural',4],
      ['Abacaxi c/ Hortelã','Feito com frutas selecionadas · 100% Natural',5],
      ['Morango c/ Hortelã','Feito com frutas selecionadas · 100% Natural',6],
      ['Goiaba','Feito com frutas selecionadas · 100% Natural',7],
      ['Manga','Feito com frutas selecionadas · 100% Natural',8],
    ].forEach(([name, desc, sort]) => {
      addSucoVariants(iProd.run(sucosCat, name, desc, 1, 0, null, sort).lastInsertRowid);
    });
    [
      ['Laranja Natural','500ml ou 700ml · Espremida na hora',9],
      ['Limão','500ml ou 700ml · Feito na hora',10],
    ].forEach(([name, desc, sort]) => {
      const pid = iProd.run(sucosCat, name, desc, 1, 0, null, sort).lastInsertRowid;
      iVar.run(pid, '500ml', 13.00, 1); iVar.run(pid, '700ml', 20.00, 2);
    });

    // ── 4. HAMBÚRGUER ─────────────────────────────────────────────────────────
    const burgerCat = iCat.run('Hambúrguer', 'hamburguer', '🍔', 4).lastInsertRowid;
    [
      ['X Burguer Tradicional Maloka','Pão de hambúrguer · Queijo prato · Hambúrguer de picanha · Maionese tradicional',12.00,1],
      ['X Burguer Artesanal do Chef','Pão de brioche · Hambúrguer artesanal · Queijo prato · Maionese especial',19.00,2],
      ['X Salada Maloka','Pão de hambúrguer · Queijo prato · Hambúrguer de picanha · Maionese · Alface · Tomate',13.00,3],
      ['X Salada do Chef','Pão de brioche · Hambúrguer artesanal · Queijo prato · Maionese especial · Alface · Tomate · Cebola roxa',21.00,4],
      ['Big Burguer Maloka','Pão de hambúrguer · 2 hambúrgueres de picanha · Queijo prato · Maionese tradicional',16.00,5],
      ['Big Burguer do Chef','Pão de brioche · 2 hambúrgueres artesanais · Queijo prato · Maionese especial',24.00,6],
      ['X Egg Maloka','Pão de hambúrguer · Queijo prato · Ovo · Hambúrguer de picanha · Maionese · Alface · Tomate',16.00,7],
      ['Egg Maloka do Chef','Pão de brioche · Hambúrguer artesanal · Maionese especial · Ovo · Queijo prato · Alface · Tomate',24.00,8],
      ['X Cheddar Maloka','Pão de hambúrguer · Hambúrguer de picanha · Queijo prato · Cheddar · Maionese tradicional',16.00,9],
      ['Duplo Cheddar do Chef','Pão de brioche · 2 hambúrgueres artesanais · Cheddar · Queijo prato',25.00,10],
      ['X Catupiry Maloka','Pão de hambúrguer · Hambúrguer de picanha · Queijo prato · Catupiry',16.00,11],
      ['X Catupiry do Chef','Pão de brioche · Hambúrguer artesanal · Queijo prato · Catupiry',24.00,12],
      ['X Bacon Maloka','Pão de hambúrguer · Hambúrguer de picanha · Bacon · Queijo prato · Maionese · Alface · Tomate',16.00,13],
      ['X Bacon do Chef','Pão de brioche · Hambúrguer artesanal · Fatias de bacon · Queijo prato · Alface · Tomate',24.00,14],
      ['X Calabresa Maloka','Pão de hambúrguer · Hambúrguer de picanha · Calabresa · Queijo prato · Maionese · Alface · Tomate',16.00,15],
      ['X Calabresa do Chef','Pão de brioche · Hambúrguer artesanal · Calabresa · Queijo prato · Maionese especial · Alface · Tomate',24.00,16],
      ['X Egg Bacon Maloka','Pão de hambúrguer · Hambúrguer de picanha · Ovo · Bacon · Queijo prato · Maionese · Alface · Tomate',18.00,17],
      ['Egg Bacon do Chef','Pão de brioche · Hambúrguer artesanal · Maionese especial · Bacon · Ovo · Alface · Tomate',26.00,18],
      ['X Tudo Maloka','Pão de hambúrguer · 2 hambúrgueres de picanha · Queijo prato · Calabresa · Ovo · Bacon · Alface · Tomate',22.00,19],
      ['O Magnífico do Chef','Pão de brioche · 2 hambúrgueres artesanais · Queijo prato · Calabresa · Ovo · Bacon · Maionese especial · Presunto',30.00,20],
    ].forEach(([name, desc, price, sort]) => iProd.run(burgerCat, name, desc, 0, 1, price, sort));
    [['Bacon',3],['Catupiry',3],['Cheddar',3],['Ovo',2],['Milho',3],['Batata Palha',3],['Cebola Roxa',3]]
      .forEach(([name, price], i) => iOpt.run(null, burgerCat, 'Adicionais Extras', name, price, i));

    // ── 5. BATATA FRITA ───────────────────────────────────────────────────────
    const batataCat = iCat.run('Batata Frita', 'batata', '🍟', 5).lastInsertRowid;
    const batata = iProd.run(batataCat, 'Batata Frita', 'Crocante, quentinha e irresistível!', 1, 1, null, 1).lastInsertRowid;
    iVar.run(batata, 'Pequena', 10.00, 1); iVar.run(batata, 'Média', 15.00, 2); iVar.run(batata, 'Grande', 20.00, 3);
    iOpt.run(batata, null, 'Adicionais Extras', 'Bacon',           3.00, 0);
    iOpt.run(batata, null, 'Adicionais Extras', 'Cheddar',         3.00, 1);
    iOpt.run(batata, null, 'Adicionais Extras', 'Bacon e Cheddar', 5.00, 2);

    // ── 6. PASTEL DE FEIRA ────────────────────────────────────────────────────
    const pastelCat = iCat.run('Pastel de Feira', 'pastel', '🥟', 6).lastInsertRowid;

    const pastel1 = iProd.run(pastelCat, 'Pastel Tradicional', 'Feito na hora · Frito na hora · Escolha o recheio', 1, 0, null, 1).lastInsertRowid;
    ['Carne','Queijo','Frango','Calabresa'].forEach((n, i) => iVar.run(pastel1, n, 10.00, i + 1));

    const pastel2 = iProd.run(pastelCat, 'Pastel 2 Sabores', 'Feito na hora · Escolha o sabor', 1, 0, null, 2).lastInsertRowid;
    [
      'Carne com Queijo','Carne c/ Cheddar','Carne c/ Catupiry','Carne c/ Ovo','Carne c/ Bacon',
      'Frango c/ Catupiry','Frango c/ Queijo','Frango c/ Cheddar','Frango c/ Bacon',
      'Calabresa c/ Queijo','Calabresa c/ Catupiry','Calabresa c/ Bacon','Calabresa c/ Cheddar',
      'Queijo c/ Milho','Três Queijos','Bauru','Portuguesa','Pizza','Bacon Queijo',
    ].forEach((n, i) => iVar.run(pastel2, n, 12.00, i + 1));

    const pastel3 = iProd.run(pastelCat, 'Pastel Premium', 'Recheios especiais · R$ 15,00 cada', 1, 0, null, 3).lastInsertRowid;
    ['Camarão c/ Queijo','Camarão c/ Catupiry','Carne Seca c/ Queijo','Carne Seca c/ Catupiry']
      .forEach((n, i) => iVar.run(pastel3, n, 15.00, i + 1));

    const pastel4 = iProd.run(pastelCat, 'Monte seu Pastel', 'Até 3 recheios por R$ 15,00 · Exceto premium', 0, 1, 15.00, 4).lastInsertRowid;
    ['Carne','Queijo','Frango','Calabresa','Bacon','Cheddar','Catupiry','Ovo','Milho','Bauru','Pizza','Portuguesa','Três Queijos','Queijo c/ Milho','Bacon Queijo']
      .forEach((n, i) => iOpt.run(pastel4, null, 'Recheios (até 3)', n, 0, i));

    // ── 7. CAIPIRINHAS ────────────────────────────────────────────────────────
    const caipCat = iCat.run('Caipirinhas', 'caipirinhas', '🍹', 7).lastInsertRowid;

    const caipTrad = iProd.run(caipCat, 'Caipirinha Tradicional', 'Feita na hora com frutas frescas · Escolha o sabor e a bebida', 1, 1, null, 1).lastInsertRowid;
    [['Com Vodka',15.99],['Com Velho Barreiro',13.99],['Com Sakê',19.99],['Com Jurupinga',19.99]]
      .forEach(([n, p], i) => iVar.run(caipTrad, n, p, i + 1));
    ['Abacaxi','Abacaxi c/ Hortelã','Morango','Morango c/ Hortelã','Maracujá',
     'Kiwi','Kiwi c/ Hortelã','Limão','Limão c/ Hortelã','Melancia','Melancia c/ Hortelã','Manga']
      .forEach((n, i) => iOpt.run(caipTrad, null, 'Sabor', n, 0, i));

    const caipGour = iProd.run(caipCat, 'Caipirinha Gourmet', 'Premium · Feita na hora com frutas frescas', 1, 1, null, 2).lastInsertRowid;
    [['Com Vodka',19.99],['Com Velho Barreiro',19.99],['Com Sakê',23.99],['Com Jurupinga',23.99]]
      .forEach(([n, p], i) => iVar.run(caipGour, n, p, i + 1));
    ['Abacaxi','Abacaxi c/ Hortelã','Abacaxi ao Vinho','Morango','Morango c/ Hortelã','Morango ao Vinho',
     'Maracujá','Kiwi','Kiwi c/ Hortelã','Limão','Limão c/ Hortelã','Melancia','Melancia c/ Hortelã','Manga']
      .forEach((n, i) => iOpt.run(caipGour, null, 'Sabor', n, 0, i));

    const caipPrem = iProd.run(caipCat, 'Caipirinha Premium', 'Sabores especiais · Top de linha', 1, 1, null, 3).lastInsertRowid;
    [['Com Vodka',22.99],['Com Velho Barreiro',22.99],['Com Sakê',26.99],['Com Jurupinga',28.99]]
      .forEach(([n, p], i) => iVar.run(caipPrem, n, p, i + 1));
    ['Céu Azul','Paçoca','Ovomaltine','Açaí c/ Morango','Açaí c/ Maracujá',
     'Ninho c/ Morango','Cupuaçu c/ Morango','Ovomaltine c/ Maracujá','Frutas Vermelhas']
      .forEach((n, i) => iOpt.run(caipPrem, null, 'Sabor', n, 0, i));

    const caip2Trad = iProd.run(caipCat, 'Caipirinha 2 Sabores Tradicional', 'Dois sabores incríveis em um só copo', 1, 1, null, 4).lastInsertRowid;
    [['Com Vodka',21.00],['Com Velho Barreiro',21.00],['Com Sakê',24.90],['Com Jurupinga',24.99]]
      .forEach(([n, p], i) => iVar.run(caip2Trad, n, p, i + 1));
    ['Morango c/ Limão','Abacaxi c/ Limão','Maracujá c/ Limão','Melancia c/ Limão',
     'Kiwi c/ Limão','Kiwi c/ Morango','Maracujá c/ Morango','Abacaxi c/ Morango']
      .forEach((n, i) => iOpt.run(caip2Trad, null, 'Sabores', n, 0, i));

    const caip2Gour = iProd.run(caipCat, 'Caipirinha 2 Sabores Gourmet', 'Dois sabores gourmet em um só copo', 1, 1, null, 5).lastInsertRowid;
    [['Com Vodka',24.99],['Com Velho Barreiro',24.99],['Com Sakê',26.99],['Com Jurupinga',26.99]]
      .forEach(([n, p], i) => iVar.run(caip2Gour, n, p, i + 1));
    ['Morango c/ Limão','Abacaxi c/ Limão','Maracujá c/ Limão','Melancia c/ Limão',
     'Kiwi c/ Limão','Kiwi c/ Morango','Maracujá c/ Morango','Abacaxi c/ Morango']
      .forEach((n, i) => iOpt.run(caip2Gour, null, 'Sabores', n, 0, i));

    // ── 8. BEBIDAS ────────────────────────────────────────────────────────────
    const bebCat = iCat.run('Bebidas', 'bebidas', '🥤', 8).lastInsertRowid;
    iProd.run(bebCat, 'Refrigerante Lata',  'Coca-Cola, Guaraná, Sprite',   0, 0, 6.00,  1);
    iProd.run(bebCat, 'Refrigerante 2L',    'Coca-Cola, Guaraná ou Sprite',  0, 0, 12.00, 2);
    iProd.run(bebCat, 'Água Mineral',       'Garrafa 500ml',                 0, 0, 4.00,  3);
    iProd.run(bebCat, 'Vinho Quente',       'Copo quentinho para a noite',   0, 0, 7.00,  4);

    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_acai_persize_v1', '1')").run();
    console.log('✅ Cardápio completo populado com sucesso!');
  })();
}

function migrateMenuPrices() {
  const caipCat = db.prepare("SELECT id FROM categories WHERE slug = 'caipirinhas'").get();
  const burCat  = db.prepare("SELECT id FROM categories WHERE slug = 'hamburguer'").get();
  if (!caipCat && !burCat) return;

  const updVar  = db.prepare('UPDATE product_variants SET price = ? WHERE name = ? AND product_id = (SELECT id FROM products WHERE name = ? AND category_id = ?)');
  const updProd = db.prepare('UPDATE products SET base_price = ? WHERE name = ? AND category_id = ?');

  if (caipCat) {
    const cid = caipCat.id;
    updVar.run(15.99, 'Com Vodka',          'Caipirinha Tradicional',         cid);
    updVar.run(19.99, 'Com Sakê',            'Caipirinha Tradicional',         cid);
    updVar.run(19.99, 'Com Jurupinga',       'Caipirinha Tradicional',         cid);
    updVar.run(19.99, 'Com Vodka',           'Caipirinha Gourmet',             cid);
    updVar.run(19.99, 'Com Velho Barreiro',  'Caipirinha Gourmet',             cid);
    updVar.run(23.99, 'Com Sakê',            'Caipirinha Gourmet',             cid);
    updVar.run(23.99, 'Com Jurupinga',       'Caipirinha Gourmet',             cid);
    updVar.run(28.99, 'Com Jurupinga',       'Caipirinha Premium',             cid);
    updVar.run(21.00, 'Com Vodka',           'Caipirinha 2 Sabores Tradicional', cid);
    updVar.run(21.00, 'Com Velho Barreiro',  'Caipirinha 2 Sabores Tradicional', cid);
    updVar.run(24.90, 'Com Sakê',            'Caipirinha 2 Sabores Tradicional', cid);
    updVar.run(24.99, 'Com Jurupinga',       'Caipirinha 2 Sabores Tradicional', cid);
    updVar.run(24.99, 'Com Vodka',           'Caipirinha 2 Sabores Gourmet',   cid);
    updVar.run(24.99, 'Com Velho Barreiro',  'Caipirinha 2 Sabores Gourmet',   cid);
    updVar.run(26.99, 'Com Sakê',            'Caipirinha 2 Sabores Gourmet',   cid);
    updVar.run(26.99, 'Com Jurupinga',       'Caipirinha 2 Sabores Gourmet',   cid);
  }

  if (burCat) {
    const bid = burCat.id;
    updProd.run(19.00, 'X Burguer Artesanal do Chef', bid);
    updProd.run(21.00, 'X Salada do Chef',            bid);
    updProd.run(24.00, 'Big Burguer do Chef',          bid);
    updProd.run(24.00, 'Egg Maloka do Chef',           bid);
    updProd.run(25.00, 'Duplo Cheddar do Chef',        bid);
    updProd.run(24.00, 'X Catupiry do Chef',           bid);
    updProd.run(24.00, 'X Bacon do Chef',              bid);
    updProd.run(24.00, 'X Calabresa do Chef',          bid);
    updProd.run(26.00, 'Egg Bacon do Chef',            bid);
    updProd.run(30.00, 'O Magnífico do Chef',          bid);
  }
}

function migrateCaipirinhaSabores() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'migration_caip_sabores_v1'").get()) return;

  const caipCat = db.prepare("SELECT id FROM categories WHERE slug = 'caipirinhas'").get();
  if (!caipCat) return;

  const getProd = db.prepare('SELECT id FROM products WHERE name = ? AND category_id = ?');
  const delOpts = db.prepare('DELETE FROM product_options WHERE product_id = ? AND option_group IN (?, ?)');
  const iOpt    = db.prepare('INSERT INTO product_options (product_id, category_id, option_group, name, price, sort_order) VALUES (?, ?, ?, ?, ?, ?)');

  const setOpts = (prodName, group, flavors) => {
    const prod = getProd.get(prodName, caipCat.id);
    if (!prod) return;
    delOpts.run(prod.id, group, 'Sabores');
    flavors.forEach((name, i) => iOpt.run(prod.id, null, group, name, 0, i));
    // garante max_select = 1
    db.prepare('UPDATE product_options SET max_select = 1 WHERE product_id = ? AND option_group = ?').run(prod.id, group);
  };

  setOpts('Caipirinha Tradicional', 'Sabor', [
    'Abacaxi','Abacaxi c/ Hortelã','Morango','Morango c/ Hortelã','Maracujá',
    'Kiwi','Kiwi c/ Hortelã','Limão','Limão c/ Hortelã','Melancia','Melancia c/ Hortelã','Manga',
  ]);

  setOpts('Caipirinha Gourmet', 'Sabor', [
    'Abacaxi','Abacaxi c/ Hortelã','Abacaxi ao Vinho','Morango','Morango c/ Hortelã','Morango ao Vinho',
    'Maracujá','Kiwi','Kiwi c/ Hortelã','Limão','Limão c/ Hortelã','Melancia','Melancia c/ Hortelã','Manga',
  ]);

  setOpts('Caipirinha Premium', 'Sabor', [
    'Céu Azul','Paçoca','Ovomaltine','Açaí c/ Morango','Açaí c/ Maracujá',
    'Ninho c/ Morango','Cupuaçu c/ Morango','Ovomaltine c/ Maracujá','Frutas Vermelhas',
  ]);

  const combo2 = [
    'Morango c/ Limão','Abacaxi c/ Limão','Maracujá c/ Limão','Melancia c/ Limão',
    'Kiwi c/ Limão','Kiwi c/ Morango','Maracujá c/ Morango','Abacaxi c/ Morango',
  ];
  setOpts('Caipirinha 2 Sabores Tradicional', 'Sabor', combo2);
  setOpts('Caipirinha 2 Sabores Gourmet',     'Sabor', combo2);

  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_caip_sabores_v1', '1')").run();
  console.log('✅ Sabores de caipirinhas atualizados.');
}

function migrateAcaiPerSize() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'migration_acai_persize_v1'").get()) return;

  const acaiCat = db.prepare("SELECT id FROM categories WHERE slug = 'acai'").get();
  if (!acaiCat) return;

  db.transaction(() => {
    db.prepare("DELETE FROM products WHERE name IN ('Açaí Tradicional','Açaí Trufado') AND category_id = ?").run(acaiCat.id);
    db.prepare("DELETE FROM product_options WHERE category_id = ? AND product_id IS NULL").run(acaiCat.id);

    const iProd2 = db.prepare('INSERT INTO products (category_id, name, description, has_variants, has_options, base_price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const iOptM  = db.prepare('INSERT INTO product_options (product_id, category_id, option_group, name, price, sort_order, max_select) VALUES (?, ?, ?, ?, ?, ?, ?)');

    const gel  = ['Açaí','Cupuaçu','Mangaba','Sorvete Morango','Sorvete Chocolate','Sorvete Céu Azul','Sorvete Ninho Trufado','Sorvete Flocos','Sorvete Ferrero Rocher','Sorvete Sensação'];
    const fr   = ['Banana','Morango','Abacaxi','Kiwi','Manga','Uva Verde'];
    const ing  = ['Ovomaltine','Chocoboll','Amendoim','Paçoca','Leite em Pó','Granulado','Gotas de Chocolate','Bolinha P&B','Granola','Sucrilhos'];
    const cald = ['Morango','Leite Condensado','Maracujá','Limão','Caramelo','Chocolate'];

    const addOpts = (pid, frMax, ingMax) => {
      let o = 0;
      gel.forEach(n  => iOptM.run(pid, null, 'Gelado',       n, 0,    o++, 1));
      fr.forEach(n   => iOptM.run(pid, null, 'Frutas',       n, 0,    o++, frMax));
      ing.forEach(n  => iOptM.run(pid, null, 'Ingredientes', n, 0,    o++, ingMax));
      cald.forEach(n => iOptM.run(pid, null, 'Caldas',       n, 0,    o++, 1));
      iOptM.run(pid, null, 'Adicionais Extras', '1 Camada de Nutella', 6.00, o++, null);
      iOptM.run(pid, null, 'Adicionais Extras', 'Creme de Ninho',      3.00, o++, null);
    };

    [
      { ml:'300ml', base:9.00,  truf:12.00, frc:1, ingc:2, s:1, st:5 },
      { ml:'400ml', base:12.00, truf:15.00, frc:2, ingc:2, s:2, st:6 },
      { ml:'500ml', base:13.00, truf:16.00, frc:2, ingc:3, s:3, st:7 },
      { ml:'700ml', base:20.00, truf:23.00, frc:2, ingc:5, s:4, st:8 },
    ].forEach(sz => {
      const fl = sz.frc === 1 ? '1 fruta' : `${sz.frc} frutas`;
      addOpts(iProd2.run(acaiCat.id, `Açaí ${sz.ml}`,         `Monte do seu jeito · 1 calda · ${fl} · ${sz.ingc} ingredientes`,             0, 1, sz.base, sz.s ).lastInsertRowid, sz.frc, sz.ingc);
      addOpts(iProd2.run(acaiCat.id, `Açaí Trufado ${sz.ml}`, `Premium · Com cobertura especial · 1 calda · ${fl} · ${sz.ingc} ingredientes`, 0, 1, sz.truf, sz.st).lastInsertRowid, sz.frc, sz.ingc);
    });

    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_acai_persize_v1', '1')").run();
    console.log('✅ Migração açaí por tamanho concluída.');
  })();
}

init();

module.exports = db;
