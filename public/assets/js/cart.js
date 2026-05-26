// Cart utility — shared across menu.html and checkout.html
const CART_KEY = 'pdm_cart';

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function addItem(item) {
  const cart = getCart();
  item.cartId = Date.now() + Math.random().toString(36).slice(2, 7);
  cart.push(item);
  saveCart(cart);
  return cart;
}

function removeItem(cartId) {
  const cart = getCart().filter(i => i.cartId !== cartId);
  saveCart(cart);
  return cart;
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
}

function getTotal() {
  return getCart().reduce((sum, i) => sum + (i.subtotal || 0), 0);
}

function getCount() {
  return getCart().length;
}

function formatBRL(value) {
  return 'R$ ' + parseFloat(value || 0).toFixed(2).replace('.', ',');
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
  toast.innerHTML = `<i data-lucide="${iconName}" style="width:15px;height:15px;flex-shrink:0;"></i><span>${msg}</span>`;
  container.appendChild(toast);

  if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [toast] });
  setTimeout(() => toast.remove(), 3500);
}
