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
  `);

  // migrações para bancos já existentes
  try { db.exec("ALTER TABLE promotions ADD COLUMN image_url TEXT DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE promotions ADD COLUMN price REAL"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN change_for REAL"); } catch {}

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

    const acai1 = iProd.run(acaiCat, 'Açaí Tradicional', 'Gelado · Monte do seu jeito', 1, 1, null, 1).lastInsertRowid;
    iVar.run(acai1, '300ml', 9.00,  1); iVar.run(acai1, '400ml', 12.00, 2);
    iVar.run(acai1, '500ml', 13.00, 3); iVar.run(acai1, '700ml', 20.00, 4);

    const acai2 = iProd.run(acaiCat, 'Açaí Trufado', 'Premium · Com cobertura especial', 1, 1, null, 2).lastInsertRowid;
    iVar.run(acai2, '300ml', 12.00, 1); iVar.run(acai2, '400ml', 15.00, 2);
    iVar.run(acai2, '500ml', 16.00, 3); iVar.run(acai2, '700ml', 23.00, 4);

    let o = 0;
    ['Açaí','Cupuaçu','Mangaba','Sorvete Morango','Sorvete Chocolate',
     'Sorvete Céu Azul','Sorvete Ninho Trufado','Sorvete Flocos','Sorvete Ferrero Rocher','Sorvete Sensação']
      .forEach(n => iOpt.run(null, acaiCat, 'Gelados', n, 0, o++));
    ['Banana','Morango','Abacaxi','Kiwi','Manga','Uva Verde']
      .forEach(n => iOpt.run(null, acaiCat, 'Frutas', n, 0, o++));
    ['Ovomaltine','Chocoboll','Amendoim','Paçoca','Leite em Pó',
     'Granulado','Gotas de Chocolate','Bolinha P&B','Granola','Sucrilhos']
      .forEach(n => iOpt.run(null, acaiCat, 'Ingredientes', n, 0, o++));
    ['Morango','Leite Condensado','Maracujá','Limão','Caramelo','Chocolate']
      .forEach(n => iOpt.run(null, acaiCat, 'Caldas', n, 0, o++));
    iOpt.run(null, acaiCat, 'Adicionais Extras', '1 Camada de Nutella', 6.00, o++);
    iOpt.run(null, acaiCat, 'Adicionais Extras', 'Creme de Ninho',       3.00, o++);

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
      ['X Burguer Artesanal do Chef','Pão de brioche · Hambúrguer artesanal · Queijo prato · Maionese especial',14.00,2],
      ['X Salada Maloka','Pão de hambúrguer · Queijo prato · Hambúrguer de picanha · Maionese · Alface · Tomate',13.00,3],
      ['X Salada do Chef','Pão de brioche · Hambúrguer artesanal · Queijo prato · Maionese especial · Alface · Tomate · Cebola roxa',16.00,4],
      ['Big Burguer Maloka','Pão de hambúrguer · 2 hambúrgueres de picanha · Queijo prato · Maionese tradicional',16.00,5],
      ['Big Burguer do Chef','Pão de brioche · 2 hambúrgueres artesanais · Queijo prato · Maionese especial',19.00,6],
      ['X Egg Maloka','Pão de hambúrguer · Queijo prato · Ovo · Hambúrguer de picanha · Maionese · Alface · Tomate',16.00,7],
      ['Egg Maloka do Chef','Pão de brioche · Hambúrguer artesanal · Maionese especial · Ovo · Queijo prato · Alface · Tomate',19.00,8],
      ['X Cheddar Maloka','Pão de hambúrguer · Hambúrguer de picanha · Queijo prato · Cheddar · Maionese tradicional',16.00,9],
      ['Duplo Cheddar do Chef','Pão de brioche · 2 hambúrgueres artesanais · Cheddar · Queijo prato',20.00,10],
      ['X Catupiry Maloka','Pão de hambúrguer · Hambúrguer de picanha · Queijo prato · Catupiry',16.00,11],
      ['X Catupiry do Chef','Pão de brioche · Hambúrguer artesanal · Queijo prato · Catupiry',19.00,12],
      ['X Bacon Maloka','Pão de hambúrguer · Hambúrguer de picanha · Bacon · Queijo prato · Maionese · Alface · Tomate',16.00,13],
      ['X Bacon do Chef','Pão de brioche · Hambúrguer artesanal · Fatias de bacon · Queijo prato · Alface · Tomate',19.00,14],
      ['X Calabresa Maloka','Pão de hambúrguer · Hambúrguer de picanha · Calabresa · Queijo prato · Maionese · Alface · Tomate',16.00,15],
      ['X Calabresa do Chef','Pão de brioche · Hambúrguer artesanal · Calabresa · Queijo prato · Maionese especial · Alface · Tomate',19.00,16],
      ['X Egg Bacon Maloka','Pão de hambúrguer · Hambúrguer de picanha · Ovo · Bacon · Queijo prato · Maionese · Alface · Tomate',18.00,17],
      ['Egg Bacon do Chef','Pão de brioche · Hambúrguer artesanal · Maionese especial · Bacon · Ovo · Alface · Tomate',21.00,18],
      ['X Tudo Maloka','Pão de hambúrguer · 2 hambúrgueres de picanha · Queijo prato · Calabresa · Ovo · Bacon · Alface · Tomate',22.00,19],
      ['O Magnífico do Chef','Pão de brioche · 2 hambúrgueres artesanais · Queijo prato · Calabresa · Ovo · Bacon · Maionese especial · Presunto',25.00,20],
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

    const pastel2 = iProd.run(pastelCat, 'Pastel 2 Sabores', 'Escolha 2 recheios · Feito na hora', 0, 1, 12.00, 2).lastInsertRowid;
    ['Carne','Queijo','Frango','Calabresa','Bacon','Cheddar','Catupiry','Ovo','Milho']
      .forEach((n, i) => { iOpt.run(pastel2, null, 'Recheio 1', n, 0, i); iOpt.run(pastel2, null, 'Recheio 2', n, 0, i); });

    const pastel3 = iProd.run(pastelCat, 'Pastel Premium', 'Recheios especiais · R$ 15,00 cada', 1, 0, null, 3).lastInsertRowid;
    ['Camarão c/ Queijo','Camarão c/ Catupiry','Carne Seca c/ Queijo','Carne Seca c/ Catupiry']
      .forEach((n, i) => iVar.run(pastel3, n, 15.00, i + 1));

    const pastel4 = iProd.run(pastelCat, 'Monte seu Pastel', 'Até 3 recheios por R$ 15,00 · Exceto premium', 0, 1, 15.00, 4).lastInsertRowid;
    ['Carne','Queijo','Frango','Calabresa','Bacon','Cheddar','Catupiry','Ovo','Milho','Bauru','Pizza','Portuguesa','Três Queijos','Queijo c/ Milho','Bacon Queijo']
      .forEach((n, i) => iOpt.run(pastel4, null, 'Recheios (até 3)', n, 0, i));

    // ── 7. CAIPIRINHAS ────────────────────────────────────────────────────────
    const caipCat = iCat.run('Caipirinhas', 'caipirinhas', '🍹', 7).lastInsertRowid;

    const caipTrad = iProd.run(caipCat, 'Caipirinha Tradicional', 'Feita na hora com frutas frescas · Escolha o sabor e a bebida', 1, 1, null, 1).lastInsertRowid;
    [['Com Vodka',13.99],['Com Velho Barreiro',13.99],['Com Sakê',16.99],['Com Jurupinga',18.99]]
      .forEach(([n, p], i) => iVar.run(caipTrad, n, p, i + 1));
    ['Abacaxi','Abacaxi c/ Hortelã','Morango','Morango c/ Hortelã','Maracujá',
     'Kiwi','Kiwi c/ Hortelã','Limão','Limão c/ Hortelã','Melancia','Melancia c/ Hortelã','Manga']
      .forEach((n, i) => iOpt.run(caipTrad, null, 'Sabor', n, 0, i));

    const caipGour = iProd.run(caipCat, 'Caipirinha Gourmet', 'Premium · Feita na hora com frutas frescas', 1, 1, null, 2).lastInsertRowid;
    [['Com Vodka',15.99],['Com Velho Barreiro',15.99],['Com Sakê',20.00],['Com Jurupinga',25.00]]
      .forEach(([n, p], i) => iVar.run(caipGour, n, p, i + 1));
    ['Abacaxi','Abacaxi c/ Hortelã','Abacaxi ao Vinho','Morango','Morango c/ Hortelã','Morango ao Vinho',
     'Maracujá','Kiwi','Kiwi c/ Hortelã','Limão','Limão c/ Hortelã','Melancia','Melancia c/ Hortelã','Manga']
      .forEach((n, i) => iOpt.run(caipGour, null, 'Sabor', n, 0, i));

    const caipPrem = iProd.run(caipCat, 'Caipirinha Premium', 'Sabores especiais · Top de linha', 1, 1, null, 3).lastInsertRowid;
    [['Com Vodka',22.99],['Com Velho Barreiro',22.99],['Com Sakê',26.99],['Com Jurupinga',28.00]]
      .forEach(([n, p], i) => iVar.run(caipPrem, n, p, i + 1));
    ['Céu Azul','Paçoca','Ovomaltine','Açaí c/ Morango','Açaí c/ Maracujá',
     'Ninho c/ Morango','Cupuaçu c/ Morango','Ovomaltine c/ Maracujá','Frutas Vermelhas']
      .forEach((n, i) => iOpt.run(caipPrem, null, 'Sabor', n, 0, i));

    const caip2Trad = iProd.run(caipCat, 'Caipirinha 2 Sabores Tradicional', 'Dois sabores incríveis em um só copo', 1, 1, null, 4).lastInsertRowid;
    [['Com Vodka',16.99],['Com Velho Barreiro',16.99],['Com Sakê',21.00],['Com Jurupinga',21.99]]
      .forEach(([n, p], i) => iVar.run(caip2Trad, n, p, i + 1));
    ['Morango c/ Limão','Abacaxi c/ Limão','Maracujá c/ Limão','Melancia c/ Limão',
     'Kiwi c/ Limão','Kiwi c/ Morango','Maracujá c/ Morango','Abacaxi c/ Morango']
      .forEach((n, i) => iOpt.run(caip2Trad, null, 'Sabores', n, 0, i));

    const caip2Gour = iProd.run(caipCat, 'Caipirinha 2 Sabores Gourmet', 'Dois sabores gourmet em um só copo', 1, 1, null, 5).lastInsertRowid;
    [['Com Vodka',19.99],['Com Velho Barreiro',19.99],['Com Sakê',23.99],['Com Jurupinga',24.99]]
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

    // ── COMBOS ────────────────────────────────────────────────────────────────
    iCombo.run('Oferta Açaí',       '❄️ Oferta',   'Dois açaís 500ml por R$20. Geladinho!',                         20.00,  'paid', 1);
    iCombo.run('Combo Pastel',      '🔥 Promoção', '6 pastéis + refrigerante 2L. Perfeito pra galera!',             50.00,  'paid', 2);
    iCombo.run('Vinho Quente',      '🍷 Especial', 'Copo quentinho para noites frias!',                              7.00,  'paid', 3);
    iCombo.run('Combo Black Label', '👑 Elite',    'Whisky Original + 4 Gelo de Coco + 4 Red Bull.',               349.90, 'paid', 4);
    iCombo.run('Gin Tanqueray VIP', '💎 VIP',      'Tanqueray + Tônica + Botânicos Especiais.',                     289.00, 'paid', 5);

    console.log('✅ Cardápio completo populado com sucesso!');
  })();
}

init();

module.exports = db;
