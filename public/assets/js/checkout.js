// Checkout page — form persistence + automatic Pix payment polling
const FORM_KEY = 'pdm_checkout_form';
const ORDER_PENDING_KEY = 'pdm_pending_order';

let paymentMethod = 'pix';
let pixPayOption  = 'antes'; // 'antes' | 'entrega'
let deliveryType = 'retirada'; // entrega temporariamente desativada — em construção
let orderPlaced = false;
let changeFor = null;
let pendingOrderId = null;
let pixPollInterval = null;
let deliveryFee = 0;
let storeOpen = true;
let _checkoutOrderData = null; // orderId + orderNumber para claimPixAndRedirect

// ── INIT ─────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Carrega configurações da loja (taxa de entrega + status)
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    deliveryFee = parseFloat(s.delivery_fee) || 0;
    storeOpen = s.store_open !== '0';
    if (!storeOpen) {
      const btn = document.getElementById('placeOrderBtn');
      if (btn) { btn.disabled = true; btn.textContent = '🔒 Loja fechada no momento'; btn.style.opacity = '.6'; }
    }
  } catch {}
  selectDeliveryType('retirada');
  // PIX já está selecionado por padrão — mostrar sub-opções
  const pixPayOpts = document.getElementById('pixPaymentOptions');
  if (pixPayOpts) pixPayOpts.style.display = 'block';

  const cart = getCart();
  const pending = getPendingOrder();

  // Show restore banner if there's an unpaid Pix order (regardless of cart state)
  if (pending) {
    showRestoredOrderBanner(pending);
  }

  // If cart is empty and there's no form to render, stop here
  if (cart.length === 0) {
    if (!pending) window.location.href = '/menu';
    return;
  }

  renderSummary(cart);
  restoreForm();
  setupFormPersistence();
  formatPhone();
});

// ── FORM PERSISTENCE ──────────────────────────────────────────────────────────────

let orderCity = 'São Paulo';

function setupFormPersistence() {
  ['customerName','customerPhone','cep','street','houseNumber','complement','neighborhood','reference','notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveForm);
  });
}

function saveForm() {
  const data = {};
  ['customerName','customerPhone','cep','street','houseNumber','complement','neighborhood','reference','notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  data.paymentMethod = paymentMethod;
  data.deliveryType = deliveryType;
  data.orderCity = orderCity;
  sessionStorage.setItem(FORM_KEY, JSON.stringify(data));
}

function restoreForm() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(FORM_KEY) || '{}');
    if (!Object.keys(saved).length) return;
    ['customerName','customerPhone','cep','street','houseNumber','complement','neighborhood','reference','notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el && saved[id]) el.value = saved[id];
    });
    if (saved.orderCity) orderCity = saved.orderCity;
    if (saved.deliveryType) selectDeliveryType(saved.deliveryType);
    if (saved.paymentMethod) {
      paymentMethod = saved.paymentMethod;
      selectPayment(paymentMethod, false);
    }
  } catch {}
}

function clearForm() {
  sessionStorage.removeItem(FORM_KEY);
}

// ── PENDING ORDER (survive page reload) ───────────────────────────────────────────

function savePendingOrder(data) {
  localStorage.setItem(ORDER_PENDING_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
}

function getPendingOrder() {
  try {
    const raw = localStorage.getItem(ORDER_PENDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.savedAt > 7200000) { // 2 hours
      localStorage.removeItem(ORDER_PENDING_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function clearPendingOrder() {
  localStorage.removeItem(ORDER_PENDING_KEY);
}

// ── RESTORE BANNER ────────────────────────────────────────────────────────────────
// Shows a banner for an unpaid Pix order from a previous session.
// NO "Acompanhar" link — order isn't paid yet.

function showRestoredOrderBanner(pending) {
  window._pendingOrderData = pending;

  const banner = document.createElement('div');
  banner.id = 'restoreBanner';
  banner.style.cssText = `
    position: fixed; top: 64px; left: 0; right: 0; z-index: 900;
    background: var(--gold); color: var(--black);
    padding: .85rem 1.5rem;
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; font-weight: 600; font-size: .88rem; flex-wrap: wrap;
  `;
  banner.innerHTML = `
    <span>📦 Pedido Pix pendente: <strong>${pending.orderNumber}</strong> — ${formatBRL(pending.total)}</span>
    <div style="display:flex;gap:.75rem;align-items:center;">
      <button onclick="openPixModal()" style="background:var(--black);color:var(--gold);border:none;border-radius:6px;padding:.4rem .9rem;font-weight:700;cursor:pointer;font-size:.82rem;">
        📱 Ver QR Code
      </button>
      <button onclick="dismissBanner(true)" style="background:rgba(0,0,0,.15);border:none;border-radius:6px;padding:.4rem .75rem;cursor:pointer;font-size:1rem;">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
}

function dismissBanner(clearPending) {
  document.getElementById('restoreBanner')?.remove();
  if (clearPending) {
    clearPendingOrder();
    window._pendingOrderData = null;
    if (pixPollInterval) clearInterval(pixPollInterval);
  }
}

// ── PIX MODAL (for restoring unpaid Pix) ─────────────────────────────────────────
// Uses a self-contained overlay so it works even if the checkout form isn't rendered.

function openPixModal() {
  const pending = window._pendingOrderData || getPendingOrder();
  if (!pending) return;

  const existing = document.getElementById('pixModal');
  if (existing) { existing.style.display = 'flex'; return; }

  const pixPayload = pending.pix?.payload || pending.pix?.pixKey || '+5511947291983';
  const qrHtml = pending.pix?.qrBase64
    ? `<img src="${pending.pix.qrBase64}" alt="QR Code Pix" style="width:200px;border-radius:8px;margin:0 auto;display:block;">`
    : `<div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:1.5rem;color:var(--gray);font-size:.85rem;text-align:center;">QR Code indisponível.<br>Use a chave abaixo.</div>`;

  const total = formatBRL(pending.total);
  const msg = encodeURIComponent(
    `Olá! Tenho um pedido pendente no Point dos Malokas Lanches e Bebidas.\n\n` +
    `*Pedido:* ${pending.orderNumber}\n*Total:* ${total}\n*Pagamento:* Pix\n\n` +
    `Já realizei o pagamento! 🙌`
  );

  const overlay = document.createElement('div');
  overlay.id = 'pixModal';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2000;
    display:flex;align-items:center;justify-content:center;padding:1rem;
  `;
  overlay.innerHTML = `
    <div style="background:var(--card);border:1px solid rgba(245,197,24,.3);border-radius:20px;width:100%;max-width:420px;max-height:90vh;overflow-y:auto;padding:1.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
        <h3 style="font-family:'Bebas Neue',sans-serif;font-size:1.5rem;color:var(--gold);">PAGAMENTO PIX</h3>
        <button onclick="closePixModal()" style="background:none;border:none;color:var(--gray);font-size:1.5rem;cursor:pointer;">✕</button>
      </div>

      <p style="font-size:.85rem;color:var(--gray);margin-bottom:1.25rem;">
        Pedido <strong style="color:var(--white);">${pending.orderNumber}</strong> — <strong style="color:var(--gold);">${total}</strong>
      </p>

      <div style="margin-bottom:1rem;">${qrHtml}</div>

      <p style="font-size:.8rem;color:var(--gray);text-align:center;margin-bottom:1rem;">Escaneie o QR Code ou copie o código abaixo:</p>

      <div style="background:var(--dark);border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:1rem;">
        <span id="pixModalKey" style="font-family:monospace;font-size:.78rem;color:var(--white);word-break:break-all;flex:1;">${pixPayload}</span>
        <button onclick="copyPixModalKey()" style="background:var(--gold);color:var(--black);border:none;border-radius:6px;padding:.4rem .8rem;font-size:.75rem;font-weight:700;cursor:pointer;flex-shrink:0;" id="copyModalBtn">Copiar</button>
      </div>

      <p style="font-size:.78rem;color:var(--gray);margin-bottom:1.25rem;line-height:1.7;">
        <strong style="color:var(--white);">Como pagar:</strong> Abra o app do banco → Pix → Escanear QR Code ou Pix Copia e Cola.
      </p>

      <div id="pixModalWaiting" style="display:flex;align-items:center;gap:.6rem;background:rgba(245,197,24,.08);border:1px solid rgba(245,197,24,.2);border-radius:8px;padding:.75rem 1rem;margin-bottom:1rem;font-size:.82rem;color:var(--gray);">
        <div class="spinner" style="width:16px;height:16px;flex-shrink:0;"></div>
        <span>Aguardando confirmação automática...</span>
      </div>

      <button onclick="dismissBanner(true);closePixModal();" style="width:100%;margin-top:.75rem;background:none;border:1px solid var(--border);border-radius:10px;padding:.75rem;font-size:.82rem;color:var(--gray);cursor:pointer;">
        Cancelar pedido pendente e fazer novo
      </button>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) closePixModal(); });
  document.body.appendChild(overlay);

  // Start polling inside modal
  if (pending.orderId) {
    startPixPolling(pending.orderId, true);
  }
}

function closePixModal() {
  const m = document.getElementById('pixModal');
  if (m) m.style.display = 'none';
}

function copyPixModalKey() {
  const key = document.getElementById('pixModalKey').textContent;
  const btn = document.getElementById('copyModalBtn');
  navigator.clipboard.writeText(key).then(() => {
    btn.textContent = 'Copiado!';
    btn.style.background = 'var(--green)';
    setTimeout(() => { btn.textContent = 'Copiar'; btn.style.background = ''; }, 2500);
  });
}

// ── RENDER SUMMARY ────────────────────────────────────────────────────────────────

function renderSummary(cart) {
  const container = document.getElementById('summaryItems');
  const totalEl = document.getElementById('summaryTotal');
  const feeEl = document.getElementById('summaryDeliveryFee');
  const feeRow = document.getElementById('summaryFeeRow');
  if (!container) return;

  container.innerHTML = cart.map(item => `
    <div class="summary-item">
      <div class="summary-item-info">
        <div class="summary-item-name">${item.qty > 1 ? `${item.qty}x ` : ''}${item.productName}</div>
        ${item.variant ? `<div class="summary-item-detail">${item.variant}</div>` : ''}
        ${item.optionsSummary ? `<div class="summary-item-detail">${item.optionsSummary}</div>` : ''}
      </div>
      <div class="summary-item-price">${formatBRL(item.subtotal)}</div>
    </div>`).join('');

  const itemsTotal = getTotal();
  const activeFee = deliveryType === 'retirada' ? 0 : deliveryFee;
  const grand = itemsTotal + activeFee;
  if (feeRow) feeRow.style.display = activeFee > 0 ? 'flex' : 'none';
  if (feeEl) feeEl.textContent = formatBRL(activeFee);
  if (totalEl) totalEl.textContent = formatBRL(grand);
}

// ── PAYMENT SELECTION ─────────────────────────────────────────────────────────────

function selectDeliveryType(type) {
  // Entrega temporariamente desativada (em construção) — força retirada
  deliveryType = type === 'entrega' ? 'retirada' : type;
  type = deliveryType;
  document.getElementById('optEntrega').classList.toggle('selected', type === 'entrega');
  document.getElementById('optRetirada').classList.toggle('selected', type === 'retirada');

  const addrFields = document.getElementById('addressFields');
  const titleEl = document.getElementById('addressSectionTitle');
  if (type === 'retirada') {
    addrFields.style.display = 'none';
    if (titleEl) titleEl.innerHTML = '<i data-lucide="store" style="width:17px;height:17px;"></i> Seus Dados';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } else {
    addrFields.style.display = '';
    if (titleEl) titleEl.innerHTML = '<i data-lucide="map-pin" style="width:17px;height:17px;"></i> Dados para Entrega';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  renderSummary(getCart());
  saveForm();
}

function selectPayment(method, persist = true) {
  paymentMethod = method;
  const idMap = { pix:'optPix', dinheiro:'optDinheiro', cartao:'optCartao', alelo:'optAlelo', vr:'optVR' };
  Object.entries(idMap).forEach(([m, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('selected', m === method);
  });

  const pixDisplay = document.getElementById('pixDisplay');
  const dinheiroInfo = document.getElementById('dinheiroInfo');
  const pixPayOpts = document.getElementById('pixPaymentOptions');
  if (pixDisplay) pixDisplay.classList.remove('visible');
  if (dinheiroInfo) dinheiroInfo.style.display = method === 'dinheiro' ? 'block' : 'none';
  if (pixPayOpts) pixPayOpts.style.display = method === 'pix' ? 'block' : 'none';

  if (method !== 'dinheiro') { changeFor = null; }
  if (persist) saveForm();
}

function selectPixPayOption(option) {
  pixPayOption = option;
  const antes    = document.getElementById('optPixAntes');
  const entrega  = document.getElementById('optPixEntrega');
  if (antes)   antes.classList.toggle('selected', option === 'antes');
  if (entrega) entrega.classList.toggle('selected', option === 'entrega');
}

function selectChangeFor(value) {
  changeFor = value;
  document.querySelectorAll('.change-btn').forEach(b => b.classList.remove('active'));

  if (value === null) {
    document.getElementById('changeResult').style.display = 'none';
    document.getElementById('changeBtnNone').classList.add('active');
    document.getElementById('changeForCustom').value = '';
    return;
  }

  const total = getTotal();
  const troco = value - total;
  const result = document.getElementById('changeResult');

  if (troco >= 0) {
    document.getElementById('changeAmount').textContent = 'R$ ' + troco.toFixed(2).replace('.', ',');
    result.style.display = 'block';
  } else {
    result.style.display = 'none';
  }

  // highlight quick button if matches
  document.querySelectorAll('.change-btn:not(#changeBtnNone)').forEach(b => {
    if (b.textContent.trim() === `R$ ${value}`) b.classList.add('active');
  });
}

// ── CEP AUTO-FILL ────────────────────────────────────────────────────────────────

function onCepInput(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
  input.value = v;
  document.getElementById('cepError').style.display = 'none';
  if (v.replace('-', '').length === 8) buscarCEP(v.replace('-', ''));
  saveForm();
}

async function buscarCEP(cep) {
  const spinner = document.getElementById('cepSpinner');
  const errEl = document.getElementById('cepError');
  spinner.style.display = 'block';
  errEl.style.display = 'none';
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (data.erro) {
      errEl.textContent = 'CEP não encontrado.';
      errEl.style.display = 'block';
      return;
    }
    if (data.logradouro) document.getElementById('street').value = data.logradouro;
    if (data.bairro) document.getElementById('neighborhood').value = data.bairro;
    if (data.localidade) orderCity = data.localidade;
    document.getElementById('houseNumber').focus();
    saveForm();
    showToast(`Endereço encontrado: ${data.localidade || ''}`, 'success');
  } catch {
    errEl.textContent = 'Erro ao buscar CEP. Preencha manualmente.';
    errEl.style.display = 'block';
  } finally {
    spinner.style.display = 'none';
  }
}

// ── PHONE FORMAT ──────────────────────────────────────────────────────────────────

function formatPhone() {
  const input = document.getElementById('customerPhone');
  if (!input) return;
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '');
    // Strip country code 55 (+55 or 55 typed by mistake)
    if (v.startsWith('55') && v.length > 11) v = v.slice(2);
    v = v.slice(0, 11);
    if (v.length >= 11) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    else if (v.length >= 7) v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3');
    else if (v.length >= 3) v = v.replace(/(\d{2})(\d+)/, '($1) $2');
    input.value = v;
    saveForm();
  });
}

// ── VALIDATE ──────────────────────────────────────────────────────────────────────

function validate() {
  const always = [
    ['customerName', 'Nome completo'],
    ['customerPhone', 'Telefone'],
  ];
  const addressFields = [
    ['street', 'Rua'],
    ['houseNumber', 'Número'],
    ['neighborhood', 'Bairro'],
  ];
  const required = deliveryType === 'retirada' ? always : [...always, ...addressFields];
  for (const [id, label] of required) {
    if (!document.getElementById(id)?.value?.trim()) {
      showToast(`Preencha: ${label}`, 'error');
      document.getElementById(id)?.focus();
      return false;
    }
  }
  return true;
}

// ── PLACE ORDER ───────────────────────────────────────────────────────────────────

async function placeOrder() {
  if (orderPlaced) return;
  if (!validate()) return;

  const cart = getCart();
  if (!cart.length) { showToast('Carrinho vazio!', 'error'); return; }

  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Enviando pedido...';

  const isPickup = deliveryType === 'retirada';
  const payload = {
    customer_name:  document.getElementById('customerName').value.trim(),
    customer_phone: document.getElementById('customerPhone').value.trim(),
    street:         isPickup ? 'Retirada no local' : document.getElementById('street').value.trim(),
    number:         isPickup ? '-' : document.getElementById('houseNumber').value.trim(),
    complement:     isPickup ? '' : document.getElementById('complement').value.trim(),
    neighborhood:   isPickup ? 'Retirada' : document.getElementById('neighborhood').value.trim(),
    city:           isPickup ? '' : orderCity,
    reference:      isPickup ? '' : document.getElementById('reference').value.trim(),
    notes:          document.getElementById('notes').value.trim(),
    items:          cart,
    payment_method: paymentMethod,
    change_for:     paymentMethod === 'dinheiro' ? changeFor : null,
    delivery_fee:   isPickup ? 0 : deliveryFee,
    delivery_type:  deliveryType,
    pix_pay_option: paymentMethod === 'pix' ? pixPayOption : null,
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao confirmar pedido.');

    orderPlaced = true;
    clearCart();
    clearForm();

    if (paymentMethod === 'pix' && pixPayOption === 'antes') {
      // Pagar Antes — mostrar PIX para o cliente pagar agora
      btn.textContent = '✅ Pedido Enviado!';
      btn.disabled = true;
      _checkoutOrderData = { orderId: data.orderId, orderNumber: data.orderNumber };

      if (data.pix?.paymentId) {
        // PIX dinâmico (Mercado Pago) — polling automático
        const orderData = { orderId: data.orderId, orderNumber: data.orderNumber, total: data.total, pix: data.pix, paymentMethod: 'pix' };
        savePendingOrder(orderData);
        showPixDisplay(data, false);
        startPixPolling(data.orderId, false);
      } else {
        // PIX estático — mostra QR + copia e cola + botão "Já Paguei"
        showPixDisplay(data, true);
      }
    } else {
      // Pagar na Entrega ou outros métodos — modal de confirmação
      btn.textContent = '✅ Pedido Confirmado!';
      showOrderConfirmedModal(data);
    }

  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Confirmar Pedido →';
    orderPlaced = false;
  }
}

// ── ORDER CONFIRMED MODAL ──────────────────────────────────────────────────────────

function showOrderConfirmedModal(data) {
  const overlay = document.createElement('div');
  overlay.id = 'orderConfirmedModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
  overlay.innerHTML = `
    <div style="background:var(--card);border:1px solid rgba(34,197,94,.4);border-radius:20px;width:100%;max-width:380px;padding:2rem;text-align:center;">
      <div style="font-size:3.5rem;margin-bottom:1rem;">✅</div>
      <h3 style="font-family:'Bebas Neue',sans-serif;font-size:2rem;color:var(--green);margin-bottom:.5rem;">PEDIDO CONFIRMADO!</h3>
      <p style="color:var(--gray);font-size:.9rem;margin-bottom:1.75rem;line-height:1.6;">
        Pedido <strong style="color:var(--white);">${data.orderNumber}</strong> recebido com sucesso.<br>Total: <strong style="color:var(--gold);">${formatBRL(data.total)}</strong>
      </p>
      <a href="/pedido?id=${data.orderId}" class="btn btn-gold btn-lg btn-block">📦 Acompanhar Meu Pedido →</a>
    </div>`;
  document.body.appendChild(overlay);
}

// ── PIX DISPLAY (inline, shown in the checkout form after placing order) ──────────

function showPixDisplay(data, isStatic = false) {
  const display = document.getElementById('pixDisplay');
  if (!display) return;
  display.classList.add('visible');

  if (data.pix?.qrBase64) {
    document.getElementById('pixQrImg').src = data.pix.qrBase64;
  } else {
    document.querySelector('.pix-qr').innerHTML =
      '<div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:1.5rem;color:var(--gray);font-size:.85rem;text-align:center;">QR Code indisponível.<br>Use o código abaixo.</div>';
  }

  const pixPayload = data.pix?.payload || data.pix?.pixKey || '+5511947291983';
  document.getElementById('pixKeyValue').textContent = pixPayload;

  // Para PIX estático: esconde spinner de "aguardando" e mostra "Já Paguei"
  const pixWaiting = document.getElementById('pixWaiting');
  const pixClaim   = document.getElementById('pixClaimCheckout');
  if (isStatic) {
    if (pixWaiting) pixWaiting.style.display = 'none';
    if (pixClaim)   pixClaim.style.display = 'block';
  } else {
    if (pixWaiting) pixWaiting.style.display = 'flex';
    if (pixClaim)   pixClaim.style.display = 'none';
  }

  const total = formatBRL(data.total);
  renderSummary([]);
  document.getElementById('summaryTotal').textContent = total;

  display.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── JÁ PAGUEI (checkout) ──────────────────────────────────────────────────────────

async function claimPixAndRedirect() {
  if (!_checkoutOrderData) return;
  const btn = document.getElementById('pixClaimCheckoutBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Registrando...'; }

  try {
    await fetch(`/api/orders/${_checkoutOrderData.orderNumber}/pix-claimed`, { method: 'POST' });
  } catch {}

  const { orderId, orderNumber } = _checkoutOrderData;
  const msg = encodeURIComponent(`Olá! Paguei o PIX do pedido ${orderNumber}. Segue o comprovante!`);
  const wppLink = `https://wa.me/5511947291983?text=${msg}`;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
  overlay.innerHTML = `
    <div style="background:var(--card);border:1px solid rgba(34,197,94,.4);border-radius:20px;width:100%;max-width:380px;padding:2rem;text-align:center;">
      <div style="font-size:3.5rem;margin-bottom:1rem;">✅</div>
      <h3 style="font-family:'Bebas Neue',sans-serif;font-size:2rem;color:var(--green);margin-bottom:.5rem;">PAGAMENTO REGISTRADO!</h3>
      <p style="color:var(--gray);font-size:.9rem;margin-bottom:1.75rem;line-height:1.6;">
        Mostre o comprovante do PIX ao retirar seu pedido,<br>ou envie pelo WhatsApp da loja.
      </p>
      <div style="display:flex;flex-direction:column;gap:.75rem;">
        <a href="${wppLink}" target="_blank" style="display:block;background:var(--gold);color:var(--black);font-weight:700;font-size:.95rem;border-radius:10px;padding:.85rem;text-decoration:none;text-align:center;">
          📱 Enviar Comprovante no WhatsApp
        </a>
        <a href="/pedido?id=${orderId}" style="display:block;background:none;border:1px solid var(--border);color:var(--white);border-radius:10px;padding:.75rem;font-size:.88rem;font-weight:600;text-decoration:none;text-align:center;">
          Ver Meu Pedido
        </a>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

// ── PIX PAYMENT POLLING ────────────────────────────────────────────────────────────

function startPixPolling(orderId, isModal) {
  if (!isModal && pixPollInterval) clearInterval(pixPollInterval);

  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) return;
      const order = await res.json();

      if (order.payment_status === 'pago' || order.order_status === 'confirmado') {
        clearInterval(interval);
        clearPendingOrder();
        if (isModal) {
          showPaymentConfirmedInModal(orderId);
        } else {
          showPaymentConfirmed(orderId);
        }
      }
    } catch {}
  }, 10000);

  if (!isModal) pixPollInterval = interval;
}

function showPaymentConfirmed(orderId) {
  const display = document.getElementById('pixDisplay');
  if (!display) return;

  display.style.background = 'rgba(34,197,94,.08)';
  display.style.borderColor = 'rgba(34,197,94,.4)';
  display.innerHTML = `
    <div style="text-align:center;padding:1rem;">
      <div style="font-size:3.5rem;margin-bottom:1rem;">✅</div>
      <h3 style="font-family:'Bebas Neue',sans-serif;font-size:2rem;color:var(--green);margin-bottom:.5rem;">PAGAMENTO CONFIRMADO!</h3>
      <p style="color:var(--gray);margin-bottom:1.5rem;">Seu pedido foi confirmado e está sendo preparado.</p>
      <a href="/pedido?id=${orderId}" class="btn btn-gold btn-lg btn-block">📦 Acompanhar Meu Pedido →</a>
    </div>`;

  showToast('Pagamento confirmado! 🎉');
}

function showPaymentConfirmedInModal(orderId) {
  const waiting = document.getElementById('pixModalWaiting');
  const modal = document.getElementById('pixModal');

  if (waiting) {
    waiting.style.background = 'rgba(34,197,94,.1)';
    waiting.style.borderColor = 'rgba(34,197,94,.3)';
    waiting.innerHTML = `<span style="color:var(--green);font-weight:700;">✅ Pagamento confirmado!</span>`;
  }

  dismissBanner(false);
  showToast('Pagamento confirmado! 🎉');

  setTimeout(() => {
    if (modal) modal.innerHTML = `
      <div style="background:var(--card);border:1px solid rgba(34,197,94,.4);border-radius:20px;width:100%;max-width:360px;padding:2rem;text-align:center;">
        <div style="font-size:3.5rem;margin-bottom:1rem;">✅</div>
        <h3 style="font-family:'Bebas Neue',sans-serif;font-size:2rem;color:var(--green);margin-bottom:.75rem;">PAGAMENTO CONFIRMADO!</h3>
        <p style="color:var(--gray);margin-bottom:1.5rem;">Seu pedido foi confirmado.</p>
        <a href="/pedido?id=${orderId}" class="btn btn-gold btn-lg btn-block">📦 Acompanhar Pedido →</a>
      </div>`;
  }, 1500);
}

// ── COPY PIX KEY ──────────────────────────────────────────────────────────────────

function copyPixKey() {
  const key = document.getElementById('pixKeyValue').textContent;
  const btn = document.querySelector('.btn-copy');
  navigator.clipboard.writeText(key).then(() => {
    btn.textContent = 'Copiado!';
    btn.style.background = 'var(--green)';
    setTimeout(() => { btn.textContent = 'Copiar'; btn.style.background = ''; }, 2500);
  }).catch(() => showToast('Selecione e copie o código manualmente.', 'info'));
}
