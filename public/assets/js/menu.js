// Menu page logic
let menuData = [];
let combosData = [];
let currentProduct = null;
let selectedVariant = null;
let selectedOptions = {};
let qty = 1;
const isMobile = () => window.innerWidth <= 900;

const MAX_OPTIONS_PER_GROUP = 5;

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadMenu(), loadCombos()]);
  renderCartUI();
  setupMobileCart();
});

async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    menuData = await res.json();
    renderCategoryTabs(menuData);
    renderAllProducts(menuData, 'todos');
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

function addComboToCart(comboId) {
  const combo = combosData.find(c => c.id === comboId);
  if (!combo) return;

  const price = combo.type === 'free' ? 0 : parseFloat(combo.price);
  const item = {
    productId: `combo-${combo.id}`,
    productName: combo.name,
    variant: null,
    options: {},
    optionsSummary: combo.tag || '',
    unitPrice: price,
    qty: 1,
    subtotal: price,
  };

  addItem(item);
  renderCartUI();
  showToast(`${combo.name} adicionado!`);
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
    Object.entries(product.options).forEach(([group, opts]) => {
      const isExtra = group === 'Adicionais Extras';
      const groupId = 'count-' + group.replace(/[^a-zA-Z0-9]/g, '-');
      html += `<div class="options-group">
        <div class="options-group-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>${group}${isExtra ? ' <span style="color:var(--green);font-size:.7rem;">(+ preço)</span>' : ''}</span>
          <span style="font-size:.7rem;color:var(--gray);" id="${groupId}">0/${MAX_OPTIONS_PER_GROUP}</span>
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
    if (selectedOptions[group].length >= MAX_OPTIONS_PER_GROUP) {
      showToast(`Máximo de ${MAX_OPTIONS_PER_GROUP} opções por grupo!`, 'error');
      return;
    }
    selectedOptions[group].push({ name, price: parseFloat(price) });
    el.classList.add('selected');
  }
  const countEl = document.getElementById('count-' + group.replace(/[^a-zA-Z0-9]/g, '-'));
  if (countEl) countEl.textContent = `${selectedOptions[group].length}/${MAX_OPTIONS_PER_GROUP}`;
  updateModalSubtotal();
}

function changeQty(delta) {
  qty = Math.max(1, qty + delta);
  document.getElementById('modalQty').textContent = qty;
  updateModalSubtotal();
}

function getModalItemPrice() {
  let base = 0;
  if (currentProduct.has_variants && selectedVariant) {
    base = selectedVariant.price;
  } else {
    base = currentProduct.base_price || 0;
  }
  const extrasTotal = Object.values(selectedOptions)
    .flat()
    .reduce((sum, o) => sum + (o.price || 0), 0);
  return base + extrasTotal;
}

function updateModalSubtotal() {
  const price = getModalItemPrice();
  document.getElementById('modalSubtotal').textContent = formatBRL(price * qty);
}

function addToCart() {
  if (!currentProduct) return;

  if (currentProduct.has_variants && !selectedVariant) {
    showToast('Selecione um tamanho!', 'error');
    return;
  }

  const price = getModalItemPrice();
  const variantName = selectedVariant ? selectedVariant.name : null;
  const productName = currentProduct.name; // save before closeModal nulls currentProduct

  const optionsSummary = Object.entries(selectedOptions)
    .filter(([, opts]) => opts.length)
    .map(([group, opts]) => `${group}: ${opts.map(o => o.name).join(', ')}`)
    .join(' · ');

  const item = {
    productId: currentProduct.id,
    productName,
    variant: variantName,
    options: selectedOptions,
    optionsSummary,
    unitPrice: price,
    qty,
    subtotal: parseFloat((price * qty).toFixed(2)),
  };

  addItem(item);
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
