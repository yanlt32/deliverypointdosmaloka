// Order tracking page
const STATUS_STEPS = [
  { key: 'novo',        label: 'Pedido Recebido',    icon: 'clipboard-list' },
  { key: 'confirmado',  label: 'Confirmado',          icon: 'check-circle' },
  { key: 'preparando',  label: 'Preparando',          icon: 'flame' },
  { key: 'saiu',        label: 'Saiu para Entrega',   icon: 'bike' },
  { key: 'entregue',    label: 'Entregue',             icon: 'package-check' },
];

const RETIRADA_STEPS = [
  { key: 'novo',        label: 'Pedido Recebido',     icon: 'clipboard-list' },
  { key: 'confirmado',  label: 'Confirmado',           icon: 'check-circle' },
  { key: 'preparando',  label: 'Preparando',           icon: 'flame' },
  { key: 'saiu',        label: 'Pronto para Retirar',  icon: 'store' },
  { key: 'entregue',    label: 'Retirado ✓',           icon: 'package-check' },
];

const STATUS_LABELS = {
  novo:       'Novo pedido',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  saiu:       'Saiu para entrega',
  entregue:   'Entregue!',
  cancelado:  'Cancelado',
};

const RETIRADA_LABELS = {
  novo:       'Novo pedido',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  saiu:       'Pronto para Retirar',
  entregue:   'Retirado!',
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
let orderNumber = null;
let pollInterval = null;
let pixKey = null;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  orderId = params.get('id');

  if (!orderId) { showError(); return; }

  try {
    const s = await fetch('/api/settings').then(r => r.json());
    pixKey = s.pix_key || s.store_phone || null;
  } catch {}

  fetchOrder();
  pollInterval = setInterval(fetchOrder, 10000);
  setupNotifyBanner();
});

// ── NOTIFICAÇÕES PUSH ─────────────────────────────────────────────────────────────

function setupNotifyBanner() {
  const banner = document.getElementById('notifyBanner');
  if (!banner) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'denied') return; // usuário bloqueou
  if (Notification.permission === 'granted') {
    // Já autorizou — reativa inscrição silenciosamente se necessário
    resubscribeIfNeeded();
    return;
  }
  banner.style.display = 'flex';
}

async function resubscribeIfNeeded() {
  try {
    const { key } = await fetch('/api/push/vapid-public-key').then(r => r.json());
    if (!key) return;
    const reg = await navigator.serviceWorker.register('/sw.js');
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await fetch(`/api/orders/${orderId}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existing.toJSON()),
      });
    }
  } catch {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function ativarNotificacoes() {
  const btn = document.getElementById('notifyBtn');
  btn.disabled = true;
  btn.textContent = 'Ativando...';

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      btn.disabled = false;
      btn.textContent = 'Ativar Notificações';
      return;
    }

    const { key } = await fetch('/api/push/vapid-public-key').then(r => r.json());
    if (!key) {
      btn.textContent = 'Indisponível';
      return;
    }

    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    await fetch(`/api/orders/${orderId}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });

    document.getElementById('notifyBanner').innerHTML =
      '<div style="font-size:.85rem;color:var(--green);">🔔 Notificações ativadas! Você vai receber avisos quando o status mudar.</div>';
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Ativar Notificações';
  }
}

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
  const isRetirada = order.delivery_type === 'retirada';
  const labels = isRetirada ? RETIRADA_LABELS : STATUS_LABELS;
  const badge = document.getElementById('orderStatusBadge');
  badge.textContent = `● ${labels[statusKey] || statusKey}`;
  badge.className = `order-status-badge ${STATUS_CLASSES[statusKey] || 'status-novo'}`;

  document.getElementById('orderCreatedAt').textContent =
    `Pedido realizado em ${formatDate(order.created_at)}`;

  // Timeline
  renderTimeline(statusKey, isRetirada);

  // Customer info
  const titleEl = document.getElementById('customerInfoTitle');
  if (titleEl) titleEl.textContent = isRetirada ? 'Dados do Pedido' : 'Dados de Entrega';

  const addrLabel = isRetirada ? 'Tipo de Pedido' : 'Endereço de Entrega';
  const addrValue = isRetirada
    ? '🏪 Retirada no local'
    : [order.street, order.number, order.complement, order.neighborhood].filter(Boolean).join(', ');

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
      <div style="font-size:.75rem;color:var(--gray);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.25rem;">${addrLabel}</div>
      <div style="font-weight:600;color:var(--white);">${addrValue}</div>
      ${!isRetirada && order.reference ? `<div style="font-size:.8rem;color:var(--gray);margin-top:.25rem;">Ref: ${order.reference}</div>` : ''}
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

  // PIX payment section — mostra instrução simples se PIX e não finalizado
  orderNumber = order.order_number;
  const pixInfo = document.getElementById('pixDeliveryInfo');
  if (pixInfo) {
    pixInfo.style.display = (order.payment_method === 'pix' && !['entregue', 'cancelado'].includes(statusKey)) ? 'block' : 'none';
  }

  // Botão cancelar — só mostra se status for novo ou confirmado
  const cancelBtn = document.getElementById('cancelOrderBtn');
  if (cancelBtn) {
    cancelBtn.style.display = ['novo', 'confirmado'].includes(statusKey) ? 'block' : 'none';
  }

  // Stop polling if delivered or cancelled
  if (statusKey === 'entregue' || statusKey === 'cancelado') {
    clearInterval(pollInterval);
  }
}

function cancelOrder() {
  if (!orderNumber) return;

  const overlay = document.createElement('div');
  overlay.id = 'cancelModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
  overlay.innerHTML = `
    <div style="background:var(--card);border:1px solid rgba(239,68,68,.3);border-radius:20px;width:100%;max-width:360px;padding:2rem;text-align:center;">
      <div style="font-size:3rem;margin-bottom:1rem;">⚠️</div>
      <h3 style="font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:var(--white);margin-bottom:.5rem;">Cancelar Pedido?</h3>
      <p style="color:var(--gray);font-size:.9rem;margin-bottom:1.75rem;line-height:1.6;">Tem certeza que deseja cancelar o pedido <strong style="color:var(--white);">${orderNumber}</strong>?<br>Esta ação não pode ser desfeita.</p>
      <div style="display:flex;gap:.75rem;">
        <button onclick="document.getElementById('cancelModal').remove()" style="flex:1;background:var(--dark);border:1px solid var(--border);border-radius:10px;padding:.85rem;color:var(--gray);font-size:.9rem;font-weight:600;cursor:pointer;">
          Não, manter
        </button>
        <button id="confirmCancelBtn" onclick="confirmCancelOrder()" style="flex:1;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);border-radius:10px;padding:.85rem;color:#ef4444;font-size:.9rem;font-weight:700;cursor:pointer;">
          Sim, cancelar
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function confirmCancelOrder() {
  const btn = document.getElementById('confirmCancelBtn');
  btn.disabled = true;
  btn.textContent = 'Cancelando...';

  try {
    const res = await fetch(`/api/orders/${orderNumber}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao cancelar.');
    document.getElementById('cancelModal')?.remove();
    fetchOrder();
  } catch (err) {
    document.getElementById('cancelModal')?.remove();
    const errOverlay = document.createElement('div');
    errOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
    errOverlay.innerHTML = `<div style="background:var(--card);border:1px solid rgba(239,68,68,.3);border-radius:20px;width:100%;max-width:320px;padding:2rem;text-align:center;"><p style="color:var(--red);font-size:.95rem;margin-bottom:1rem;">${err.message}</p><button onclick="this.closest('[style]').remove()" style="background:var(--gold);color:var(--black);border:none;border-radius:8px;padding:.65rem 1.5rem;font-weight:700;cursor:pointer;">OK</button></div>`;
    errOverlay.addEventListener('click', e => { if (e.target === errOverlay) errOverlay.remove(); });
    document.body.appendChild(errOverlay);
  }
}


function renderTimeline(currentStatus, isRetirada) {
  const steps = isRetirada ? RETIRADA_STEPS : STATUS_STEPS;
  const currentIndex = steps.findIndex(s => s.key === currentStatus);
  const isCancelled = currentStatus === 'cancelado';

  const html = steps.map((step, i) => {
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
