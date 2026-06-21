// Admin dashboard — main script
const API = '/api/admin';
let token = localStorage.getItem('pdm_admin_token');
let currentTab = 'orders';
let ordersFilter = 'todos';
let allOrders = [];
let allCategories = [];
let pollTimer = null;
let autoPrint = localStorage.getItem('pdm_auto_print') === '1';
let printedOrderIds = new Set(JSON.parse(localStorage.getItem('pdm_printed_ids') || '[]'));

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

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  document.getElementById('ordersDateFilter').value = today;

  showTab('orders');
  startPolling();
  updateAutoPrintUI();
  apiFetch('/settings').then(r => r.json()).then(s => { settingsCache = s; updateStoreStatusUI(s.store_open === '1'); }).catch(() => {});
});

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (currentTab === 'orders') loadOrders(false);
  }, 10000);
  setInterval(() => {
    if (currentTab === 'orders' && allOrders.length) renderOrders();
  }, 60000);
  // Recarrega imediatamente quando o usuário volta para a aba do navegador
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentTab === 'orders') loadOrders(false);
  });
}

// ── TABS ──────────────────────────────────────────────────────────────────────────
function showTab(tab) {
  currentTab = tab;
  ['orders', 'menu', 'combos', 'promotions', 'reports', 'settings'].forEach(t => {
    document.getElementById(`tab${capitalize(t)}`).classList.toggle('hidden', t !== tab);
    document.getElementById(`nav${capitalize(t)}`).classList.toggle('active', t === tab);
    const mob = document.querySelector(`.mobile-nav-item[data-tab="${t}"]`);
    if (mob) mob.classList.toggle('active', t === tab);
  });

  if (tab === 'orders') loadOrders();
  if (tab === 'menu') loadProducts();
  if (tab === 'combos') loadCombos();
  if (tab === 'promotions') loadPromotions();
  if (tab === 'reports') loadReports('today');
  if (tab === 'settings') loadSettings();
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
    if (autoPrint) autoPrintNewOrders(allOrders);
    alertNewOrders(allOrders);
  } catch (e) {
    if (e.message !== 'Sessão expirada') showToast('Erro ao carregar pedidos.', 'error');
  }
}

function toggleAutoPrint() {
  autoPrint = !autoPrint;
  localStorage.setItem('pdm_auto_print', autoPrint ? '1' : '0');
  updateAutoPrintUI();
  if (autoPrint) {
    showToast('Auto-impressão ativada! Permita pop-ups no navegador.', 'info');
  } else {
    showToast('Auto-impressão desativada.', 'info');
  }
}

function updateAutoPrintUI() {
  const btn   = document.getElementById('autoPrintBtn');
  const label = document.getElementById('autoPrintLabel');
  if (!label) return;
  if (autoPrint) {
    label.textContent = 'Auto-impressão: ON';
    btn.classList.replace('btn-ghost', 'btn-gold');
  } else {
    label.textContent = 'Auto-impressão: OFF';
    if (btn.classList.contains('btn-gold')) btn.classList.replace('btn-gold', 'btn-ghost');
  }
}

function autoPrintNewOrders(orders) {
  const novos = orders.filter(o => o.order_status === 'novo' && !printedOrderIds.has(o.id));
  novos.forEach(order => {
    printedOrderIds.add(order.id);
    printOrder(order.id);
  });
  if (novos.length) {
    localStorage.setItem('pdm_printed_ids', JSON.stringify([...printedOrderIds]));
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
  const base = ordersFilter === 'todos'
    ? allOrders
    : allOrders.filter(o => o.order_status === ordersFilter);

  const filtered = sortOrders(base);
  const container = document.getElementById('ordersList');

  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>Nenhum pedido encontrado.</p></div>';
    return;
  }

  container.innerHTML = filtered.map(order => {
    const isNew = order.order_status === 'novo';
    const urg   = urgencyLevel(order);
    const urgClass = urg === 2 ? 'overdue' : urg === 1 ? 'warning' : isNew ? 'new' : '';
    const ago   = timeAgo(order.created_at);
    const agoClass = urg === 2 ? 'red' : urg === 1 ? 'amber' : '';

    const addr = order.delivery_type === 'retirada' ? '🏪 Retirada no local' : [order.street, order.number, order.complement, order.neighborhood].filter(Boolean).join(', ');
    const items = order.items || [];
    const preview = items.slice(0, 2).map(i => i.productName).join(', ') + (items.length > 2 ? ` +${items.length - 2}` : '');

    return `
      <div class="order-row ${urgClass}" onclick="openOrderDetail('${order.id}')">
        <div>
          <div class="order-num">${order.order_number}</div>
          <div class="order-time">${formatTime(order.created_at)}</div>
          <div class="time-ago-tag ${agoClass}">${ico('clock', 10)} ${ago}</div>
          <div style="margin-top:.3rem;">${statusBadge(order.order_status)}</div>
        </div>
        <div>
          <div class="order-customer-name">${ico('user',13)} ${order.customer_name}</div>
          <div class="order-address">${ico('map-pin',13)} ${addr}</div>
          <div class="order-items-preview">${preview}</div>
          ${order.notes ? `<div style="font-size:.72rem;color:var(--orange);margin-top:.2rem;">${ico('file-text',12)} ${order.notes}</div>` : ''}
        </div>
        <div>
          <div class="order-total">${formatBRL(order.total)}</div>
          <div class="order-payment">
            ${order.payment_method === 'pix'
              ? `${ico('smartphone',12)} Pix ${order.payment_status === 'pago' ? '<span class="pix-paid-badge">● Pago</span>' : '<span class="pix-pending-badge">⏳ Aguardando PIX</span>'}`
              : order.payment_method === 'cartao'
                ? `${ico('credit-card',12)} Cartão na Entrega`
                : `${ico('banknote',12)} Dinheiro na Entrega`}
          </div>
        </div>
        <div onclick="event.stopPropagation();">
          <select class="status-select" onchange="updateOrderStatus('${order.id}', this.value, this)">
            <option value="novo"       ${order.order_status === 'novo'       ? 'selected' : ''}>Novo</option>
            <option value="confirmado" ${order.order_status === 'confirmado' ? 'selected' : ''}>Confirmado</option>
            <option value="preparando" ${order.order_status === 'preparando' ? 'selected' : ''}>Preparando</option>
            <option value="saiu"       ${order.order_status === 'saiu'       ? 'selected' : ''}>Saiu para entrega</option>
            <option value="entregue"   ${order.order_status === 'entregue'   ? 'selected' : ''}>Entregue</option>
            <option value="cancelado"  ${order.order_status === 'cancelado'  ? 'selected' : ''}>Cancelado</option>
          </select>
          <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:.4rem;" onclick="printOrder('${order.id}')">
            🖨️ Imprimir
          </button>
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

function printOrder(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;

  const addr = [order.street, order.number, order.complement, order.neighborhood, order.city].filter(Boolean).join(', ');
  const ref  = order.reference ? `<div class="p-ref">Ref: ${order.reference}</div>` : '';
  const notes = order.notes ? `<div class="p-block p-obs"><strong>⚠️ Observações:</strong> ${order.notes}</div>` : '';

  const statusMap = { novo:'Novo', confirmado:'Confirmado', preparando:'Preparando', saiu:'Saiu para entrega', entregue:'Entregue', cancelado:'Cancelado' };
  const payMap    = { pix:'PIX', dinheiro:'Dinheiro na Entrega', cartao:'Cartão na Entrega' };

  const items = (order.items || []).map(item => {
    const opts = item.optionsSummary ? `<div class="p-item-opts">${item.optionsSummary.replace(/ \| /g, '<br>')}</div>` : '';
    const variant = item.variant ? `<div class="p-item-opts">${item.variant}</div>` : '';
    return `
      <tr>
        <td>${item.qty > 1 ? `${item.qty}x ` : ''}${item.productName}${variant}${opts}</td>
        <td class="p-right">R$ ${parseFloat(item.subtotal).toFixed(2).replace('.',',')}</td>
      </tr>`;
  }).join('');

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8">
  <title>Pedido ${order.order_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; font-size: 13px; color: #000; background: #fff; padding: 16px; max-width: 380px; margin: 0 auto; }
    .p-logo { text-align:center; font-size:20px; font-weight:900; letter-spacing:.1em; margin-bottom:4px; }
    .p-sub  { text-align:center; font-size:11px; color:#555; margin-bottom:12px; }
    .p-divider { border:none; border-top:2px dashed #000; margin:10px 0; }
    .p-num  { text-align:center; font-size:22px; font-weight:900; margin:6px 0 2px; }
    .p-status { text-align:center; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; margin-bottom:4px; }
    .p-date { text-align:center; font-size:10px; color:#555; margin-bottom:10px; }
    .p-block { margin:8px 0; }
    .p-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#555; margin-bottom:2px; }
    .p-name  { font-size:15px; font-weight:900; }
    .p-info  { font-size:12px; margin-top:2px; }
    .p-ref   { font-size:11px; color:#555; margin-top:2px; }
    .p-obs   { background:#fff8e1; border:1px solid #f0c000; border-radius:4px; padding:6px 8px; font-size:12px; }
    table { width:100%; border-collapse:collapse; margin:4px 0; }
    td    { padding:4px 2px; vertical-align:top; font-size:12px; }
    .p-right { text-align:right; white-space:nowrap; font-weight:600; }
    .p-item-opts { font-size:10px; color:#555; line-height:1.4; margin-top:2px; }
    .p-total-row td { font-size:16px; font-weight:900; padding-top:8px; border-top:2px solid #000; }
    .p-pay  { text-align:center; font-size:13px; font-weight:700; margin:10px 0 4px; }
    .p-pix-pending { text-align:center; font-size:11px; color:#888; }
    .p-footer { text-align:center; font-size:10px; color:#888; margin-top:12px; }
    @media print {
      body { padding:0; }
      @page { margin:8mm; }
    }
  </style>
</head><body>
  <div class="p-logo">★ POINT DOS MALOKAS LANCHES E BEBIDAS ★</div>
  <div class="p-sub">Delivery — (11) 94729-1983</div>
  <hr class="p-divider">
  <div class="p-num">${order.order_number}</div>
  <div class="p-status">${statusMap[order.order_status] || order.order_status}</div>
  <div class="p-date">${formatDateFull(order.created_at)}</div>
  <hr class="p-divider">

  <div class="p-block">
    <div class="p-label">Cliente</div>
    <div class="p-name">${order.customer_name}</div>
    <div class="p-info">📞 ${order.customer_phone}</div>
  </div>

  <div class="p-block">
    <div class="p-label">Endereço de Entrega</div>
    <div class="p-info">${addr}</div>
    ${ref}
  </div>

  ${notes}
  <hr class="p-divider">

  <div class="p-label" style="margin-bottom:4px;">Itens do Pedido</div>
  <table>
    <tbody>${items}</tbody>
    <tr class="p-total-row">
      <td>TOTAL</td>
      <td class="p-right">R$ ${parseFloat(order.total).toFixed(2).replace('.',',')}</td>
    </tr>
  </table>

  <hr class="p-divider">
  <div class="p-pay">💳 ${payMap[order.payment_method] || order.payment_method}</div>
  ${order.payment_method === 'pix' && order.payment_status !== 'pago'
    ? '<div class="p-pix-pending">⏳ Aguardando confirmação do PIX</div>' : ''}
  ${order.payment_method === 'pix' && order.payment_status === 'pago'
    ? '<div class="p-pix-pending" style="color:green;">✅ PIX Confirmado</div>' : ''}
  ${order.change_for > 0 ? `
  <table style="margin-top:6px;">
    <tr><td style="font-size:12px;color:#555;">Cliente paga com</td><td class="p-right">R$ ${parseFloat(order.change_for).toFixed(2).replace('.',',')}</td></tr>
    <tr><td style="font-size:13px;font-weight:900;">TROCO</td><td class="p-right" style="font-size:13px;font-weight:900;">R$ ${(parseFloat(order.change_for) - parseFloat(order.total)).toFixed(2).replace('.',',')}</td></tr>
  </table>` : ''}

  <hr class="p-divider">
  <div class="p-footer">Impresso em ${now}</div>
  <div class="p-footer">Point dos Malokas Lanches e Bebidas — obrigado! 🤙</div>
</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:-9999px;bottom:0;width:420px;height:700px;border:0;visibility:hidden;';
  iframe.srcdoc = html;
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {}
    setTimeout(() => iframe.remove(), 3000);
  };
  document.body.appendChild(iframe);
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
          ${order.payment_method === 'pix'
            ? `${ico('smartphone',12)} Pix ${order.payment_status === 'pago' ? '<span class="pix-paid-badge">● Pago</span>' : '<span class="pix-pending-badge">⏳ Aguardando PIX</span>'}`
            : order.payment_method === 'cartao'
              ? `${ico('credit-card',12)} Cartão na Entrega`
              : `${ico('banknote',12)} Dinheiro na Entrega`}
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

// ── PROMOÇÕES DO DIA ──────────────────────────────────────────────────────────────
async function loadPromotions() {
  try {
    const res = await apiFetch('/promotions');
    const promotions = await res.json();
    renderPromotions(promotions);
  } catch {
    showToast('Erro ao carregar promoções.', 'error');
  }
}

function renderPromotions(promotions) {
  if (!promotions.length) {
    document.getElementById('promotionsList').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📣</div><p>Nenhuma promoção cadastrada.</p></div>';
    return;
  }

  document.getElementById('promotionsList').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Promoção</th><th>Tag</th><th>Status</th><th>Ações</th></tr>
        </thead>
        <tbody>
          ${promotions.map(p => `
            <tr>
              <td>
                <div style="font-weight:600;color:var(--white);">${p.title}</div>
                ${p.message ? `<div style="font-size:.75rem;color:var(--gray);max-width:300px;">${p.message}</div>` : ''}
              </td>
              <td><span class="chip">${p.tag || '—'}</span></td>
              <td><span class="${p.active ? 'text-green' : 'text-red'}">${p.active ? '● Ativa' : '● Inativa'}</span></td>
              <td>
                <div style="display:flex;gap:.4rem;">
                  <button class="btn btn-ghost btn-sm" onclick="editPromotion(${JSON.stringify(p).replace(/"/g,'&quot;')})">${ico('pencil',13)}</button>
                  <button class="btn btn-danger btn-sm" onclick="deletePromotion(${p.id}, '${(p.title || '').replace(/'/g, "\\'")}')">${ico('trash-2',13)}</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  refreshIcons();
}

function openPromotionModal(promo = null) {
  document.getElementById('promotionEditId').value = promo?.id || '';
  document.getElementById('promotionModalTitle').textContent = promo ? 'Editar Promoção' : 'Nova Promoção';
  document.getElementById('promotionTag').value = promo?.tag || '';
  document.getElementById('promotionTitle').value = promo?.title || '';
  document.getElementById('promotionMessage').value = promo?.message || '';
  document.getElementById('promotionPrice').value = promo?.price || '';
  document.getElementById('promotionImageUrl').value = promo?.image_url || '';
  document.getElementById('promotionActive').checked = promo ? !!promo.active : true;
  const imgUrl = promo?.image_url || '';
  const preview = document.getElementById('promotionImagePreview');
  document.getElementById('promotionImagePreviewImg').src = imgUrl;
  preview.style.display = imgUrl ? 'block' : 'none';
  document.getElementById('promotionModal').classList.add('open');
}

function handlePromoImageUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const base64 = e.target.result;
    document.getElementById('promotionImageUrl').value = base64;
    document.getElementById('promotionImagePreviewImg').src = base64;
    document.getElementById('promotionImagePreview').style.display = 'block';
    document.getElementById('promotionUploadText').textContent = file.name;
  };
  reader.readAsDataURL(file);
}

function clearPromoImage() {
  document.getElementById('promotionImageUrl').value = '';
  document.getElementById('promotionImageFile').value = '';
  document.getElementById('promotionImagePreviewImg').src = '';
  document.getElementById('promotionImagePreview').style.display = 'none';
  document.getElementById('promotionUploadText').textContent = 'Clique para escolher foto';
}

function editPromotion(p) { openPromotionModal(p); }
function closePromotionModal() { document.getElementById('promotionModal').classList.remove('open'); }

async function savePromotion() {
  const id = document.getElementById('promotionEditId').value;
  const priceVal = parseFloat(document.getElementById('promotionPrice').value);
  const payload = {
    tag: document.getElementById('promotionTag').value.trim(),
    title: document.getElementById('promotionTitle').value.trim(),
    message: document.getElementById('promotionMessage').value.trim(),
    image_url: document.getElementById('promotionImageUrl').value.trim(),
    price: isNaN(priceVal) ? null : priceVal,
    active: document.getElementById('promotionActive').checked,
  };

  if (!payload.title) {
    showToast('Preencha o título da promoção.', 'error');
    return;
  }

  try {
    if (id) {
      await apiFetch(`/promotions/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/promotions', { method: 'POST', body: JSON.stringify(payload) });
    }
    showToast('Promoção salva!');
    closePromotionModal();
    loadPromotions();
  } catch {
    showToast('Erro ao salvar promoção.', 'error');
  }
}

async function deletePromotion(id, title) {
  if (!confirm(`Excluir "${title}"?`)) return;
  try {
    await apiFetch(`/promotions/${id}`, { method: 'DELETE' });
    showToast('Promoção excluída!');
    loadPromotions();
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
          <span>${p.payment_method === 'pix' ? '📱 Pix' : p.payment_method === 'cartao' ? '💳 Cartão' : '💵 Dinheiro'} (${p.count}x)</span>
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

// ── CLIENT SEARCH ─────────────────────────────────────────────────────────────────
function openClientSearch() {
  document.getElementById('clientSearchInput').value = '';
  document.getElementById('clientSearchResults').innerHTML = '';
  document.getElementById('clientSearchModal').classList.add('open');
  setTimeout(() => document.getElementById('clientSearchInput').focus(), 100);
}

function closeClientSearch() {
  document.getElementById('clientSearchModal').classList.remove('open');
}

async function doClientSearch() {
  const q = document.getElementById('clientSearchInput').value.trim();
  if (!q) return;

  const btn = document.getElementById('clientSearchBtn');
  btn.disabled = true;
  btn.textContent = '...';
  document.getElementById('clientSearchResults').innerHTML =
    '<div style="text-align:center;padding:1.5rem;"><div class="spinner" style="width:24px;height:24px;margin:0 auto;"></div></div>';

  try {
    const res = await apiFetch(`/orders/search?q=${encodeURIComponent(q)}`);
    const orders = await res.json();
    if (!res.ok) throw new Error(orders.error || 'Erro');
    renderClientSearchResults(orders);
  } catch (e) {
    showToast(e.message || 'Erro na busca.', 'error');
    document.getElementById('clientSearchResults').innerHTML =
      '<div style="text-align:center;color:var(--gray);padding:1rem;">Nenhum pedido encontrado.</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Buscar';
  }
}

function renderClientSearchResults(orders) {
  const el = document.getElementById('clientSearchResults');
  if (!orders.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--gray);padding:1.5rem;">Nenhum pedido encontrado.</div>';
    return;
  }

  el.innerHTML = `<div style="font-size:.72rem;color:var(--gray);margin-bottom:.75rem;">${orders.length} pedido(s) encontrado(s)</div>` +
    orders.map(order => `
      <div class="client-search-result" onclick="openOrderFromSearch(${JSON.stringify(order).replace(/"/g,'&quot;')})">
        <div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:1.1rem;color:var(--gold);">${order.order_number}</div>
          <div style="font-size:.7rem;color:var(--gray);">${formatDateFull(order.created_at)}</div>
        </div>
        <div>
          <div style="font-weight:600;color:var(--white);font-size:.88rem;">${order.customer_name}</div>
          <div style="font-size:.75rem;color:var(--gray);">${order.customer_phone}</div>
        </div>
        <div>${statusBadge(order.order_status)}</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:1.2rem;color:var(--gold);text-align:right;">${formatBRL(order.total)}</div>
      </div>`).join('');
  refreshIcons();
}

function openOrderFromSearch(order) {
  if (!allOrders.find(o => o.id === order.id)) allOrders.push(order);
  closeClientSearch();
  openOrderDetail(order.id);
}

// ── ORDER URGENCY & SORTING ────────────────────────────────────────────────────────
function parseLocalDate(s) {
  if (!s) return new Date();
  const [date, time] = s.split(' ');
  return new Date(`${date}T${time || '00:00:00'}`);
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - parseLocalDate(dateStr)) / 60000);
  if (diff < 1) return 'agora';
  if (diff < 60) return `${diff}min`;
  const h = Math.floor(diff / 60), m = diff % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

const ACTIVE_STATUSES = new Set(['novo', 'confirmado', 'preparando', 'saiu']);

function urgencyLevel(order) {
  if (!ACTIVE_STATUSES.has(order.order_status)) return 0;
  const mins = Math.floor((Date.now() - parseLocalDate(order.created_at)) / 60000);
  if (mins >= 45) return 2;
  if (mins >= 20) return 1;
  return 0;
}

function sortOrders(orders) {
  const w = { novo: 0, confirmado: 1, preparando: 2, saiu: 3, entregue: 4, cancelado: 5 };
  return [...orders].sort((a, b) => {
    const wa = w[a.order_status] ?? 9;
    const wb = w[b.order_status] ?? 9;
    if (wa !== wb) return wa - wb;
    return parseLocalDate(b.created_at) - parseLocalDate(a.created_at);
  });
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

// ── SOUND ALERT ───────────────────────────────────────────────────────────────────

let alertedOrderIds = null; // null = first load, don't alert existing orders

function alertNewOrders(orders) {
  const novos = orders.filter(o => o.order_status === 'novo');
  if (alertedOrderIds === null) {
    alertedOrderIds = new Set(novos.map(o => o.id));
    return;
  }
  const unseen = novos.filter(o => !alertedOrderIds.has(o.id));
  if (unseen.length) {
    unseen.forEach(o => alertedOrderIds.add(o.id));
    playNewOrderSound(unseen.length);
  }
}

function playNewOrderSound(count = 1) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (startTime, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
      osc.start(startTime);
      osc.stop(startTime + 0.25);
    };
    beep(ctx.currentTime, 880);
    beep(ctx.currentTime + 0.3, 1100);
    if (count > 1) beep(ctx.currentTime + 0.6, 1100);
  } catch {}
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────────

let settingsCache = {};

async function loadSettings() {
  try {
    const res = await apiFetch('/settings');
    settingsCache = await res.json();
    document.getElementById('settingDeliveryFee').value = settingsCache.delivery_fee || '0';
    document.getElementById('settingStoreName').value   = settingsCache.store_name   || '';
    document.getElementById('settingStorePhone').value  = settingsCache.store_phone  || '';
    document.getElementById('settingPixKey').value      = settingsCache.pix_key      || '';
    updateStoreStatusUI(settingsCache.store_open === '1');
  } catch {}
}

function updateStoreStatusUI(isOpen) {
  const dot    = document.getElementById('settingStoreStatusDot');
  const text   = document.getElementById('settingStoreStatusText');
  const btn    = document.getElementById('settingStoreToggleBtn');
  const pill   = document.getElementById('storeStatusPill');
  if (dot)  { dot.style.background = isOpen ? 'var(--green)' : 'var(--red)'; }
  if (text) { text.textContent = isOpen ? '● Loja Aberta' : '● Loja Fechada'; text.style.color = isOpen ? 'var(--green)' : 'var(--red)'; }
  if (btn)  { btn.textContent = isOpen ? 'Fechar Loja' : 'Abrir Loja'; btn.className = isOpen ? 'btn btn-sm' : 'btn btn-gold btn-sm'; }
  if (pill) { pill.textContent = isOpen ? '● ABERTA' : '● FECHADA'; pill.style.background = isOpen ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)'; pill.style.color = isOpen ? 'var(--green)' : 'var(--red)'; }
}

async function toggleStoreOpen() {
  const isOpen = settingsCache.store_open === '1';
  const newVal = isOpen ? '0' : '1';
  try {
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ store_open: newVal }) });
    settingsCache.store_open = newVal;
    updateStoreStatusUI(newVal === '1');
    showToast(newVal === '1' ? 'Loja aberta! ✅' : 'Loja fechada 🔒');
  } catch { showToast('Erro ao alterar status.', 'error'); }
}

async function saveSettings() {
  const payload = {
    delivery_fee: document.getElementById('settingDeliveryFee').value || '0',
    store_name:   document.getElementById('settingStoreName').value.trim(),
    store_phone:  document.getElementById('settingStorePhone').value.trim(),
    pix_key:      document.getElementById('settingPixKey').value.trim(),
  };
  try {
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(payload) });
    Object.assign(settingsCache, payload);
    showToast('Configurações salvas! ✅');
  } catch { showToast('Erro ao salvar.', 'error'); }
}

async function changeAdminPassword() {
  const cur = document.getElementById('settingCurrentPwd').value;
  const nw  = document.getElementById('settingNewPwd').value;
  if (!cur || !nw) { showToast('Preencha os campos de senha.', 'error'); return; }
  try {
    const res = await apiFetch('/settings/password', { method: 'PUT', body: JSON.stringify({ current_password: cur, new_password: nw }) });
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Erro.', 'error'); return; }
    showToast('Senha alterada com sucesso!');
    document.getElementById('settingCurrentPwd').value = '';
    document.getElementById('settingNewPwd').value = '';
  } catch { showToast('Erro ao alterar senha.', 'error'); }
}

// Close modals on overlay click
document.getElementById('productModal').addEventListener('click', function(e) {
  if (e.target === this) closeProductModal();
});
document.getElementById('comboModal').addEventListener('click', function(e) {
  if (e.target === this) closeComboModal();
});
