// Order tracking page
const STATUS_STEPS = [
  { key: 'novo',        label: 'Pedido Recebido',  icon: 'clipboard-list' },
  { key: 'confirmado',  label: 'Confirmado',        icon: 'check-circle' },
  { key: 'preparando',  label: 'Preparando',        icon: 'flame' },
  { key: 'saiu',        label: 'Saiu para Entrega', icon: 'bike' },
  { key: 'entregue',    label: 'Entregue',          icon: 'package-check' },
];

const STATUS_LABELS = {
  novo:       'Novo pedido',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  saiu:       'Saiu para entrega',
  entregue:   'Entregue!',
  cancelado:  'Cancelado',
};

const STATUS_CLASSES = {
  novo:       'status-novo',
  confirmado: 'status-confirmado',
  preparando: 'status-preparando',
  saiu:       'status-saiu',
  entregue:   'status-entregue',
  cancelado:  'status-cancelado',
};

let orderId = null;
let pollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  orderId = params.get('id');

  if (!orderId) {
    showError();
    return;
  }

  fetchOrder();
  pollInterval = setInterval(fetchOrder, 30000);
});

async function fetchOrder() {
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    if (!res.ok) { showError(); return; }
    const order = await res.json();
    renderOrder(order);
  } catch {
    if (document.getElementById('orderContent').classList.contains('hidden')) {
      showError();
    }
  }
}

function renderOrder(order) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('orderContent').classList.remove('hidden');

  // Header
  document.getElementById('orderNumber').textContent = order.order_number;

  const statusKey = order.order_status;
  const badge = document.getElementById('orderStatusBadge');
  badge.textContent = `● ${STATUS_LABELS[statusKey] || statusKey}`;
  badge.className = `order-status-badge ${STATUS_CLASSES[statusKey] || 'status-novo'}`;

  document.getElementById('orderCreatedAt').textContent =
    `Pedido realizado em ${formatDate(order.created_at)}`;

  // Timeline
  renderTimeline(statusKey);

  // Customer info
  const addr = [order.street, order.number, order.complement, order.neighborhood]
    .filter(Boolean).join(', ');

  document.getElementById('customerInfo').innerHTML = `
    <div style="background:var(--dark);border:1px solid var(--border);border-radius:8px;padding:1rem;">
      <div style="font-size:.75rem;color:var(--gray);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.25rem;">Nome</div>
      <div style="font-weight:600;color:var(--white);">${order.customer_name}</div>
    </div>
    <div style="background:var(--dark);border:1px solid var(--border);border-radius:8px;padding:1rem;">
      <div style="font-size:.75rem;color:var(--gray);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.25rem;">Telefone</div>
      <div style="font-weight:600;color:var(--white);">${order.customer_phone}</div>
    </div>
    <div style="background:var(--dark);border:1px solid var(--border);border-radius:8px;padding:1rem;grid-column:1/-1;">
      <div style="font-size:.75rem;color:var(--gray);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.25rem;">Endereço de Entrega</div>
      <div style="font-weight:600;color:var(--white);">${addr}</div>
      ${order.reference ? `<div style="font-size:.8rem;color:var(--gray);margin-top:.25rem;">Ref: ${order.reference}</div>` : ''}
    </div>
    ${order.notes ? `
    <div style="background:var(--dark);border:1px solid var(--border);border-radius:8px;padding:1rem;grid-column:1/-1;">
      <div style="font-size:.75rem;color:var(--gray);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.25rem;">Observações</div>
      <div style="font-size:.88rem;color:var(--light);">${order.notes}</div>
    </div>` : ''}`;

  // Items
  document.getElementById('orderItems').innerHTML = order.items.map(item => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:.6rem 0;border-bottom:1px solid var(--border);gap:.5rem;">
      <div>
        <div style="font-size:.9rem;font-weight:600;color:var(--white);">${item.qty > 1 ? `${item.qty}x ` : ''}${item.productName}</div>
        ${item.variant ? `<div style="font-size:.78rem;color:var(--gray);">${item.variant}</div>` : ''}
        ${item.optionsSummary ? `<div style="font-size:.75rem;color:var(--gray);">${item.optionsSummary}</div>` : ''}
      </div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.1rem;color:var(--gold);flex-shrink:0;">R$ ${parseFloat(item.subtotal).toFixed(2).replace('.',',')}</div>
    </div>`).join('');

  document.getElementById('orderTotal').textContent = `R$ ${parseFloat(order.total).toFixed(2).replace('.',',')}`;

  // WhatsApp button
  const msg = encodeURIComponent(`Olá! Quero saber o status do meu pedido ${order.order_number}. 😊`);
  document.getElementById('whatsappOrderBtn').href = `https://wa.me/5511947291983?text=${msg}`;

  // Stop polling if delivered or cancelled
  if (statusKey === 'entregue' || statusKey === 'cancelado') {
    clearInterval(pollInterval);
  }
}

function renderTimeline(currentStatus) {
  const currentIndex = STATUS_STEPS.findIndex(s => s.key === currentStatus);
  const isCancelled = currentStatus === 'cancelado';

  const html = STATUS_STEPS.map((step, i) => {
    let cls = '';
    if (isCancelled && step.key === 'novo') cls = 'done';
    else if (!isCancelled && i < currentIndex) cls = 'done';
    else if (!isCancelled && i === currentIndex) cls = 'current';

    return `
      <div class="timeline-step ${cls}">
        <div class="timeline-dot"></div>
        <div>
          <div class="timeline-step-label"><i data-lucide="${step.icon}" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>${step.label}</div>
        </div>
      </div>`;
  }).join('') + (isCancelled ? `
    <div class="timeline-step current">
      <div class="timeline-dot" style="background:var(--red);"></div>
      <div><div class="timeline-step-label" style="color:var(--red);"><i data-lucide="x-circle" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>Pedido Cancelado</div></div>
    </div>` : '');

  document.getElementById('orderTimeline').innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showError() {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR') + ' às ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
