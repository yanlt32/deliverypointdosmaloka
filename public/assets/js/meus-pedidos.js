const PHONE_KEY = 'pdm_my_phone';

const STATUS_LABELS = {
  novo:       'Novo pedido',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  saiu:       'Saiu para entrega',
  entregue:   'Entregue',
  cancelado:  'Cancelado',
};

const STATUS_COLORS = {
  novo:       'var(--gold)',
  confirmado: 'var(--gold)',
  preparando: '#f97316',
  saiu:       '#3b82f6',
  entregue:   'var(--green)',
  cancelado:  'var(--red)',
};

document.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem(PHONE_KEY);
  if (saved) {
    document.getElementById('phoneInput').value = saved;
    buscarPedidos();
  }
});

function formatarTelefone(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 2) {
    input.value = v.length ? `(${v}` : v;
  } else if (v.length <= 7) {
    input.value = `(${v.slice(0,2)}) ${v.slice(2)}`;
  } else {
    input.value = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  }
}

async function buscarPedidos() {
  const raw = document.getElementById('phoneInput').value;
  const phone = raw.replace(/\D/g, '');
  const errEl = document.getElementById('phoneError');

  if (phone.length < 10) {
    errEl.textContent = 'Digite um número de telefone válido (DDD + número).';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  sessionStorage.setItem(PHONE_KEY, raw);

  show('loadingState');

  try {
    const res = await fetch(`/api/orders/by-phone?phone=${encodeURIComponent(phone)}`);
    if (!res.ok) throw new Error();
    const orders = await res.json();

    if (!orders.length) {
      show('emptyState');
      return;
    }

    renderOrders(orders, phone);
    show('resultsState');
  } catch {
    show('phoneState');
    showToast('Erro ao buscar pedidos. Tente novamente.', 'error');
  }
}

let currentPhone = null;

function renderOrders(orders, phone) {
  currentPhone = phone;
  const title = document.getElementById('resultsTitle');
  title.textContent = `${orders.length} pedido${orders.length > 1 ? 's' : ''} encontrado${orders.length > 1 ? 's' : ''}`;

  document.getElementById('ordersList').innerHTML = orders.map(order => {
    const color = STATUS_COLORS[order.order_status] || 'var(--gold)';
    const label = STATUS_LABELS[order.order_status] || order.order_status;
    const isActive = !['entregue', 'cancelado'].includes(order.order_status);
    const canCancel = ['novo', 'confirmado'].includes(order.order_status);
    return `
      <div class="order-card" style="margin-bottom:1rem;padding:0;overflow:hidden;" id="card-${order.order_number}">
        <div style="padding:1.25rem 1.25rem .75rem;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;">
            <div>
              <div style="font-size:.72rem;color:var(--gray);text-transform:uppercase;letter-spacing:.1em;">Pedido</div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:1.4rem;color:var(--white);">${order.order_number}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:.7rem;font-weight:600;padding:.25rem .65rem;border-radius:999px;background:${color}22;color:${color};border:1px solid ${color}44;">● ${label}</div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;color:var(--gold);margin-top:.35rem;">R$ ${parseFloat(order.total).toFixed(2).replace('.',',')}</div>
            </div>
          </div>
          <div style="font-size:.78rem;color:var(--gray);margin-top:.5rem;">${formatDate(order.created_at)}</div>
        </div>
        <div style="border-top:1px solid var(--border);padding:.75rem 1.25rem;display:flex;gap:.5rem;flex-wrap:wrap;">
          <a href="/pedido?id=${order.id}" class="btn btn-gold btn-sm" style="flex:1;text-align:center;min-width:120px;">
            <i data-lucide="${isActive ? 'map-pin' : 'eye'}" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"></i>${isActive ? 'Acompanhar' : 'Ver detalhes'}
          </a>
          ${canCancel ? `<button onclick="pedirCancelamento('${order.order_number}')" style="background:none;border:1px solid rgba(239,68,68,.4);border-radius:8px;padding:.45rem .9rem;color:#ef4444;font-size:.8rem;font-weight:600;cursor:pointer;">Cancelar</button>` : ''}
        </div>
      </div>`;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function pedirCancelamento(orderNum) {
  const overlay = document.createElement('div');
  overlay.id = 'cancelModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
  overlay.innerHTML = `
    <div style="background:var(--card);border:1px solid rgba(239,68,68,.3);border-radius:20px;width:100%;max-width:360px;padding:2rem;text-align:center;">
      <div style="font-size:3rem;margin-bottom:1rem;">⚠️</div>
      <h3 style="font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:var(--white);margin-bottom:.5rem;">Cancelar Pedido?</h3>
      <p style="color:var(--gray);font-size:.9rem;margin-bottom:1.75rem;line-height:1.6;">Tem certeza que deseja cancelar o pedido <strong style="color:var(--white);">${orderNum}</strong>?<br>Esta ação não pode ser desfeita.</p>
      <div style="display:flex;gap:.75rem;">
        <button onclick="document.getElementById('cancelModal').remove()" style="flex:1;background:var(--dark);border:1px solid var(--border);border-radius:10px;padding:.85rem;color:var(--gray);font-size:.9rem;font-weight:600;cursor:pointer;">
          Não, manter
        </button>
        <button onclick="executarCancelamento('${orderNum}')" style="flex:1;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);border-radius:10px;padding:.85rem;color:#ef4444;font-size:.9rem;font-weight:700;cursor:pointer;">
          Sim, cancelar
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function executarCancelamento(orderNum) {
  document.getElementById('cancelModal')?.remove();
  try {
    const res = await fetch(`/api/orders/${orderNum}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao cancelar.');
    showToast('Pedido cancelado.', 'info');
    buscarPedidos();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function voltarBusca() {
  show('phoneState');
}

function show(id) {
  ['phoneState','loadingState','resultsState','emptyState'].forEach(s => {
    document.getElementById(s).style.display = s === id ? '' : 'none';
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR') + ' às ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
