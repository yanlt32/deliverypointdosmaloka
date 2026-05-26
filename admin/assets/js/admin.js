// Admin dashboard — main script
const API = '/api/admin';
let token = localStorage.getItem('pdm_admin_token');
let currentTab = 'orders';
let ordersFilter = 'todos';
let allOrders = [];
let allCategories = [];
let pollTimer = null;

// ── AUTH ─────────────────────────────────────────────────────────────────────────
if (!token) {
  window.location.href = '/admin/login.html';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  if (res.status === 401 || res.status === 403) {
    logout();
    throw new Error('Sessão expirada');
  }
  return res;
}

function logout() {
  localStorage.removeItem('pdm_admin_token');
  localStorage.removeItem('pdm_admin_user');
  window.location.href = '/admin/login.html';
}

// ── INIT ─────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const username = localStorage.getItem('pdm_admin_user') || 'admin';
  document.getElementById('usernameDisplay').textContent = username;
  document.getElementById('avatarLetter').textContent = username[0].toUpperCase();

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('ordersDateFilter').value = today;

  showTab('orders');
  startPolling();
});

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (currentTab === 'orders') loadOrders(false);
  }, 30000);
}

// ── TABS ──────────────────────────────────────────────────────────────────────────
function showTab(tab) {
  currentTab = tab;
  ['orders', 'menu', 'combos', 'reports'].forEach(t => {
    document.getElementById(`tab${capitalize(t)}`).classList.toggle('hidden', t !== tab);
    document.getElementById(`nav${capitalize(t)}`).classList.toggle('active', t === tab);
    const mob = document.querySelector(`.mobile-nav-item[data-tab="${t}"]`);
    if (mob) mob.classList.toggle('active', t === tab);
  });

  if (tab === 'orders') loadOrders();
  if (tab === 'menu') loadProducts();
  if (tab === 'combos') loadCombos();
  if (tab === 'reports') loadReports('today');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function ico(name, size = 14) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;"></i>`;
}
function refreshIcons() {
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── ORDERS ────────────────────────────────────────────────────────────────────────
async function loadOrders(showLoader = true) {
  const date = document.getElementById('ordersDateFilter').value;
  if (showLoader) {
    document.getElementById('ordersList').innerHTML =
      '<div class="empty-state"><div class="spinner" style="width:36px;height:36px;margin:0 auto;"></div><p style="margin-top:1rem;">Carregando...</p></div>';
  }

  try {
    const res = await apiFetch(`/orders?date=${date}`);
    allOrders = await res.json();
    renderOrderStats(allOrders);
    renderOrders();
    updateNewOrdersBadge(allOrders);
  } catch (e) {
    if (e.message !== 'Sessão expirada') showToast('Erro ao carregar pedidos.', 'error');
  }
}

function updateNewOrdersBadge(orders) {
  const newCount = orders.filter(o => o.order_status === 'novo').length;
  ['newOrdersBadge', 'mobileOrdersBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = newCount;
    el.classList.toggle('hidden', newCount === 0);
  });
}

function renderOrderStats(orders) {
  const total = orders.reduce((s, o) => o.order_status !== 'cancelado' ? s + o.total : s, 0);
  const novos = orders.filter(o => o.order_status === 'novo').length;
  const entregues = orders.filter(o => o.order_status === 'entregue').length;
  const cancelados = orders.filter(o => o.order_status === 'cancelado').length;

  document.getElementById('ordersStats').innerHTML = `
    <div class="stat-box gold">
      <div class="stat-box-label">Faturamento</div>
      <div class="stat-box-value">${formatBRL(total)}</div>
      <div class="stat-box-sub">${orders.length} pedido(s)</div>
    </div>
    <div class="stat-box" style="${novos > 0 ? 'border-color:rgba(245,197,24,.4);' : ''}">
      <div class="stat-box-label">Novos</div>
      <div class="stat-box-value" style="${novos > 0 ? 'color:var(--gold);' : ''}">${novos}</div>
      <div class="stat-box-sub">aguardando</div>
    </div>
    <div class="stat-box green">
      <div class="stat-box-label">Entregues</div>
      <div class="stat-box-value">${entregues}</div>
      <div class="stat-box-sub">concluídos</div>
    </div>
    <div class="stat-box red">
      <div class="stat-box-label">Cancelados</div>
      <div class="stat-box-value">${cancelados}</div>
      <div class="stat-box-sub">cancelados</div>
    </div>`;
}

function filterOrders(status, btn) {
  ordersFilter = status;
  document.querySelectorAll('.orders-filters .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

function renderOrders() {
  const filtered = ordersFilter === 'todos'
    ? allOrders
    : allOrders.filter(o => o.order_status === ordersFilter);

  const container = document.getElementById('ordersList');
  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>Nenhum pedido encontrado.</p></div>';
    return;
  }

  container.innerHTML = filtered.map(order => {
    const isNew = order.order_status === 'novo';
    const addr = [order.street, order.number, order.complement, order.neighborhood].filter(Boolean).join(', ');
    const items = order.items || [];
    const preview = items.slice(0, 2).map(i => i.productName).join(', ') + (items.length > 2 ? ` +${items.length - 2}` : '');

    return `
      <div class="order-row ${isNew ? 'new' : ''}" onclick="openOrderDetail('${order.id}')">
        <div>
          <div class="order-num">${order.order_number}</div>
          <div class="order-time">${formatTime(order.created_at)}</div>
          <div style="margin-top:.4rem;">${statusBadge(order.order_status)}</div>
        </div>
        <div>
          <div class="order-customer-name">${ico('user',13)} ${order.customer_name}</div>
          <div class="order-address">${ico('map-pin',13)} ${addr}</div>
          <div class="order-items-preview">${preview}</div>
          ${order.notes ? `<div style="font-size:.72rem;color:var(--orange);margin-top:.2rem;">${ico('file-text',12)} ${order.notes}</div>` : ''}
        </div>
        <div>
          <div class="order-total">${formatBRL(order.total)}</div>
          <div class="order-payment">${order.payment_method === 'pix' ? `${ico('smartphone',12)} Pix` : `${ico('banknote',12)} Dinheiro/Cartão`}</div>
        </div>
        <div onclick="event.stopPropagation();">
          <select class="status-select" onchange="updateOrderStatus('${order.id}', this.value, this)">
            <option value="novo" ${order.order_status === 'novo' ? 'selected' : ''}>Novo</option>
            <option value="confirmado" ${order.order_status === 'confirmado' ? 'selected' : ''}>Confirmado</option>
            <option value="preparando" ${order.order_status === 'preparando' ? 'selected' : ''}>Preparando</option>
            <option value="saiu" ${order.order_status === 'saiu' ? 'selected' : ''}>Saiu para entrega</option>
            <option value="entregue" ${order.order_status === 'entregue' ? 'selected' : ''}>Entregue</option>
            <option value="cancelado" ${order.order_status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
          </select>
        </div>
      </div>`;
  }).join('');
  refreshIcons();
}

async function updateOrderStatus(orderId, status, selectEl) {
  try {
    await apiFetch(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    const order = allOrders.find(o => o.id === orderId);
    if (order) order.order_status = status;

    renderOrderStats(allOrders);
    updateNewOrdersBadge(allOrders);
    showToast('Status atualizado!');

    // Update detail panel if open
    if (document.getElementById('orderDetailPanel').classList.contains('open')) {
      const current = allOrders.find(o => o.id === orderId);
      if (current) renderOrderDetail(current);
    }
  } catch {
    showToast('Erro ao atualizar status.', 'error');
    selectEl.value = allOrders.find(o => o.id === orderId)?.order_status || 'novo';
  }
}

function openOrderDetail(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;
  renderOrderDetail(order);
  document.getElementById('orderDetailPanel').classList.add('open');
}

function closeDetailPanel() {
  document.getElementById('orderDetailPanel').classList.remove('open');
}

function formatItemOptions(item) {
  const s = item.optionsSummary || '';
  if (!s) return '';

  // Multi-açaí: sections separated by " | "
  if (s.includes(' | ')) {
    return s.split(' | ').map(section => {
      const colon = section.indexOf(': ');
      const title  = colon !== -1 ? section.slice(0, colon) : section;
      const rest   = colon !== -1 ? section.slice(colon + 2) : '';
      const groups = rest ? rest.split(' · ') : [];
      return `<div style="margin-top:.5rem;background:rgba(255,255,255,.04);border-radius:6px;padding:.4rem .6rem;">
        <div style="font-size:.7rem;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.25rem;">${title}</div>
        ${groups.map(g => `<div style="font-size:.75rem;color:var(--light);line-height:1.5;">· ${g}</div>`).join('')}
      </div>`;
    }).join('');
  }

  // Single item: groups separated by " · "
  const groups = s.split(' · ');
  if (groups.length <= 1) {
    return `<div style="font-size:.75rem;color:var(--gray);margin-top:.25rem;">${s}</div>`;
  }
  return `<div style="margin-top:.4rem;background:rgba(255,255,255,.04);border-radius:6px;padding:.4rem .6rem;">
    ${groups.map(g => `<div style="font-size:.75rem;color:var(--light);line-height:1.5;">· ${g}</div>`).join('')}
  </div>`;
}

function normalizePhone(raw) {
  let d = (raw || '').replace(/\D/g, '');
  // Strip international prefix 55 when present (>11 digits = 55 + DDD + number)
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  // 11 digits starting with 55: country code was wrongly parsed as DDD by the formatter
  if (d.startsWith('55') && d.length === 11) d = d.slice(2);
  return d;
}

function renderOrderDetail(order) {
  const addr = [order.street, order.number, order.complement, order.neighborhood, order.city]
    .filter(Boolean).join(', ');
  const waPhone = `55${normalizePhone(order.customer_phone)}`;
  const whatsappMsg = encodeURIComponent(`Olá ${order.customer_name}! Seu pedido ${order.order_number} está sendo preparado. 🍽️`);

  document.getElementById('orderDetailContent').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <div>
        <div style="font-size:.72rem;color:var(--gray);letter-spacing:.1em;text-transform:uppercase;margin-bottom:.25rem;">Pedido</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:2rem;color:var(--gold);">${order.order_number}</div>
        ${statusBadge(order.order_status)}
        <div style="font-size:.75rem;color:var(--gray);margin-top:.5rem;">${formatDateFull(order.created_at)}</div>
      </div>

      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;">
        <div style="font-size:.72rem;color:var(--gray);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.75rem;">${ico('map-pin',14)} Entrega</div>
        <div style="font-weight:600;color:var(--white);margin-bottom:.25rem;">${ico('user',15)} ${order.customer_name}</div>
        <div style="font-size:.85rem;color:var(--gray);">${ico('phone',14)} ${order.customer_phone}</div>
        <div style="font-size:.85rem;color:var(--gray);margin-top:.4rem;">${ico('map-pin',14)} ${addr}</div>
        ${order.reference ? `<div style="font-size:.8rem;color:var(--gray);margin-top:.2rem;">Ref: ${order.reference}</div>` : ''}
        <div style="display:flex;gap:.5rem;margin-top:.85rem;flex-wrap:wrap;">
          <a href="https://wa.me/${waPhone}?text=${whatsappMsg}"
             target="_blank" class="btn btn-gold btn-sm" style="display:inline-flex;">
            ${ico('message-circle',13)} WhatsApp
          </a>
          <button onclick="calcRoute('${order.id}')" id="routeBtn_${order.id}" class="btn btn-ghost btn-sm">
            ${ico('navigation',13)} Calcular Rota
          </button>
        </div>
        <div id="routeResult_${order.id}" style="display:none;margin-top:.75rem;"></div>
      </div>

      ${order.notes ? `
      <div style="background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.3);border-radius:10px;padding:1rem;">
        <div style="font-size:.72rem;color:var(--orange);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.4rem;">${ico('file-text',13)} Observações</div>
        <div style="font-size:.88rem;color:var(--white);">${order.notes}</div>
      </div>` : ''}

      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;">
        <div style="font-size:.72rem;color:var(--gray);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.75rem;">${ico('shopping-bag',13)} Itens</div>
        ${(order.items || []).map(item => `
          <div style="padding:.65rem 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;">
              <div style="font-size:.9rem;font-weight:700;color:var(--white);">
                ${item.qty > 1 ? `<span style="color:var(--gold);">${item.qty}x</span> ` : ''}${item.productName}
              </div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:1.1rem;color:var(--gold);flex-shrink:0;">${formatBRL(item.subtotal)}</div>
            </div>
            ${item.variant ? `<div style="font-size:.78rem;color:var(--gray);margin-top:.15rem;">${item.variant}</div>` : ''}
            ${formatItemOptions(item)}
          </div>`).join('')}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.85rem;padding-top:.85rem;border-top:2px solid var(--border);">
          <div style="font-weight:700;color:var(--white);font-size:.95rem;">Total</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:1.6rem;color:var(--gold);">${formatBRL(order.total)}</div>
        </div>
        <div style="font-size:.75rem;color:var(--gray);margin-top:.3rem;text-align:right;">
          ${order.payment_method === 'pix' ? `${ico('smartphone',12)} Pix` : `${ico('banknote',12)} Dinheiro/Cartão`}
          ${order.payment_status === 'pago' ? '<span style="color:var(--green);">· Pago</span>' : ''}
        </div>
      </div>

      <div>
        <div style="font-size:.72rem;color:var(--gray);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.6rem;">Atualizar Status</div>
        <select class="form-control" style="margin-bottom:.75rem;" onchange="updateOrderStatus('${order.id}', this.value, this)">
          <option value="novo" ${order.order_status === 'novo' ? 'selected' : ''}>Novo</option>
          <option value="confirmado" ${order.order_status === 'confirmado' ? 'selected' : ''}>Confirmado</option>
          <option value="preparando" ${order.order_status === 'preparando' ? 'selected' : ''}>Preparando</option>
          <option value="saiu" ${order.order_status === 'saiu' ? 'selected' : ''}>Saiu para Entrega</option>
          <option value="entregue" ${order.order_status === 'entregue' ? 'selected' : ''}>Entregue</option>
          <option value="cancelado" ${order.order_status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
        </select>
      </div>
    </div>`;
  refreshIcons();
}

// ── PRODUCTS ──────────────────────────────────────────────────────────────────────
async function loadProducts() {
  try {
    const [catRes, prodRes] = await Promise.all([
      apiFetch('/categories'),
      apiFetch('/products'),
    ]);
    allCategories = await catRes.json();
    const products = await prodRes.json();
    renderProducts(products);
    populateCategorySelect();
  } catch {
    showToast('Erro ao carregar produtos.', 'error');
  }
}

function renderProducts(products) {
  if (!products.length) {
    document.getElementById('productsList').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🍽️</div><p>Nenhum produto cadastrado.</p></div>';
    return;
  }

  const byCategory = {};
  products.forEach(p => {
    if (!byCategory[p.category_name]) byCategory[p.category_name] = [];
    byCategory[p.category_name].push(p);
  });

  document.getElementById('productsList').innerHTML = Object.entries(byCategory).map(([cat, prods]) => `
    <div style="margin-bottom:2rem;">
      <h3 style="font-size:1.1rem;color:var(--white);margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid var(--border);">${cat}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Preço / Variações</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${prods.map(p => `
              <tr>
                <td>
                  <div style="font-weight:600;color:var(--white);">${p.name}</div>
                  ${p.description ? `<div style="font-size:.75rem;color:var(--gray);">${p.description}</div>` : ''}
                </td>
                <td>
                  ${p.has_variants && p.variants.length
                    ? p.variants.map(v => `<span class="chip">${v.name} R$${parseFloat(v.price).toFixed(2)}</span>`).join(' ')
                    : `<span style="font-family:'Bebas Neue',sans-serif;color:var(--gold);">R$ ${parseFloat(p.base_price || 0).toFixed(2)}</span>`
                  }
                </td>
                <td><span class="${p.active ? 'text-green' : 'text-red'}">${p.active ? '● Ativo' : '● Inativo'}</span></td>
                <td>
                  <div style="display:flex;gap:.4rem;">
                    <button class="btn btn-ghost btn-sm" onclick="editProduct(${JSON.stringify(p).replace(/"/g,'&quot;')})">${ico('pencil',13)}</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id}, '${p.name}')">${ico('trash-2',13)}</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`).join('');
  refreshIcons();
}

function populateCategorySelect() {
  const sel = document.getElementById('productCategory');
  sel.innerHTML = '<option value="">Selecione...</option>' +
    allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function openProductModal(product = null) {
  document.getElementById('productEditId').value = product?.id || '';
  document.getElementById('productModalTitle').textContent = product ? 'Editar Produto' : 'Novo Produto';
  document.getElementById('productCategory').value = product?.category_id || '';
  document.getElementById('productName').value = product?.name || '';
  document.getElementById('productDesc').value = product?.description || '';
  document.getElementById('productHasVariants').checked = !!product?.has_variants;
  document.getElementById('productPrice').value = product?.base_price || '';
  document.getElementById('productActive').checked = product ? !!product.active : true;

  toggleVariantsUI();

  if (product?.has_variants && product.variants?.length) {
    document.getElementById('variantsList').innerHTML = '';
    product.variants.forEach(v => addVariantRow(v.name, v.price));
  } else if (!product) {
    document.getElementById('variantsList').innerHTML = '';
    addVariantRow();
  }

  document.getElementById('productModal').classList.add('open');
}

function editProduct(p) { openProductModal(p); }

function closeProductModal() {
  document.getElementById('productModal').classList.remove('open');
}

function toggleVariantsUI() {
  const hasVariants = document.getElementById('productHasVariants').checked;
  document.getElementById('variantsSection').classList.toggle('hidden', !hasVariants);
  document.getElementById('basePriceSection').classList.toggle('hidden', hasVariants);
}

function addVariantRow(name = '', price = '') {
  const row = document.createElement('div');
  row.className = 'variant-row';
  row.innerHTML = `
    <input type="text" class="form-control variant-name" placeholder="Ex: 500ml" value="${name}">
    <input type="number" class="form-control variant-price" placeholder="Preço" step="0.01" min="0" value="${price}" style="max-width:100px;">
    <button type="button" class="btn-icon" onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('variantsList').appendChild(row);
}

async function saveProduct() {
  const id = document.getElementById('productEditId').value;
  const hasVariants = document.getElementById('productHasVariants').checked;

  const variantRows = document.querySelectorAll('.variant-row');
  const variants = [];
  variantRows.forEach(row => {
    const name = row.querySelector('.variant-name').value.trim();
    const price = parseFloat(row.querySelector('.variant-price').value);
    if (name && !isNaN(price)) variants.push({ name, price });
  });

  const payload = {
    category_id: parseInt(document.getElementById('productCategory').value),
    name: document.getElementById('productName').value.trim(),
    description: document.getElementById('productDesc').value.trim(),
    has_variants: hasVariants,
    has_options: false,
    base_price: hasVariants ? null : parseFloat(document.getElementById('productPrice').value) || null,
    active: document.getElementById('productActive').checked,
    variants: hasVariants ? variants : [],
  };

  if (!payload.category_id || !payload.name) {
    showToast('Preencha categoria e nome.', 'error');
    return;
  }

  try {
    if (id) {
      await apiFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    showToast('Produto salvo!');
    closeProductModal();
    loadProducts();
  } catch {
    showToast('Erro ao salvar produto.', 'error');
  }
}

async function deleteProduct(id, name) {
  if (!confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await apiFetch(`/products/${id}`, { method: 'DELETE' });
    showToast('Produto excluído!');
    loadProducts();
  } catch {
    showToast('Erro ao excluir.', 'error');
  }
}

// ── COMBOS ────────────────────────────────────────────────────────────────────────
async function loadCombos() {
  try {
    const res = await apiFetch('/combos');
    const combos = await res.json();
    renderCombos(combos);
  } catch {
    showToast('Erro ao carregar combos.', 'error');
  }
}

function renderCombos(combos) {
  if (!combos.length) {
    document.getElementById('combosList').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎁</div><p>Nenhum combo cadastrado.</p></div>';
    return;
  }

  document.getElementById('combosList').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Combo</th><th>Tag</th><th>Preço</th><th>Status</th><th>Ações</th></tr>
        </thead>
        <tbody>
          ${combos.map(c => `
            <tr>
              <td>
                <div style="font-weight:600;color:var(--white);">${c.name}</div>
                ${c.description ? `<div style="font-size:.75rem;color:var(--gray);max-width:300px;">${c.description}</div>` : ''}
              </td>
              <td><span class="chip">${c.tag || '—'}</span></td>
              <td><span style="font-family:'Bebas Neue',sans-serif;color:var(--gold);">R$ ${parseFloat(c.price).toFixed(2)}</span></td>
              <td><span class="${c.active ? 'text-green' : 'text-red'}">${c.active ? '● Ativo' : '● Inativo'}</span></td>
              <td>
                <div style="display:flex;gap:.4rem;">
                  <button class="btn btn-ghost btn-sm" onclick="editCombo(${JSON.stringify(c).replace(/"/g,'&quot;')})">${ico('pencil',13)}</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteCombo(${c.id}, '${c.name}')">${ico('trash-2',13)}</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  refreshIcons();
}

function openComboModal(combo = null) {
  document.getElementById('comboEditId').value = combo?.id || '';
  document.getElementById('comboModalTitle').textContent = combo ? 'Editar Combo' : 'Novo Combo';
  document.getElementById('comboName').value = combo?.name || '';
  document.getElementById('comboTag').value = combo?.tag || '';
  document.getElementById('comboPrice').value = combo?.price || '';
  document.getElementById('comboDesc').value = combo?.description || '';
  document.getElementById('comboActive').checked = combo ? !!combo.active : true;
  document.getElementById('comboModal').classList.add('open');
}

function editCombo(c) { openComboModal(c); }
function closeComboModal() { document.getElementById('comboModal').classList.remove('open'); }

async function saveCombo() {
  const id = document.getElementById('comboEditId').value;
  const payload = {
    name: document.getElementById('comboName').value.trim(),
    tag: document.getElementById('comboTag').value.trim(),
    price: parseFloat(document.getElementById('comboPrice').value),
    description: document.getElementById('comboDesc').value.trim(),
    active: document.getElementById('comboActive').checked,
  };

  if (!payload.name || isNaN(payload.price)) {
    showToast('Preencha nome e preço.', 'error');
    return;
  }

  try {
    if (id) {
      await apiFetch(`/combos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/combos', { method: 'POST', body: JSON.stringify(payload) });
    }
    showToast('Combo salvo!');
    closeComboModal();
    loadCombos();
  } catch {
    showToast('Erro ao salvar combo.', 'error');
  }
}

async function deleteCombo(id, name) {
  if (!confirm(`Excluir "${name}"?`)) return;
  try {
    await apiFetch(`/combos/${id}`, { method: 'DELETE' });
    showToast('Combo excluído!');
    loadCombos();
  } catch {
    showToast('Erro ao excluir.', 'error');
  }
}

// ── REPORTS ───────────────────────────────────────────────────────────────────────
async function loadReports(period, btn) {
  if (btn) {
    document.querySelectorAll('#tabReports .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  try {
    const res = await apiFetch(`/reports?period=${period}`);
    const data = await res.json();
    renderReports(data);
  } catch {
    showToast('Erro ao carregar relatório.', 'error');
  }
}

function renderReports(data) {
  const { summary, byDay, byPayment } = data;

  document.getElementById('reportStats').innerHTML = `
    <div class="stat-box gold">
      <div class="stat-box-label">Faturamento</div>
      <div class="stat-box-value">${formatBRL(summary.total_revenue || 0)}</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-label">Total de Pedidos</div>
      <div class="stat-box-value">${summary.total_orders || 0}</div>
    </div>
    <div class="stat-box green">
      <div class="stat-box-label">Entregues</div>
      <div class="stat-box-value">${summary.delivered || 0}</div>
    </div>
    <div class="stat-box red">
      <div class="stat-box-label">Cancelados</div>
      <div class="stat-box-value">${summary.cancelled || 0}</div>
    </div>`;

  document.getElementById('reportByDay').innerHTML = byDay.length
    ? `<table style="width:100%;">
        <thead><tr><th>Data</th><th>Pedidos</th><th>Receita</th></tr></thead>
        <tbody>${byDay.map(d => `
          <tr>
            <td>${formatDateShort(d.day)}</td>
            <td>${d.orders}</td>
            <td style="color:var(--gold);font-family:'Bebas Neue',sans-serif;">${formatBRL(d.revenue)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : '<div style="color:var(--gray);font-size:.85rem;">Sem dados</div>';

  document.getElementById('reportByPayment').innerHTML = byPayment.length
    ? byPayment.map(p => `
        <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border);">
          <span>${p.payment_method === 'pix' ? '📱 Pix' : '💵 Dinheiro/Cartão'} (${p.count}x)</span>
          <span style="color:var(--gold);font-family:'Bebas Neue',sans-serif;">${formatBRL(p.total)}</span>
        </div>`).join('')
    : '<div style="color:var(--gray);font-size:.85rem;">Sem dados</div>';

  document.getElementById('reportSummary').innerHTML = `
    <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border);">
      <span>Pedidos aguardando</span>
      <span style="color:var(--gold);font-weight:700;">${summary.pending || 0}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:.5rem 0;">
      <span>Ticket médio</span>
      <span style="color:var(--gold);font-family:'Bebas Neue',sans-serif;">
        ${summary.total_orders > 0 ? formatBRL((summary.total_revenue || 0) / summary.total_orders) : 'R$ 0,00'}
      </span>
    </div>`;
}

// ── UTILS ─────────────────────────────────────────────────────────────────────────
function formatBRL(v) {
  return 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ',');
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function statusBadge(status) {
  const map = {
    novo:       ['badge-novo',       'sparkles',      'Novo'],
    confirmado: ['badge-confirmado', 'check-circle',  'Confirmado'],
    preparando: ['badge-preparando', 'flame',         'Preparando'],
    saiu:       ['badge-saiu',       'bike',          'Saiu'],
    entregue:   ['badge-entregue',   'package-check', 'Entregue'],
    cancelado:  ['badge-cancelado',  'x-circle',      'Cancelado'],
  };
  const [cls, iconName, label] = map[status] || ['badge-novo', 'circle', status];
  return `<span class="badge ${cls}">${ico(iconName, 11)} ${label}</span>`;
}

function showToast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${ico(type === 'success' ? 'check-circle' : 'alert-circle', 15)} ${msg}`;
  c.appendChild(t);
  if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [t] });
  setTimeout(() => t.remove(), 3000);
}

// ── ROUTE CALCULATION ─────────────────────────────────────────────────────────

async function calcRoute(orderId) {
  const btn    = document.getElementById(`routeBtn_${orderId}`);
  const result = document.getElementById(`routeResult_${orderId}`);
  if (!btn || !result) return;

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:13px;height:13px;display:inline-block;"></span> Calculando...`;

  try {
    const res  = await apiFetch(`/route/${orderId}`);
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Erro ao calcular rota.', 'error');
      btn.disabled = false;
      btn.innerHTML = `${ico('navigation',13)} Calcular Rota`;
      return;
    }

    const hasRoute = data.minutes !== null && data.km !== null;
    const routeBlock = hasRoute ? `
      <div style="display:flex;align-items:center;gap:1.25rem;margin-bottom:.85rem;">
        <div style="text-align:center;flex:1;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:2.2rem;color:var(--gold);line-height:1;">${data.minutes}</div>
          <div style="font-size:.68rem;color:var(--gray);text-transform:uppercase;letter-spacing:.08em;">minutos</div>
        </div>
        <div style="width:1px;height:44px;background:var(--border);"></div>
        <div style="text-align:center;flex:1;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:2.2rem;color:var(--white);line-height:1;">${data.km}</div>
          <div style="font-size:.68rem;color:var(--gray);text-transform:uppercase;letter-spacing:.08em;">km</div>
        </div>
      </div>` : `<div style="font-size:.75rem;color:var(--gray);margin-bottom:.75rem;">Tempo não calculado — endereço não localizado no mapa.</div>`;

    result.style.display = 'block';
    result.innerHTML = `
      <div style="background:rgba(245,197,24,.06);border:1px solid rgba(245,197,24,.25);border-radius:10px;padding:.9rem;">
        ${routeBlock}
        <div style="font-size:.72rem;color:var(--gray);margin-bottom:.75rem;line-height:1.5;">${ico('map-pin',11)} ${data.customerAddr}</div>
        <div style="display:flex;gap:.5rem;">
          <a href="${data.wazeUrl}" target="_blank"
             style="flex:1;display:flex;align-items:center;justify-content:center;gap:.35rem;background:#06c167;color:#fff;border-radius:7px;padding:.55rem;font-size:.8rem;font-weight:700;text-decoration:none;">
            Waze
          </a>
          <a href="${data.mapsUrl}" target="_blank"
             style="flex:1;display:flex;align-items:center;justify-content:center;gap:.35rem;background:#4285f4;color:#fff;border-radius:7px;padding:.55rem;font-size:.8rem;font-weight:700;text-decoration:none;">
            Google Maps
          </a>
        </div>
      </div>`;

    refreshIcons();
    btn.innerHTML = `${ico('refresh-cw',13)} Recalcular`;
    btn.disabled  = false;
  } catch {
    showToast('Erro ao calcular rota.', 'error');
    btn.disabled = false;
    btn.innerHTML = `${ico('navigation',13)} Calcular Rota`;
  }
}

// Close modals on overlay click
document.getElementById('productModal').addEventListener('click', function(e) {
  if (e.target === this) closeProductModal();
});
document.getElementById('comboModal').addEventListener('click', function(e) {
  if (e.target === this) closeComboModal();
});
