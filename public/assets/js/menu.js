// Menu page logic
let menuData = [];
let combosData = [];
let currentProduct = null;
let currentCombo = null;
let selectedVariant = null;
let selectedOptions = {};
let qty = 1;
const isMobile = () => window.innerWidth <= 900;

const MAX_FREE_OPTIONS = 5;

let comboAcaiCount = 1;
let comboAcaiIndex = 0;
let selectedOptionsArray = [{}];
let comboModalFreeLimit = MAX_FREE_OPTIONS; // overridden per combo type
let comboModalType = 'acai'; // 'acai' | 'pastel'

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadMenu(), loadCombos()]);
  renderCategoryTabs(menuData);
  renderAllProducts(menuData, 'todos');
  renderCartUI();
  setupMobileCart();
});

async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    menuData = await res.json();
  } catch {
    document.getElementById('menuProducts').innerHTML =
      '<div style="text-align:center;padding:3rem;color:var(--gray);">Erro ao carregar cardápio. Tente novamente.</div>';
  }
}

async function loadCombos() {
  try {
    const res = await fetch('/api/combos');
    combosData = await res.json();
  } catch {
    combosData = [];
  }
}

// ── ICON HELPERS ──────────────────────────────────────────────────────────────
function catIcon(cat) {
  const n = (cat.slug || cat.name || '').toLowerCase();
  if (n.includes('acai') || n.includes('açaí')) return 'cherry';
  if (n.includes('burger') || n.includes('hambur') || n.includes('lanche')) return 'sandwich';
  if (n.includes('pastel')) return 'cookie';
  if (n.includes('bebida') || n.includes('drink') || n.includes('refri') || n.includes('suco')) return 'cup-soda';
  if (n.includes('combo') || n.includes('promo')) return 'gift';
  return 'utensils';
}

function productIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('açaí') || n.includes('acai')) return 'cherry';
  if (n.includes('hambúrguer') || n.includes('burger') || n.includes('lanche')) return 'sandwich';
  if (n.includes('pastel')) return 'cookie';
  if (n.includes('refrigerante') || n.includes('suco')) return 'cup-soda';
  if (n.includes('água')) return 'droplets';
  if (n.includes('vinho')) return 'wine';
  if (n.includes('vitamina')) return 'cup-soda';
  if (n.includes('whisky') || n.includes('gin')) return 'wine';
  return 'utensils';
}

// ── CATEGORIES ────────────────────────────────────────────────────────────────
function renderCategoryTabs(data) {
  const tabs = document.getElementById('categoryTabs');

  if (combosData.length) {
    const comboBtn = document.createElement('button');
    comboBtn.className = 'menu-cat-btn';
    comboBtn.dataset.cat = 'combos';
    comboBtn.innerHTML = `<i data-lucide="gift" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>Combos`;
    comboBtn.onclick = () => filterByCategory('combos');
    tabs.appendChild(comboBtn);
  }

  data.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'menu-cat-btn';
    btn.dataset.cat = cat.slug;
    const icon = catIcon(cat);
    btn.innerHTML = `<i data-lucide="${icon}" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>${cat.name}`;
    btn.onclick = () => filterByCategory(cat.slug);
    tabs.appendChild(btn);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function filterByCategory(slug) {
  document.querySelectorAll('.menu-cat-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === slug || (slug === 'todos' && b.dataset.cat === 'todos'));
  });
  if (slug === 'todos') {
    renderAllProducts(menuData, 'todos');
  } else if (slug === 'combos') {
    renderCombosOnly();
  } else {
    const cat = menuData.find(c => c.slug === slug);
    renderAllProducts(cat ? [cat] : [], slug);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
function renderAllProducts(data, mode) {
  const container = document.getElementById('menuProducts');
  let html = '';

  if (mode === 'todos' && combosData.length) {
    html += renderComboSection();
  }

  if (!data.length) {
    if (!html) container.innerHTML = '<div style="text-align:center;color:var(--gray);padding:3rem;">Nenhum produto encontrado.</div>';
    else container.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  html += data.map(renderCategorySection).join('');
  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderCombosOnly() {
  const container = document.getElementById('menuProducts');
  if (!combosData.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--gray);padding:3rem;">Nenhum combo disponível.</div>';
    return;
  }
  container.innerHTML = renderComboSection();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderComboSection() {
  const cards = combosData.map(combo => {
    const isFree = combo.type === 'free';
    return `
      <div class="combo-card">
        ${combo.tag ? `<div class="combo-tag">${combo.tag}</div>` : ''}
        <div class="combo-name">${combo.name}</div>
        ${combo.description ? `<div class="combo-desc">${combo.description}</div>` : ''}
        <div class="combo-action">
          <div class="combo-price">${isFree ? 'Grátis' : formatBRL(combo.price)}</div>
          <button class="btn btn-gold btn-sm" onclick="addComboToCart(${combo.id})">
            <i data-lucide="plus" style="width:13px;height:13px;margin-right:3px;vertical-align:middle;"></i>Pedir
          </button>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="menu-section" id="cat-combos">
      <h2 class="menu-section-title" style="color:var(--gold);">
        <i data-lucide="gift" style="width:22px;height:22px;vertical-align:middle;margin-right:8px;"></i>Combos &amp; Promoções
      </h2>
      <p style="font-size:.85rem;color:var(--gray);margin:-0.5rem 0 1.25rem;">Aproveite nossas ofertas especiais!</p>
      <div class="combos-grid">${cards}</div>
    </div>`;
}

function detectComboConfig(combo) {
  const text = (combo.name + ' ' + (combo.description || '')).toLowerCase();

  if (/açaí|acai/i.test(text)) {
    let acaiCount = 1;
    if (/dois|2\s*x?\s*açaí|dois açaís/i.test(text)) acaiCount = 2;
    if (/três|3\s*x?\s*açaí|três açaís/i.test(text)) acaiCount = 3;
    return { type: 'acai', acaiCount, freeLimit: MAX_FREE_OPTIONS };
  }

  if (/pastel/i.test(text)) {
    const m = text.match(/(\d+)\s*past/i);
    const count = m ? parseInt(m[1]) : 6;
    return { type: 'pastel', acaiCount: 1, freeLimit: count };
  }

  return null; // add directly to cart
}

function addComboToCart(comboId) {
  const combo = combosData.find(c => c.id === comboId);
  if (!combo) return;

  const config = detectComboConfig(combo);
  if (config) {
    openComboModal(combo, config);
    return;
  }

  const price = combo.type === 'free' ? 0 : parseFloat(combo.price);
  addItem({
    productId: `combo-${combo.id}`,
    productName: combo.name,
    variant: null,
    options: {},
    optionsSummary: combo.tag || '',
    unitPrice: price,
    qty: 1,
    subtotal: price,
  });
  renderCartUI();
  showToast(`${combo.name} adicionado!`);
}

function buildAcaiOptionsHtml(acaiCat) {
  if (!acaiCat || !acaiCat.products.length) return '';
  const opts = acaiCat.products[0].options;
  if (!opts || !Object.keys(opts).length) return '';
  let html = '';
  Object.entries(opts).forEach(([group, optList]) => {
    const isExtra = group === 'Adicionais Extras';
    html += `<div class="options-group">
      <div class="options-group-title">
        ${group}${isExtra ? ' <span style="color:var(--green);font-size:.7rem;">(+ preço)</span>' : ''}
      </div>
      <div class="options-list">${optList.map(opt => {
        const isSelected = selectedOptions[group]?.some(o => o.name === opt.name);
        return `<div class="option-chip${isSelected ? ' selected' : ''}"
             onclick="toggleOption('${group}', '${opt.name}', ${opt.price}, this)"
             data-group="${group}" data-name="${opt.name}" data-price="${opt.price}">
          ${opt.name}${opt.price > 0 ? `<span class="chip-price">+${formatBRL(opt.price)}</span>` : ''}
        </div>`;
      }).join('')}</div>
    </div>`;
  });
  return html;
}

function buildPastelOptionsHtml() {
  const pastelCat = menuData.find(c => /pastel/i.test(c.slug || c.name));
  if (!pastelCat) return '';
  // Prefer "Monte seu Pastel" — has full flat list of fillings
  const prodWithOpts = pastelCat.products.find(p => /monte/i.test(p.name) && p.has_options)
    || pastelCat.products.find(p => p.has_options && p.options && Object.keys(p.options).length);
  if (!prodWithOpts) return '';

  // Flatten all option groups into one list
  const allEntries = Object.entries(prodWithOpts.options);
  const group = allEntries[0]?.[0] || 'Recheios';
  const flatOpts = allEntries.flatMap(([, opts]) => opts);

  const isSel = opt => selectedOptions[group]?.some(o => o.name === opt.name);
  return `<div class="options-group">
    <div class="options-group-title">Escolha os ${comboModalFreeLimit} Recheios</div>
    <div class="options-list">${flatOpts.map(opt => `
      <div class="option-chip${isSel(opt) ? ' selected' : ''}"
           onclick="toggleOption('${group}', '${opt.name}', ${opt.price}, this)"
           data-group="${group}" data-name="${opt.name}" data-price="${opt.price}">
        ${opt.name}
      </div>`).join('')}</div>
  </div>`;
}

function buildComboModalBody(combo, acaiCat) {
  const limit = comboModalFreeLimit;
  const label = comboModalType === 'pastel'
    ? `pastéis escolhidos — escolha ${limit}`
    : 'opções gratuitas selecionadas';

  let html = `<div id="freeOptionsCounter" style="text-align:center;background:var(--dark);border:1px solid var(--border);border-radius:8px;padding:.45rem 1rem;margin-bottom:.75rem;font-size:.82rem;color:var(--gray);">
    <span id="freeCountText">0</span>/${limit} ${label}
  </div>`;

  if (comboModalType === 'acai' && comboAcaiCount > 1) {
    const tabs = Array.from({length: comboAcaiCount}, (_, i) =>
      `<button class="menu-cat-btn${i === comboAcaiIndex ? ' active' : ''}"
               onclick="switchAcaiTab(${i})" style="font-size:.82rem;padding:.4rem .9rem;">
        Açaí ${i + 1}
      </button>`).join('');
    html += `<div style="display:flex;gap:.5rem;margin-bottom:.75rem;">${tabs}</div>`;
  }

  const optionsHtml = comboModalType === 'pastel'
    ? buildPastelOptionsHtml()
    : buildAcaiOptionsHtml(acaiCat);

  if (!optionsHtml) {
    html += `<div style="text-align:center;color:var(--gray);padding:1rem;">
      <p>${combo.description || 'Clique em adicionar para incluir no pedido.'}</p>
    </div>`;
  } else {
    html += optionsHtml;
  }
  return html;
}

function switchAcaiTab(index) {
  comboAcaiIndex = index;
  selectedOptions = selectedOptionsArray[comboAcaiIndex];
  const acaiCat = menuData.find(c => /açaí|acai/i.test(c.slug || c.name));
  document.getElementById('modalBody').innerHTML = buildComboModalBody(currentCombo, acaiCat);
  updateFreeCounter();
  updateModalSubtotal();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openComboModal(combo, config) {
  currentCombo = combo;
  currentProduct = null;
  selectedVariant = null;

  comboModalType      = config.type;
  comboModalFreeLimit = config.freeLimit;
  comboAcaiCount      = config.acaiCount || 1;
  comboAcaiIndex      = 0;
  selectedOptionsArray = Array.from({length: comboAcaiCount}, () => ({}));
  selectedOptions      = selectedOptionsArray[0];
  qty = 1;

  document.getElementById('modalProductName').textContent = combo.name;
  document.getElementById('modalProductDesc').textContent = combo.description || '';
  document.getElementById('modalQty').textContent = '1';

  const acaiCat = menuData.find(c => /açaí|acai/i.test(c.slug || c.name));
  document.getElementById('modalBody').innerHTML = buildComboModalBody(combo, acaiCat);

  updateFreeCounter();
  updateModalSubtotal();
  document.getElementById('productModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderCategorySection(cat) {
  if (!cat.products.length) return '';
  const icon = catIcon(cat);
  const cards = cat.products.map(renderProductCard).join('');
  return `
    <div class="menu-section" id="cat-${cat.slug}">
      <h2 class="menu-section-title">
        <i data-lucide="${icon}" style="width:20px;height:20px;vertical-align:middle;margin-right:6px;"></i>${cat.name}
      </h2>
      <div class="products-grid">${cards}</div>
    </div>`;
}

function priceDisplay(product) {
  if (product.has_variants && product.variants.length) {
    const min = Math.min(...product.variants.map(v => v.price));
    return `<span class="product-card-from">a partir de</span><br>${formatBRL(min)}`;
  }
  return formatBRL(product.base_price);
}

function renderProductCard(product) {
  const icon = productIcon(product.name);
  return `
    <div class="product-card" onclick="openModal(${product.id})">
      <div class="product-card-emoji"><i data-lucide="${icon}" style="width:40px;height:40px;stroke-width:1.5;color:var(--gold);"></i></div>
      <div class="product-card-name">${product.name}</div>
      ${product.description ? `<div class="product-card-desc">${product.description}</div>` : ''}
      <div class="product-card-footer">
        <div class="product-card-price">${priceDisplay(product)}</div>
        <button class="btn-add-cart" title="Adicionar">+</button>
      </div>
    </div>`;
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function openModal(productId) {
  const cat = menuData.find(c => c.products.some(p => p.id === productId));
  const product = cat?.products.find(p => p.id === productId);
  if (!product) return;

  currentProduct = product;
  selectedVariant = product.has_variants && product.variants.length ? product.variants[0] : null;
  selectedOptions = {};
  qty = 1;

  document.getElementById('modalProductName').textContent = product.name;
  document.getElementById('modalProductDesc').textContent = product.description || '';
  document.getElementById('modalQty').textContent = '1';

  renderModalBody(product);
  updateModalSubtotal();

  document.getElementById('productModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('productModal').classList.remove('open');
  document.body.style.overflow = '';
  currentProduct = null;
  currentCombo = null;
}

function renderModalBody(product) {
  let html = '';

  if (product.has_variants && product.variants.length) {
    html += `<div class="options-group">
      <div class="options-group-title">Tamanho *</div>
      <div class="variants-grid">${
        product.variants.map(v => `
          <div class="variant-btn ${selectedVariant?.id === v.id ? 'selected' : ''}"
               onclick="selectVariant(${v.id}, ${v.price}, this)">
            <div class="vname">${v.name}</div>
            <div class="vprice">${formatBRL(v.price)}</div>
          </div>`).join('')
      }</div>
    </div>`;
  }

  if (product.has_options && product.options && Object.keys(product.options).length) {
    html += `<div id="freeOptionsCounter" style="text-align:center;background:var(--dark);border:1px solid var(--border);border-radius:8px;padding:.45rem 1rem;margin-bottom:.75rem;font-size:.82rem;color:var(--gray);">
      <span id="freeCountText">0</span>/${MAX_FREE_OPTIONS} opções gratuitas selecionadas
    </div>`;
    Object.entries(product.options).forEach(([group, opts]) => {
      const isExtra = group === 'Adicionais Extras';
      html += `<div class="options-group">
        <div class="options-group-title">
          ${group}${isExtra ? ' <span style="color:var(--green);font-size:.7rem;">(+ preço)</span>' : ''}
        </div>
        <div class="options-list">${
          opts.map(opt => `
            <div class="option-chip" onclick="toggleOption('${group}', '${opt.name}', ${opt.price}, this)"
                 data-group="${group}" data-name="${opt.name}" data-price="${opt.price}">
              ${opt.name}
              ${opt.price > 0 ? `<span class="chip-price">+${formatBRL(opt.price)}</span>` : ''}
            </div>`).join('')
        }</div>
      </div>`;
    });
  }

  if (!html) {
    const icon = productIcon(product.name);
    html = `<div style="text-align:center;color:var(--gray);padding:1rem;">
      <div style="margin-bottom:.75rem;"><i data-lucide="${icon}" style="width:48px;height:48px;stroke-width:1.5;color:var(--gold);opacity:.7;"></i></div>
      <p>${product.description || 'Clique em adicionar para incluir no pedido.'}</p>
    </div>`;
  }

  document.getElementById('modalBody').innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectVariant(variantId, price, el) {
  selectedVariant = currentProduct.variants.find(v => v.id === variantId);
  document.querySelectorAll('.variant-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  updateModalSubtotal();
}

function toggleOption(group, name, price, el) {
  if (!selectedOptions[group]) selectedOptions[group] = [];
  const idx = selectedOptions[group].findIndex(o => o.name === name);
  if (idx > -1) {
    selectedOptions[group].splice(idx, 1);
    el.classList.remove('selected');
  } else {
    const freeLimit = currentCombo ? comboModalFreeLimit : MAX_FREE_OPTIONS;
    if (parseFloat(price) === 0 && countFreeOptions(selectedOptions) >= freeLimit) {
      const msg = comboModalType === 'pastel'
        ? `Máximo de ${freeLimit} pastéis no combo!`
        : `Máximo de ${freeLimit} opções gratuitas por açaí!`;
      showToast(msg, 'error');
      return;
    }
    selectedOptions[group].push({ name, price: parseFloat(price) });
    el.classList.add('selected');
  }
  updateFreeCounter();
  updateModalSubtotal();
}

function countFreeOptions(opts) {
  return Object.values(opts).flat().filter(o => (o.price || 0) === 0).length;
}

function updateFreeCounter() {
  const el = document.getElementById('freeCountText');
  if (el) el.textContent = countFreeOptions(selectedOptions);
}

function changeQty(delta) {
  qty = Math.max(1, qty + delta);
  document.getElementById('modalQty').textContent = qty;
  updateModalSubtotal();
}

function getModalItemPrice() {
  if (currentCombo) {
    const base = currentCombo.type === 'free' ? 0 : parseFloat(currentCombo.price);
    const extrasTotal = selectedOptionsArray.reduce((sum, opts) =>
      sum + Object.values(opts).flat().reduce((s, o) => s + (o.price || 0), 0), 0);
    return base + extrasTotal;
  }
  let base = 0;
  if (currentProduct) {
    if (currentProduct.has_variants && selectedVariant) {
      base = selectedVariant.price;
    } else {
      base = currentProduct.base_price || 0;
    }
  }
  const extrasTotal = Object.values(selectedOptions).flat().reduce((sum, o) => sum + (o.price || 0), 0);
  return base + extrasTotal;
}

function updateModalSubtotal() {
  const price = getModalItemPrice();
  document.getElementById('modalSubtotal').textContent = formatBRL(price * qty);
}

function addToCart() {
  if (!currentProduct && !currentCombo) return;

  const price = getModalItemPrice();

  if (currentCombo) {
    // Validação para pastel: precisa escolher todos os recheios
    if (comboModalType === 'pastel') {
      const chosen = countFreeOptions(selectedOptions);
      if (chosen < comboModalFreeLimit) {
        showToast(`Escolha mais ${comboModalFreeLimit - chosen} pastel(is)!`, 'error');
        return;
      }
    }

    // Validação para açaí múltiplo: todos devem ser montados
    if (comboModalType === 'acai' && comboAcaiCount > 1) {
      const emptyIdx = selectedOptionsArray.findIndex(opts =>
        Object.values(opts).flat().length === 0
      );
      if (emptyIdx !== -1) {
        switchAcaiTab(emptyIdx);
        showToast(`Monte o Açaí ${emptyIdx + 1} antes de continuar!`, 'error');
        return;
      }
    }

    const comboName = currentCombo.name;
    const allSummary = selectedOptionsArray.map((opts, i) => {
      const parts = Object.entries(opts)
        .filter(([, v]) => v.length)
        .map(([group, list]) => `${group}: ${list.map(o => o.name).join(', ')}`)
        .join(' · ');
      if (!parts) return null;
      return comboAcaiCount > 1 ? `Açaí ${i + 1}: ${parts}` : parts;
    }).filter(Boolean).join(' | ');

    addItem({
      productId: `combo-${currentCombo.id}`,
      productName: comboName,
      variant: null,
      options: selectedOptionsArray,
      optionsSummary: allSummary || (currentCombo.tag || ''),
      unitPrice: price,
      qty,
      subtotal: parseFloat((price * qty).toFixed(2)),
    });
    renderCartUI();
    closeModal();
    showToast(`${comboName} adicionado!`);
    return;
  }

  if (currentProduct.has_variants && !selectedVariant) {
    showToast('Selecione um tamanho!', 'error');
    return;
  }

  const variantName = selectedVariant ? selectedVariant.name : null;
  const productName = currentProduct.name;
  const optionsSummary = Object.entries(selectedOptions)
    .filter(([, opts]) => opts.length)
    .map(([group, opts]) => `${group}: ${opts.map(o => o.name).join(', ')}`)
    .join(' · ');

  addItem({
    productId: currentProduct.id,
    productName,
    variant: variantName,
    options: selectedOptions,
    optionsSummary,
    unitPrice: price,
    qty,
    subtotal: parseFloat((price * qty).toFixed(2)),
  });
  renderCartUI();
  closeModal();
  showToast(`${productName} adicionado!`);
}

// ── CART RENDER ───────────────────────────────────────────────────────────────
function renderCartUI() {
  const cart = getCart();
  const total = getTotal();
  const count = getCount();

  const sidebarItems = document.getElementById('sidebarCartItems');
  const sidebarTotal = document.getElementById('sidebarCartTotal');
  const sidebarCount = document.getElementById('sidebarCartCount');
  const sidebarBtn = document.getElementById('sidebarCheckoutBtn');

  if (sidebarItems) sidebarItems.innerHTML = renderCartItems(cart);
  if (sidebarTotal) sidebarTotal.textContent = formatBRL(total);
  if (sidebarCount) sidebarCount.textContent = count;
  if (sidebarBtn) sidebarBtn.disabled = count === 0;

  const bottomBar = document.getElementById('cartBottomBar');
  const bottomCount = document.getElementById('bottomCartCount');
  const bottomTotal = document.getElementById('bottomCartTotal');

  if (bottomBar) {
    bottomBar.style.display = count > 0 ? 'block' : 'none';
    if (bottomCount) bottomCount.textContent = count;
    if (bottomTotal) bottomTotal.textContent = formatBRL(total);
  }

  const sheetItems = document.getElementById('sheetCartItems');
  const sheetTotal = document.getElementById('sheetCartTotal');
  if (sheetItems) sheetItems.innerHTML = renderCartItems(cart);
  if (sheetTotal) sheetTotal.textContent = formatBRL(total);

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderCartItems(cart) {
  if (!cart.length) {
    return `<div class="cart-empty">
      <div class="cart-empty-icon"><i data-lucide="shopping-cart" style="width:36px;height:36px;opacity:.4;"></i></div>
      <p style="font-size:.88rem;">Seu carrinho está vazio.<br>Adicione itens do cardápio!</p>
    </div>`;
  }

  return cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.qty > 1 ? `${item.qty}x ` : ''}${item.productName}</div>
        ${item.variant ? `<div class="cart-item-variant">${item.variant}</div>` : ''}
        ${item.optionsSummary ? `<div class="cart-item-extras">${item.optionsSummary}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.25rem;">
        <div class="cart-item-price">${formatBRL(item.subtotal)}</div>
        <button class="cart-item-remove" onclick="removeFromCart('${item.cartId}')">
          <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
        </button>
      </div>
    </div>`).join('');
}

function removeFromCart(cartId) {
  removeItem(cartId);
  renderCartUI();
  showToast('Item removido.', 'info');
}

function goToCheckout() {
  if (getCount() === 0) {
    showToast('Adicione itens ao carrinho primeiro!', 'error');
    return;
  }
  window.location.href = '/checkout';
}

// ── MOBILE CART SHEET ─────────────────────────────────────────────────────────
function setupMobileCart() {
  window.addEventListener('resize', () => {
    if (!isMobile()) closeCartSheet();
  });
}

function openCartSheet() {
  renderCartUI();
  document.getElementById('cartSheetOverlay').classList.add('open');
  document.getElementById('cartSheet').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCartSheet() {
  document.getElementById('cartSheetOverlay').classList.remove('open');
  document.getElementById('cartSheet').classList.remove('open');
  document.body.style.overflow = '';
}

// Close modal on overlay click
document.getElementById('productModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
