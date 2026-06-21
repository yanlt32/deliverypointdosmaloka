// Script para popular o cardápio completo do Point dos Malokas Lanches e Bebidas
// Uso: node reset-menu.js
require('dotenv').config({ path: '.env' });
const db = require('./database/database');

db.exec(`
  DELETE FROM product_options;
  DELETE FROM product_variants;
  DELETE FROM products;
  DELETE FROM categories;
  DELETE FROM combos;
`);

const iCat  = db.prepare('INSERT INTO categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)');
const iProd = db.prepare(`INSERT INTO products (category_id, name, description, has_variants, has_options, base_price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const iVar  = db.prepare('INSERT INTO product_variants (product_id, name, price, sort_order) VALUES (?, ?, ?, ?)');
const iOpt  = db.prepare('INSERT INTO product_options (product_id, category_id, option_group, name, price, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
const iCombo = db.prepare('INSERT INTO combos (name, tag, description, price, type, sort_order) VALUES (?, ?, ?, ?, ?, ?)');

// ── VARIANTES DE SUCO PADRÃO ──────────────────────────────────────────────────
function addSucoVariants(pid) {
  iVar.run(pid, '500ml c/ Água',  13.00, 1);
  iVar.run(pid, '500ml c/ Leite', 15.00, 2);
  iVar.run(pid, '700ml c/ Água',  16.00, 3);
  iVar.run(pid, '700ml c/ Leite', 20.00, 4);
}

db.transaction(() => {

  // ── 1. AÇAÍ ────────────────────────────────────────────────────────────────
  const acaiCat = iCat.run('Açaí', 'acai', '🍇', 1).lastInsertRowid;

  const acai1 = iProd.run(acaiCat, 'Açaí Tradicional', 'Gelado · Monte do seu jeito', 1, 1, null, 1).lastInsertRowid;
  iVar.run(acai1, '300ml', 9.00,  1);
  iVar.run(acai1, '400ml', 12.00, 2);
  iVar.run(acai1, '500ml', 13.00, 3);
  iVar.run(acai1, '700ml', 20.00, 4);

  const acai2 = iProd.run(acaiCat, 'Açaí Trufado', 'Premium · Com cobertura especial', 1, 1, null, 2).lastInsertRowid;
  iVar.run(acai2, '300ml', 12.00, 1);
  iVar.run(acai2, '400ml', 15.00, 2);
  iVar.run(acai2, '500ml', 16.00, 3);
  iVar.run(acai2, '700ml', 23.00, 4);

  // Opções do açaí — vinculadas à CATEGORIA
  let o = 0;
  const gelados = ['Açaí','Cupuaçu','Mangaba','Sorvete Morango','Sorvete Chocolate',
    'Sorvete Céu Azul','Sorvete Ninho Trufado','Sorvete Flocos','Sorvete Ferrero Rocher','Sorvete Sensação'];
  gelados.forEach(n => iOpt.run(null, acaiCat, 'Gelados', n, 0, o++));

  const frutas = ['Banana','Morango','Abacaxi','Kiwi','Manga','Uva Verde'];
  frutas.forEach(n => iOpt.run(null, acaiCat, 'Frutas', n, 0, o++));

  const ingredientes = ['Ovomaltine','Chocoboll','Amendoim','Paçoca','Leite em Pó',
    'Granulado','Gotas de Chocolate','Bolinha P&B','Granola','Sucrilhos'];
  ingredientes.forEach(n => iOpt.run(null, acaiCat, 'Ingredientes', n, 0, o++));

  const caldas = ['Morango','Leite Condensado','Maracujá','Limão','Caramelo','Chocolate'];
  caldas.forEach(n => iOpt.run(null, acaiCat, 'Caldas', n, 0, o++));

  // Pagos
  iOpt.run(null, acaiCat, 'Adicionais Extras', '1 Camada de Nutella', 6.00, o++);
  iOpt.run(null, acaiCat, 'Adicionais Extras', 'Creme de Ninho',       3.00, o++);

  // ── 2. GARRAFINHAS DE AÇAÍ ─────────────────────────────────────────────────
  const garrCat = iCat.run('Garrafinhas de Açaí', 'garrafinhas', '🍶', 2).lastInsertRowid;

  const garrafinhas = [
    ['Açaí c/ Mousse de Maracujá', 'Maracujá fresco com açaí gelado'],
    ['Açaí c/ Mousse de Morango',  'Morango fresco com açaí gelado'],
    ['Açaí c/ Creme de Ninho',     'Creme de Ninho com açaí gelado'],
    ['Açaí c/ Nutella',            'Nutella com açaí gelado'],
  ];
  garrafinhas.forEach(([name, desc], i) => {
    const pid = iProd.run(garrCat, name, desc, 1, 0, null, i + 1).lastInsertRowid;
    iVar.run(pid, '300ml', 15.00, 1);
    iVar.run(pid, '500ml', 18.00, 2);
  });

  // ── 3. SUCOS ───────────────────────────────────────────────────────────────
  const sucosCat = iCat.run('Sucos Naturais', 'sucos', '🥤', 3).lastInsertRowid;

  const sucosStd = [
    ['Morango',          'Feito com frutas selecionadas · 100% Natural', 1],
    ['Maracujá',         'Feito com frutas selecionadas · 100% Natural', 2],
    ['Melancia',         'Feito com frutas selecionadas · 100% Natural', 3],
    ['Abacaxi',          'Feito com frutas selecionadas · 100% Natural', 4],
    ['Abacaxi c/ Hortelã','Feito com frutas selecionadas · 100% Natural', 5],
    ['Morango c/ Hortelã','Feito com frutas selecionadas · 100% Natural', 6],
    ['Goiaba',           'Feito com frutas selecionadas · 100% Natural', 7],
    ['Manga',            'Feito com frutas selecionadas · 100% Natural', 8],
  ];
  sucosStd.forEach(([name, desc, sort]) => {
    const pid = iProd.run(sucosCat, name, desc, 1, 0, null, sort).lastInsertRowid;
    addSucoVariants(pid);
  });

  // Sucos sem variante leite
  const sucosSemLeite = [
    ['Laranja Natural', '500ml ou 700ml · Espremida na hora', 9],
    ['Limão',           '500ml ou 700ml · Feito na hora',     10],
  ];
  sucosSemLeite.forEach(([name, desc, sort]) => {
    const pid = iProd.run(sucosCat, name, desc, 1, 0, null, sort).lastInsertRowid;
    iVar.run(pid, '500ml', 13.00, 1);
    iVar.run(pid, '700ml', 20.00, 2);
  });

  // ── 4. HAMBÚRGUER ──────────────────────────────────────────────────────────
  const burgerCat = iCat.run('Hambúrguer', 'hamburguer', '🍔', 4).lastInsertRowid;

  const burgers = [
    ['X Burguer Tradicional Maloka', 'Pão de hambúrguer · Queijo prato · Hambúrguer de picanha · Maionese tradicional', 12.00, 1],
    ['X Burguer Artesanal do Chef',  'Pão de brioche · Hambúrguer artesanal · Queijo prato · Maionese especial', 14.00, 2],
    ['X Salada Maloka',              'Pão de hambúrguer · Queijo prato · Hambúrguer de picanha · Maionese · Alface · Tomate', 13.00, 3],
    ['X Salada do Chef',             'Pão de brioche · Hambúrguer artesanal · Queijo prato · Maionese especial · Alface · Tomate · Cebola roxa', 16.00, 4],
    ['Big Burguer Maloka',           'Pão de hambúrguer · 2 hambúrgueres de picanha · Queijo prato · Maionese tradicional', 16.00, 5],
    ['Big Burguer do Chef',          'Pão de brioche · 2 hambúrgueres artesanais · Queijo prato · Maionese especial', 19.00, 6],
    ['X Egg Maloka',                 'Pão de hambúrguer · Queijo prato · Ovo · Hambúrguer de picanha · Maionese · Alface · Tomate', 16.00, 7],
    ['Egg Maloka do Chef',           'Pão de brioche · Hambúrguer artesanal · Maionese especial · Ovo · Queijo prato · Alface · Tomate', 19.00, 8],
    ['X Cheddar Maloka',             'Pão de hambúrguer · Hambúrguer de picanha · Queijo prato · Cheddar · Maionese tradicional', 16.00, 9],
    ['Duplo Cheddar do Chef',        'Pão de brioche · 2 hambúrgueres artesanais · Cheddar · Queijo prato', 20.00, 10],
    ['X Catupiry Maloka',            'Pão de hambúrguer · Hambúrguer de picanha · Queijo prato · Catupiry', 16.00, 11],
    ['X Catupiry do Chef',           'Pão de brioche · Hambúrguer artesanal · Queijo prato · Catupiry', 19.00, 12],
    ['X Bacon Maloka',               'Pão de hambúrguer · Hambúrguer de picanha · Bacon · Queijo prato · Maionese · Alface · Tomate', 16.00, 13],
    ['X Bacon do Chef',              'Pão de brioche · Hambúrguer artesanal · Fatias de bacon · Queijo prato · Alface · Tomate', 19.00, 14],
    ['X Calabresa Maloka',           'Pão de hambúrguer · Hambúrguer de picanha · Calabresa · Queijo prato · Maionese · Alface · Tomate', 16.00, 15],
    ['X Calabresa do Chef',          'Pão de brioche · Hambúrguer artesanal · Calabresa · Queijo prato · Maionese especial · Alface · Tomate', 19.00, 16],
    ['X Egg Bacon Maloka',           'Pão de hambúrguer · Hambúrguer de picanha · Ovo · Bacon · Queijo prato · Maionese · Alface · Tomate', 18.00, 17],
    ['Egg Bacon do Chef',            'Pão de brioche · Hambúrguer artesanal · Maionese especial · Bacon · Ovo · Alface · Tomate', 21.00, 18],
    ['X Tudo Maloka',                'Pão de hambúrguer · 2 hambúrgueres de picanha · Queijo prato · Calabresa · Ovo · Bacon · Alface · Tomate', 22.00, 19],
    ['O Magnífico do Chef',          'Pão de brioche · 2 hambúrgueres artesanais · Queijo prato · Calabresa · Ovo · Bacon · Maionese especial · Presunto', 25.00, 20],
  ];
  burgers.forEach(([name, desc, price, sort]) => {
    iProd.run(burgerCat, name, desc, 0, 1, price, sort);
  });

  // Adicionais pagos de hambúrguer — vinculados à categoria
  const burgerExtras = [
    ['Bacon',        3.00],
    ['Catupiry',     3.00],
    ['Cheddar',      3.00],
    ['Ovo',          2.00],
    ['Milho',        3.00],
    ['Batata Palha', 3.00],
    ['Cebola Roxa',  3.00],
  ];
  burgerExtras.forEach(([name, price], i) => {
    iOpt.run(null, burgerCat, 'Adicionais Extras', name, price, i);
  });

  // ── 5. BATATA FRITA ────────────────────────────────────────────────────────
  const batataCat = iCat.run('Batata Frita', 'batata', '🍟', 5).lastInsertRowid;

  const batata = iProd.run(batataCat, 'Batata Frita', 'Crocante, quentinha e irresistível!', 1, 1, null, 1).lastInsertRowid;
  iVar.run(batata, 'Pequena', 10.00, 1);
  iVar.run(batata, 'Média',   15.00, 2);
  iVar.run(batata, 'Grande',  20.00, 3);
  iOpt.run(batata, null, 'Adicionais Extras', 'Bacon',           3.00, 0);
  iOpt.run(batata, null, 'Adicionais Extras', 'Cheddar',         3.00, 1);
  iOpt.run(batata, null, 'Adicionais Extras', 'Bacon e Cheddar', 5.00, 2);

  // ── 6. PASTEL DE FEIRA ────────────────────────────────────────────────────
  const pastelCat = iCat.run('Pastel de Feira', 'pastel', '🥟', 6).lastInsertRowid;

  const pastel1 = iProd.run(pastelCat, 'Pastel Tradicional', 'Feito na hora · Frito na hora · Escolha o recheio', 1, 0, null, 1).lastInsertRowid;
  ['Carne','Queijo','Frango','Calabresa'].forEach((n, i) => iVar.run(pastel1, n, 10.00, i + 1));

  const pastel2 = iProd.run(pastelCat, 'Pastel 2 Sabores', 'Feito na hora · Escolha o sabor', 1, 0, null, 2).lastInsertRowid;
  const sabores2 = [
    'Carne com Queijo','Carne c/ Cheddar','Carne c/ Catupiry','Carne c/ Ovo','Carne c/ Bacon',
    'Frango c/ Catupiry','Frango c/ Queijo','Frango c/ Cheddar','Frango c/ Bacon',
    'Calabresa c/ Queijo','Calabresa c/ Catupiry','Calabresa c/ Bacon','Calabresa c/ Cheddar',
    'Queijo c/ Milho','Três Queijos','Bauru','Portuguesa','Pizza','Bacon Queijo',
  ];
  sabores2.forEach((n, i) => iVar.run(pastel2, n, 12.00, i + 1));

  const pastel3 = iProd.run(pastelCat, 'Pastel Premium', 'Recheios especiais · R$ 15,00 cada', 1, 0, null, 3).lastInsertRowid;
  [
    'Camarão c/ Queijo', 'Camarão c/ Catupiry',
    'Carne Seca c/ Queijo', 'Carne Seca c/ Catupiry',
  ].forEach((n, i) => iVar.run(pastel3, n, 15.00, i + 1));

  const pastel4 = iProd.run(pastelCat, 'Monte seu Pastel', 'Até 3 recheios por R$ 15,00 · Exceto premium', 0, 1, 15.00, 4).lastInsertRowid;
  const recheiosMonte = ['Carne','Queijo','Frango','Calabresa','Bacon','Cheddar','Catupiry','Ovo','Milho','Bauru','Pizza','Portuguesa','Três Queijos','Queijo c/ Milho','Bacon Queijo'];
  recheiosMonte.forEach((n, i) => iOpt.run(pastel4, null, 'Recheios (até 3)', n, 0, i));

  // ── 7. CAIPIRINHAS ────────────────────────────────────────────────────────
  const caipCat = iCat.run('Caipirinhas', 'caipirinhas', '🍹', 7).lastInsertRowid;

  // Caipirinhas Tradicionais
  const caipTrad = iProd.run(caipCat, 'Caipirinha Tradicional', 'Feita na hora com frutas frescas · Escolha o sabor e a bebida', 1, 1, null, 1).lastInsertRowid;
  iVar.run(caipTrad, 'Com Vodka',         13.99, 1);
  iVar.run(caipTrad, 'Com Velho Barreiro',13.99, 2);
  iVar.run(caipTrad, 'Com Sakê',          16.99, 3);
  iVar.run(caipTrad, 'Com Jurupinga',     18.99, 4);
  ['Abacaxi','Abacaxi c/ Hortelã','Morango','Morango c/ Hortelã','Maracujá',
   'Kiwi','Kiwi c/ Hortelã','Limão','Limão c/ Hortelã','Melancia','Melancia c/ Hortelã','Manga']
    .forEach((n, i) => iOpt.run(caipTrad, null, 'Sabor', n, 0, i));

  // Caipirinhas Gourmet
  const caipGour = iProd.run(caipCat, 'Caipirinha Gourmet', 'Premium · Feita na hora com frutas frescas', 1, 1, null, 2).lastInsertRowid;
  iVar.run(caipGour, 'Com Vodka',         15.99, 1);
  iVar.run(caipGour, 'Com Velho Barreiro',15.99, 2);
  iVar.run(caipGour, 'Com Sakê',          20.00, 3);
  iVar.run(caipGour, 'Com Jurupinga',     25.00, 4);
  ['Abacaxi','Abacaxi c/ Hortelã','Abacaxi ao Vinho','Morango','Morango c/ Hortelã','Morango ao Vinho',
   'Maracujá','Kiwi','Kiwi c/ Hortelã','Limão','Limão c/ Hortelã','Melancia','Melancia c/ Hortelã','Manga']
    .forEach((n, i) => iOpt.run(caipGour, null, 'Sabor', n, 0, i));

  // Caipirinhas Premium
  const caipPrem = iProd.run(caipCat, 'Caipirinha Premium', 'Sabores especiais · Top de linha', 1, 1, null, 3).lastInsertRowid;
  iVar.run(caipPrem, 'Com Vodka',         22.99, 1);
  iVar.run(caipPrem, 'Com Velho Barreiro',22.99, 2);
  iVar.run(caipPrem, 'Com Sakê',          26.99, 3);
  iVar.run(caipPrem, 'Com Jurupinga',     28.00, 4);
  ['Céu Azul','Paçoca','Ovomaltine','Açaí c/ Morango','Açaí c/ Maracujá',
   'Ninho c/ Morango','Cupuaçu c/ Morango','Ovomaltine c/ Maracujá','Frutas Vermelhas']
    .forEach((n, i) => iOpt.run(caipPrem, null, 'Sabor', n, 0, i));

  // Caipirinha 2 Sabores Tradicional
  const caip2Trad = iProd.run(caipCat, 'Caipirinha 2 Sabores Tradicional', 'Dois sabores incríveis em um só copo', 1, 1, null, 4).lastInsertRowid;
  iVar.run(caip2Trad, 'Com Vodka',         16.99, 1);
  iVar.run(caip2Trad, 'Com Velho Barreiro',16.99, 2);
  iVar.run(caip2Trad, 'Com Sakê',          21.00, 3);
  iVar.run(caip2Trad, 'Com Jurupinga',     21.99, 4);
  ['Morango c/ Limão','Abacaxi c/ Limão','Maracujá c/ Limão','Melancia c/ Limão',
   'Kiwi c/ Limão','Kiwi c/ Morango','Maracujá c/ Morango','Abacaxi c/ Morango']
    .forEach((n, i) => iOpt.run(caip2Trad, null, 'Sabores', n, 0, i));

  // Caipirinha 2 Sabores Gourmet
  const caip2Gour = iProd.run(caipCat, 'Caipirinha 2 Sabores Gourmet', 'Dois sabores gourmet em um só copo', 1, 1, null, 5).lastInsertRowid;
  iVar.run(caip2Gour, 'Com Vodka',         19.99, 1);
  iVar.run(caip2Gour, 'Com Velho Barreiro',19.99, 2);
  iVar.run(caip2Gour, 'Com Sakê',          23.99, 3);
  iVar.run(caip2Gour, 'Com Jurupinga',     24.99, 4);
  ['Morango c/ Limão','Abacaxi c/ Limão','Maracujá c/ Limão','Melancia c/ Limão',
   'Kiwi c/ Limão','Kiwi c/ Morango','Maracujá c/ Morango','Abacaxi c/ Morango']
    .forEach((n, i) => iOpt.run(caip2Gour, null, 'Sabores', n, 0, i));

  // ── 8. BEBIDAS ────────────────────────────────────────────────────────────
  const bebCat = iCat.run('Bebidas', 'bebidas', '🥤', 8).lastInsertRowid;
  iProd.run(bebCat, 'Refrigerante Lata',  'Coca-Cola, Guaraná, Sprite',  0, 0, 6.00,  1);
  iProd.run(bebCat, 'Refrigerante 2L',    'Coca-Cola, Guaraná ou Sprite', 0, 0, 12.00, 2);
  iProd.run(bebCat, 'Água Mineral',       'Garrafa 500ml',                0, 0, 4.00,  3);
  iProd.run(bebCat, 'Vinho Quente',       'Copo quentinho para a noite',  0, 0, 7.00,  4);

})();

const cats = db.prepare('SELECT COUNT(*) as c FROM categories').get();
const prods = db.prepare('SELECT COUNT(*) as c FROM products').get();
const vars = db.prepare('SELECT COUNT(*) as c FROM product_variants').get();
const opts = db.prepare('SELECT COUNT(*) as c FROM product_options').get();
console.log(`✅ Cardápio populado com sucesso!`);
console.log(`   ${cats.c} categorias · ${prods.c} produtos · ${vars.c} variantes · ${opts.c} opções`);
