// ═══════════════════════════════════════════════════════════════
// script.js — Premium SaaS Kasir Client Controller
// ═══════════════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────────────
let products = [];
let transactions = [];
let cart = [];
let currentUser = null;
let currentPaymentMethod = 'Tunai';
let qrisCountdownInterval = null;
let sidebarCollapsed = false;
let activeCategoryFilter = 'Semua';
let revenueChart = null;
let categoryChart = null;
let lofiPlaying = false;
let cartSubtotal = 0, cartTax = 0, cartTotal = 0;
let lastReceiptTx = null;

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    applyStoredTheme();
    startClock();
    loadWeather();
    checkAuth();
    registerKeyboardShortcuts();
});

// ── Loading Screen ─────────────────────────────────────────────
function hideLoadingScreen() {
    const s = document.getElementById('loadingScreen');
    if (s) { s.classList.add('hidden'); setTimeout(() => s.remove(), 600); }
}

// ── Clock ──────────────────────────────────────────────────────
function startClock() {
    const update = () => {
        const el = document.getElementById('dateTimeString');
        if (el) el.textContent = new Date().toLocaleDateString('id-ID', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };
    update();
    setInterval(update, 1000);
}

// ── Theme ──────────────────────────────────────────────────────
function applyStoredTheme() {
    const theme = localStorage.getItem('kasir_theme') || 'dark';
    const color = localStorage.getItem('kasir_color') || 'blue';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-color', color);
    const tt = document.getElementById('themeText');
    if (tt) tt.textContent = theme === 'dark' ? 'Mode Terang' : 'Mode Gelap';
    // update active swatch
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    const activeSwatch = document.querySelector(`.swatch-${color}`);
    if (activeSwatch) activeSwatch.classList.add('active');
}

function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('kasir_theme', next);
    const tt = document.getElementById('themeText');
    if (tt) tt.textContent = next === 'dark' ? 'Mode Terang' : 'Mode Gelap';
}

function setColorTheme(color) {
    document.documentElement.setAttribute('data-color', color);
    localStorage.setItem('kasir_color', color);
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    const s = document.querySelector(`.swatch-${color}`);
    if (s) s.classList.add('active');
    // Redraw charts with new color
    setTimeout(() => { buildCharts(); }, 100);
}

// ── Sidebar Collapse ───────────────────────────────────────────
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    const sidebar = document.getElementById('mainSidebar');
    const wrapper = document.querySelector('.dashboard-wrapper');
    if (sidebar) sidebar.classList.toggle('collapsed', sidebarCollapsed);
    if (wrapper) wrapper.classList.toggle('sidebar-collapsed', sidebarCollapsed);
    localStorage.setItem('kasir_sidebar', sidebarCollapsed ? '1' : '0');
}

// ── Weather (mock/geolocation) ─────────────────────────────────
function loadWeather() {
    // Mock weather – In production you'd call OpenWeatherMap API
    const conditions = [
        { icon: '☀️', temp: 30, desc: 'Cerah' },
        { icon: '⛅', temp: 28, desc: 'Berawan' },
        { icon: '🌧️', temp: 24, desc: 'Hujan Ringan' }
    ];
    const pick = conditions[Math.floor(Math.random() * conditions.length)];
    const icon = document.querySelector('.weather-icon');
    const temp = document.getElementById('weatherTemp');
    const desc = document.getElementById('weatherDesc');
    if (icon) icon.textContent = pick.icon;
    if (temp) temp.textContent = pick.temp + '°C';
    if (desc) desc.textContent = pick.desc;
}

// ── Lo-Fi Player ───────────────────────────────────────────────
function toggleLofi() {
    const audio = document.getElementById('lofiAudio');
    const btn = document.getElementById('lofiBtn');
    if (!audio) return;
    if (lofiPlaying) {
        audio.pause();
        if (btn) btn.textContent = '▶';
        lofiPlaying = false;
    } else {
        audio.play().catch(() => showToast('Browser memblokir autoplay audio.', 'warning'));
        if (btn) btn.textContent = '⏸';
        lofiPlaying = true;
    }
}

// ── Toast Notifications ────────────────────────────────────────
function showToast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// ── Auth ───────────────────────────────────────────────────────
async function checkAuth() {
    const token = localStorage.getItem('cashier_token');
    if (!token) { window.location.href = '/login.html'; return; }

    try {
        const res = await fetch('/api/auth/verify', { headers: { Authorization: 'Bearer ' + token } });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            setupUIForUser();
            await initData();
            hideLoadingScreen();
        } else {
            handleLogout();
        }
    } catch {
        const cached = localStorage.getItem('cashier_user');
        if (cached) {
            currentUser = JSON.parse(cached);
            setupUIForUser();
            await initData();
            hideLoadingScreen();
        } else {
            handleLogout();
        }
    }
}

function setupUIForUser() {
    const u = currentUser;
    document.getElementById('headerUsername').textContent = u.username;
    document.getElementById('headerUserRole').textContent = u.role.charAt(0).toUpperCase() + u.role.slice(1);
    document.getElementById('userAvatar').textContent = u.username.charAt(0).toUpperCase();

    // Restore sidebar state
    if (localStorage.getItem('kasir_sidebar') === '1') toggleSidebar();

    // Role visibility
    const adminOnly = document.querySelectorAll('.admin-only');
    const ownerOnly = document.querySelectorAll('.owner-only');
    adminOnly.forEach(el => el.style.display = ['admin', 'owner'].includes(u.role) ? '' : 'none');
    ownerOnly.forEach(el => el.style.display = u.role === 'owner' ? '' : 'none');
}

function handleLogout() {
    const token = localStorage.getItem('cashier_token');
    if (token) {
        fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
    }
    localStorage.removeItem('cashier_token');
    localStorage.removeItem('cashier_user');
    window.location.href = '/login.html';
}

// ── Data Initialization ────────────────────────────────────────
async function initData() {
    await Promise.all([loadProducts(), loadTransactions()]);
    loadOnlineUsers();
    if (currentUser.role === 'owner') loadLoginHistory();
    recoverCartDraft();
}

// ── Tab Switching ──────────────────────────────────────────────
function switchTab(tabId, navEl) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    navEl.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.add('active');
    const title = navEl.getAttribute('data-title');
    const h = document.getElementById('pageTitle');
    if (h && title) h.textContent = title;

    if (tabId === 'analytics-tab') setTimeout(buildCharts, 120);
    if (tabId === 'users-tab') loadLoginHistory();
}

// ── Products API ───────────────────────────────────────────────
async function loadProducts() {
    const token = localStorage.getItem('cashier_token');
    try {
        const res = await fetch('/api/products', { headers: { Authorization: 'Bearer ' + token } });
        const data = await res.json();
        if (data.success) {
            products = data.products;
            renderPOSCatalog();
            renderProductCRUDTable();
            updateAnalyticsCounters();
        }
    } catch { showToast('Gagal memuat produk.', 'error'); }
}

// ── POS Catalog ────────────────────────────────────────────────
function renderPOSCatalog() {
    const grid = document.getElementById('posProductsGrid');
    if (!grid) return;

    let filtered = [...products];

    // Category filter
    if (activeCategoryFilter !== 'Semua') {
        filtered = filtered.filter(p => p.category === activeCategoryFilter);
    }

    // Search / barcode filter
    const q = (document.getElementById('posSearchInput')?.value || '').toLowerCase().trim();
    if (q) filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q))
    );

    // Sort
    const sort = document.getElementById('posSortSelect')?.value || 'default';
    if (sort === 'price-asc') filtered.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') filtered.sort((a, b) => b.price - a.price);
    else if (sort === 'name-asc') filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'stock-asc') filtered.sort((a, b) => (a.stock || 0) - (b.stock || 0));

    grid.innerHTML = '';
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-secondary);padding:40px;">Tidak ada produk ditemukan.</div>';
        return;
    }

    filtered.forEach(p => {
        const card = document.createElement('div');
        const outOfStock = (p.stock || 0) <= 0;
        card.className = 'product-card' + (outOfStock ? ' out-of-stock' : '');
        if (!outOfStock) card.onclick = () => addToCart(p._id);

        const stock = p.stock ?? 50;
        let stockClass = 'stock-ok', stockLabel = `Stok: ${stock}`;
        if (stock <= 0) { stockClass = 'stock-empty'; stockLabel = 'Habis'; }
        else if (stock <= 5) { stockClass = 'stock-warn'; stockLabel = `⚠ ${stock}`; }

        card.innerHTML = `
            <div class="product-image-container">
                ${p.image
                    ? `<img src="${p.image}" alt="${p.name}" loading="lazy">`
                    : `<div class="product-image-fallback">${p.name.charAt(0).toUpperCase()}</div>`
                }
            </div>
            <div class="product-card-details">
                <div class="product-card-title">${p.name}</div>
                <div class="product-card-price">Rp ${p.price.toLocaleString('id-ID')}</div>
                <div class="product-card-meta">
                    <span class="product-card-stock ${stockClass}">${stockLabel}</span>
                    <span style="font-size:10px;color:var(--text-secondary);">${p.category || ''}</span>
                </div>
            </div>`;
        grid.appendChild(card);
    });
}

function filterCatalog() { renderPOSCatalog(); }

function setCategoryFilter(cat, btn) {
    activeCategoryFilter = cat;
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPOSCatalog();
}

// Barcode Enter handler
function handleBarcodeEnter(e) {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim();
    if (!q) return;
    const p = products.find(p => p.barcode && p.barcode === q);
    if (p) {
        addToCart(p._id);
        e.target.value = '';
        showToast(`${p.name} ditambahkan via barcode!`, 'success', 2000);
    } else {
        showToast('Barcode tidak ditemukan!', 'warning');
    }
}

// ── Cart ───────────────────────────────────────────────────────
function addToCart(productId) {
    const product = products.find(p => p._id === productId);
    if (!product) return;
    if ((product.stock || 0) <= 0) { showToast('Stok produk habis!', 'error'); return; }

    const idx = cart.findIndex(i => i.product._id === productId);
    if (idx > -1) {
        if (cart[idx].quantity >= (product.stock || 50)) { showToast('Melebihi jumlah stok tersedia!', 'warning'); return; }
        cart[idx].quantity++;
    } else {
        cart.push({ product, quantity: 1 });
    }
    renderCart();
    saveCartDraft();
}

function changeCartQty(index, change) {
    if (!cart[index]) return;
    cart[index].quantity += change;
    if (cart[index].quantity <= 0) cart.splice(index, 1);
    renderCart();
    saveCartDraft();
}

function removeFromCart(index) { cart.splice(index, 1); renderCart(); saveCartDraft(); }

function clearCart() { cart = []; renderCart(); saveCartDraft(); }

function saveCartDraft() {
    localStorage.setItem('kasir_cart_draft', JSON.stringify(cart.map(i => ({ id: i.product._id, qty: i.quantity }))));
}

function recoverCartDraft() {
    const draft = localStorage.getItem('kasir_cart_draft');
    if (!draft) return;
    try {
        const saved = JSON.parse(draft);
        saved.forEach(({ id, qty }) => {
            const p = products.find(p => p._id === id);
            if (p) cart.push({ product: p, quantity: qty });
        });
        if (cart.length > 0) { renderCart(); showToast('Keranjang draft dipulihkan!', 'info', 2500); }
    } catch { localStorage.removeItem('kasir_cart_draft'); }
}

function renderCart() {
    const list = document.getElementById('cartItemsList');
    const btn = document.getElementById('btnCheckoutTrigger');
    if (!list) return;

    if (cart.length === 0) {
        list.innerHTML = `<div class="cart-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            <p>Pilih produk di katalog</p></div>`;
        if (btn) btn.disabled = true;
        calcTotals();
        return;
    }

    if (btn) btn.disabled = false;
    list.innerHTML = '';
    cart.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-details">
                <div class="cart-item-name">${item.product.name}</div>
                <div class="cart-item-price">Rp ${item.product.price.toLocaleString('id-ID')} × ${item.quantity} = Rp ${(item.product.price * item.quantity).toLocaleString('id-ID')}</div>
            </div>
            <div class="cart-item-qty-control">
                <button class="btn-qty" onclick="changeCartQty(${i},-1)">−</button>
                <span class="cart-item-qty">${item.quantity}</span>
                <button class="btn-qty" onclick="changeCartQty(${i},1)">+</button>
            </div>
            <button class="btn-remove-item" onclick="removeFromCart(${i})" title="Hapus">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>`;
        list.appendChild(div);
    });
    calcTotals();
}

function calcTotals() {
    cartSubtotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
    cartTax = Math.round(cartSubtotal * 0.1);
    cartTotal = cartSubtotal + cartTax;
    const fmt = n => 'Rp ' + n.toLocaleString('id-ID');
    const s = document.getElementById('cartSubtotal'), t = document.getElementById('cartTax'), tt = document.getElementById('cartTotal');
    if (s) s.textContent = fmt(cartSubtotal);
    if (t) t.textContent = fmt(cartTax);
    if (tt) tt.textContent = fmt(cartTotal);
}

// ── Checkout ───────────────────────────────────────────────────
function openCheckoutModal() {
    if (!cart.length) return;
    const el = document.getElementById('checkoutTotalText');
    if (el) el.textContent = 'Rp ' + cartTotal.toLocaleString('id-ID');
    const ca = document.getElementById('cashAmountInput');
    if (ca) ca.value = '';
    const ct = document.getElementById('cashChangeText');
    if (ct) { ct.textContent = 'Rp 0'; ct.className = 'change-value negative'; }
    selectPaymentMethod('Tunai');
    openModal('checkoutModal');
}

function selectPaymentMethod(method) {
    currentPaymentMethod = method;
    document.getElementById('methodTunai')?.classList.toggle('active', method === 'Tunai');
    document.getElementById('methodQRIS')?.classList.toggle('active', method === 'QRIS');
    document.getElementById('paymentAreaTunai').style.display = method === 'Tunai' ? 'block' : 'none';
    document.getElementById('paymentAreaQRIS').style.display = method === 'QRIS' ? 'block' : 'none';
    const btn = document.getElementById('btnSubmitCheckout');
    if (method === 'Tunai') { clearInterval(qrisCountdownInterval); calculateChange(); }
    else { if (btn) btn.disabled = true; startQRIS(); }
}

function calculateChange() {
    const val = parseFloat(document.getElementById('cashAmountInput')?.value || 0);
    const change = val - cartTotal;
    const ct = document.getElementById('cashChangeText');
    const btn = document.getElementById('btnSubmitCheckout');
    if (ct) { ct.textContent = 'Rp ' + change.toLocaleString('id-ID'); ct.className = 'change-value ' + (change >= 0 ? 'positive' : 'negative'); }
    if (btn) btn.disabled = change < 0;
}

function startQRIS() {
    clearInterval(qrisCountdownInterval);
    const img = document.getElementById('qrisQrCode');
    const cd = document.getElementById('qrisCountdown');
    const data = `kasirku-${cartTotal}-${Date.now()}`;
    if (img) img.src = `https://api.qrserver.com/v1/create-qr-code/?size=190x190&bgcolor=ffffff&data=${encodeURIComponent(data)}`;

    let secs = 300;
    const tick = () => {
        const m = Math.floor(secs / 60), s = secs % 60;
        if (cd) cd.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        if (secs-- <= 0) { clearInterval(qrisCountdownInterval); closeModal('checkoutModal'); showToast('QRIS kedaluwarsa!', 'error'); }
    };
    tick();
    qrisCountdownInterval = setInterval(tick, 1000);

    // Auto-confirm after 4 sec simulation
    setTimeout(() => {
        if (currentPaymentMethod === 'QRIS' && document.getElementById('checkoutModal')?.classList.contains('show')) {
            clearInterval(qrisCountdownInterval);
            showToast('Pembayaran QRIS berhasil diverifikasi!', 'success');
            processCheckout();
        }
    }, 4500);
}

async function processCheckout() {
    const token = localStorage.getItem('cashier_token');
    const cashPaid = currentPaymentMethod === 'Tunai' ? Number(document.getElementById('cashAmountInput')?.value || 0) : cartTotal;
    const changeReturned = currentPaymentMethod === 'Tunai' ? Math.max(0, cashPaid - cartTotal) : 0;

    const payload = {
        items: cart.map(i => ({ name: i.product.name, price: i.product.price, quantity: i.quantity })),
        total: cartTotal,
        paymentMethod: currentPaymentMethod,
        cashPaid,
        changeReturned
    };

    try {
        const res = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeModal('checkoutModal');
            lastReceiptTx = data.transaction;
            openReceiptModal(data.transaction, cashPaid, changeReturned);
            showToast('Transaksi berhasil disimpan!', 'success');
            localStorage.removeItem('kasir_cart_draft');
            clearCart();
            await loadProducts(); // refresh stock
            await loadTransactions();
        } else {
            showToast(data.message || 'Transaksi gagal!', 'error');
        }
    } catch { showToast('Koneksi error. Transaksi gagal!', 'error'); }
}

// ── Receipt ────────────────────────────────────────────────────
function openReceiptModal(tx, cashPaid = 0, changeReturned = 0) {
    document.getElementById('receiptDate').textContent = new Date(tx.date).toLocaleString('id-ID');
    document.getElementById('receiptTxId').textContent = '#' + (tx._id || '').slice(-8).toUpperCase();
    document.getElementById('receiptCashier').textContent = tx.cashier;
    document.getElementById('receiptPayMethod').textContent = tx.paymentMethod;
    document.getElementById('receiptStatus').textContent = tx.status || 'Lunas';

    const items = document.getElementById('receiptItems');
    items.innerHTML = '';
    tx.items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'receipt-item-row';
        row.innerHTML = `<div class="top-line"><span>${item.name}</span><span>Rp ${(item.price * item.quantity).toLocaleString('id-ID')}</span></div>
            <div class="sub-line">${item.quantity} × Rp ${item.price.toLocaleString('id-ID')}</div>`;
        items.appendChild(row);
    });

    const sub = tx.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const tax = Math.round(sub * 0.1);
    document.getElementById('receiptSubtotal').textContent = 'Rp ' + sub.toLocaleString('id-ID');
    document.getElementById('receiptTax').textContent = 'Rp ' + tax.toLocaleString('id-ID');
    document.getElementById('receiptGrandTotal').textContent = 'Rp ' + tx.total.toLocaleString('id-ID');

    const cashRow = document.getElementById('receiptCashPaidRow');
    const chgRow = document.getElementById('receiptChangeReturnedRow');
    if (tx.paymentMethod === 'Tunai') {
        cashRow.style.display = 'flex'; chgRow.style.display = 'flex';
        document.getElementById('receiptCashPaid').textContent = 'Rp ' + (cashPaid || tx.cashPaid || 0).toLocaleString('id-ID');
        document.getElementById('receiptChangeReturned').textContent = 'Rp ' + (changeReturned || tx.changeReturned || 0).toLocaleString('id-ID');
    } else {
        cashRow.style.display = 'none'; chgRow.style.display = 'none';
    }
    openModal('receiptModal');
}

function printReceipt() { window.print(); }

function downloadReceiptPDF() {
    const el = document.getElementById('receiptPrintArea');
    const id = document.getElementById('receiptTxId')?.textContent || 'struk';
    html2pdf().set({
        margin: [8, 8, 8, 8],
        filename: `struk-${id}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a6', orientation: 'portrait' }
    }).from(el).save();
}

// ── Transactions ───────────────────────────────────────────────
async function loadTransactions() {
    const token = localStorage.getItem('cashier_token');
    try {
        const res = await fetch('/api/transactions', { headers: { Authorization: 'Bearer ' + token } });
        const data = await res.json();
        if (data.success) { transactions = data.transactions; renderHistoryTable(); updateAnalyticsCounters(); }
    } catch { showToast('Gagal memuat transaksi.', 'error'); }
}

function renderHistoryTable(list = null) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    const txs = list || getFilteredTransactions();
    tbody.innerHTML = '';
    if (!txs.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:30px;">Belum ada transaksi.</td></tr>';
        return;
    }
    txs.forEach(tx => {
        const tr = document.createElement('tr');
        const shortId = '#' + (tx._id || '').slice(-8).toUpperCase();
        const statusClass = { Lunas: 'status-lunas', Pending: 'status-pending', Dibatalkan: 'status-dibatalkan' }[tx.status] || 'status-lunas';
        tr.innerHTML = `
            <td><strong>${shortId}</strong></td>
            <td>${new Date(tx.date).toLocaleDateString('id-ID')} <span style="font-size:11px;color:var(--text-secondary);">${new Date(tx.date).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</span></td>
            <td>${tx.cashier}</td>
            <td><span class="status-badge ${tx.paymentMethod === 'QRIS' ? 'status-pending' : 'status-lunas'}">${tx.paymentMethod}</span></td>
            <td><span class="status-badge ${statusClass}">${tx.status || 'Lunas'}</span></td>
            <td><strong>Rp ${tx.total.toLocaleString('id-ID')}</strong></td>
            <td><button class="btn-primary btn-sm" onclick="viewTxReceipt('${tx._id}')">Struk</button></td>`;
        tbody.appendChild(tr);
    });
}

function getFilteredTransactions() {
    const q = (document.getElementById('historySearchInput')?.value || '').toLowerCase();
    const period = document.getElementById('historyFilterPeriod')?.value || 'all';
    const now = new Date();
    return transactions.filter(tx => {
        const matchQ = !q || tx.cashier.toLowerCase().includes(q) || tx._id.toLowerCase().includes(q);
        const d = new Date(tx.date);
        let matchP = true;
        if (period === 'today') matchP = d.toDateString() === now.toDateString();
        else if (period === 'week') {
            const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
            matchP = d >= weekAgo;
        } else if (period === 'month') {
            matchP = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        return matchQ && matchP;
    });
}

function filterHistory() { renderHistoryTable(); }

function viewTxReceipt(id) {
    const tx = transactions.find(t => t._id === id);
    if (tx) openReceiptModal(tx, tx.cashPaid, tx.changeReturned);
}

// ── CSV Export ─────────────────────────────────────────────────
function exportCSV() {
    const txs = getFilteredTransactions();
    if (!txs.length) { showToast('Tidak ada data untuk diekspor.', 'warning'); return; }
    const rows = [['Invoice','Tanggal','Kasir','Metode','Status','Total (Rp)']];
    txs.forEach(tx => {
        rows.push([
            '#' + tx._id.slice(-8).toUpperCase(),
            new Date(tx.date).toLocaleString('id-ID'),
            tx.cashier, tx.paymentMethod, tx.status || 'Lunas', tx.total
        ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `transaksi-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast('File CSV berhasil diunduh!', 'success');
}

// ── Database Backup ────────────────────────────────────────────
function downloadBackup() {
    const token = localStorage.getItem('cashier_token');
    const a = document.createElement('a');
    a.href = '/api/database/backup';
    a.download = '';
    // Need to set auth header — use fetch blob approach
    fetch('/api/database/backup', { headers: { Authorization: 'Bearer ' + token } })
        .then(r => r.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `kasir_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click(); URL.revokeObjectURL(url);
            showToast('Backup database berhasil diunduh!', 'success');
        })
        .catch(() => showToast('Gagal mengunduh backup.', 'error'));
}

// ── Analytics ──────────────────────────────────────────────────
function updateAnalyticsCounters() {
    const now = new Date();
    const today = (tx) => new Date(tx.date).toDateString() === now.toDateString();
    const thisWeek = (tx) => { const d = new Date(now); d.setDate(d.getDate() - 7); return new Date(tx.date) >= d; };
    const thisMonth = (tx) => { const d = new Date(tx.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); };

    const rev = (filter) => transactions.filter(filter).reduce((s, t) => s + t.total, 0);
    const fmt = n => 'Rp ' + n.toLocaleString('id-ID');

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('statToday', fmt(rev(today)));
    set('statWeek', fmt(rev(thisWeek)));
    set('statMonth', fmt(rev(thisMonth)));
    set('statTxToday', transactions.filter(today).length + ' Transaksi');
    set('statTxSuccess', transactions.filter(t => (t.status || 'Lunas') === 'Lunas').length + ' Lunas');

    const totalSold = transactions.reduce((s, t) => s + t.items.reduce((ss, i) => ss + i.quantity, 0), 0);
    set('statProductsSold', totalSold + ' Item');

    renderTopProducts();
    renderLowStock();
    renderActivityLog();
    renderOnlineUsers();
}

function renderTopProducts() {
    const el = document.getElementById('topProductsList');
    if (!el) return;
    const counts = {};
    transactions.forEach(tx => tx.items.forEach(i => { counts[i.name] = (counts[i.name] || 0) + i.quantity; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!top.length) { el.innerHTML = '<p style="color:var(--text-secondary);text-align:center;">Belum ada data.</p>'; return; }
    const rankClasses = ['gold', 'silver', 'bronze', '', ''];
    el.innerHTML = top.map(([name, qty], i) => `
        <div class="top-product-row">
            <div class="top-rank ${rankClasses[i]}">${i + 1}</div>
            <div class="top-product-name">${name}</div>
            <div class="top-product-qty">${qty} terjual</div>
        </div>`).join('');
}

function renderLowStock() {
    const el = document.getElementById('lowStockList');
    if (!el) return;
    const low = products.filter(p => (p.stock ?? 50) <= 5).sort((a, b) => (a.stock || 0) - (b.stock || 0));
    if (!low.length) { el.innerHTML = '<p style="color:var(--success);text-align:center;">✅ Semua stok aman!</p>'; return; }
    el.innerHTML = low.map(p => `
        <div class="low-stock-row">
            <span class="low-stock-name">${p.name}</span>
            <span class="low-stock-count">${p.stock ?? 0} tersisa</span>
        </div>`).join('');
}

function renderActivityLog() {
    const el = document.getElementById('activityLogs');
    if (!el) return;
    const recent = transactions.slice(0, 6);
    if (!recent.length) { el.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">Belum ada aktivitas.</p>'; return; }
    el.innerHTML = recent.map(tx => {
        const time = new Date(tx.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const date = new Date(tx.date).toLocaleDateString('id-ID');
        return `<div class="log-entry">
            <div class="log-entry-left">
                <span class="log-badge success">Sale</span>
                <div>Transaksi <strong>#${tx._id.slice(-6).toUpperCase()}</strong> oleh <strong>${tx.cashier}</strong> — ${tx.paymentMethod}</div>
            </div>
            <div style="text-align:right;font-size:12px;">
                <div><strong>Rp ${tx.total.toLocaleString('id-ID')}</strong></div>
                <div style="color:var(--text-secondary);">${date} ${time}</div>
            </div>
        </div>`;
    }).join('');
}

function renderOnlineUsers() {
    const el = document.getElementById('sysOnlineCount');
    fetch('/api/auth/online-users', { headers: { Authorization: 'Bearer ' + localStorage.getItem('cashier_token') } })
        .then(r => r.json()).then(d => {
            const n = d.onlineCount || 0;
            const badge = document.getElementById('onlineCount');
            if (badge) badge.textContent = n;
            if (el) el.textContent = `${n} pengguna online`;
        }).catch(() => {});
}

function loadOnlineUsers() { renderOnlineUsers(); }

// ── Charts ─────────────────────────────────────────────────────
function buildCharts() {
    buildRevenueChart();
    buildCategoryChart();
}

function getAccentColor() {
    const color = localStorage.getItem('kasir_color') || 'blue';
    return { blue: '#4f46e5', purple: '#7c3aed', green: '#059669' }[color] || '#4f46e5';
}

function buildRevenueChart() {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;
    if (revenueChart) revenueChart.destroy();

    const labels = [], data = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }));
        const dayRev = transactions.filter(tx => new Date(tx.date).toDateString() === d.toDateString()).reduce((s, t) => s + t.total, 0);
        data.push(dayRev);
    }

    const accent = getAccentColor();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = isDark ? '#9ca3af' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    revenueChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Pendapatan (Rp)',
                data,
                borderColor: accent,
                backgroundColor: accent + '20',
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: accent,
                pointRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, font: { size: 11 }, callback: v => 'Rp ' + (v / 1000).toFixed(0) + 'k' }, grid: { color: gridColor } }
            }
        }
    });
}

function buildCategoryChart() {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;
    if (categoryChart) categoryChart.destroy();

    const cats = { Makanan: 0, Minuman: 0, Snack: 0, Semua: 0 };
    transactions.forEach(tx => tx.items.forEach(item => {
        const p = products.find(p => p.name === item.name);
        const cat = p?.category || 'Semua';
        cats[cat] = (cats[cat] || 0) + item.quantity;
    }));
    const labels = Object.keys(cats).filter(k => cats[k] > 0);
    const data = labels.map(k => cats[k]);
    const accent = getAccentColor();

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = isDark ? '#9ca3af' : '#64748b';

    categoryChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: [accent, '#3b82f6', '#10b981', '#f59e0b'],
                borderWidth: 2,
                borderColor: isDark ? '#0f172a' : '#f8fafc'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 } } } }
        }
    });
}

// ── Login History ──────────────────────────────────────────────
async function loadLoginHistory() {
    const token = localStorage.getItem('cashier_token');
    const tbody = document.getElementById('loginHistoryBody');
    if (!tbody) return;
    try {
        const res = await fetch('/api/auth/login-history', { headers: { Authorization: 'Bearer ' + token } });
        const data = await res.json();
        if (data.success) {
            tbody.innerHTML = data.history.map(h => `
                <tr>
                    <td><strong>${h.username}</strong></td>
                    <td><span class="status-badge status-lunas">${h.role}</span></td>
                    <td>${new Date(h.time).toLocaleString('id-ID')}</td>
                    <td style="color:var(--text-secondary);font-size:12px;">${h.ip}</td>
                </tr>`).join('');
        }
    } catch { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);">Tidak dapat memuat riwayat.</td></tr>'; }
}

// ── Product CRUD ───────────────────────────────────────────────
function renderProductCRUDTable() {
    const tbody = document.getElementById('crudTableBody');
    if (!tbody) return;
    const q = (document.getElementById('crudSearchInput')?.value || '').toLowerCase();
    const filtered = q ? products.filter(p => p.name.toLowerCase().includes(q)) : products;
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px;">Belum ada produk.</td></tr>'; return;
    }
    tbody.innerHTML = filtered.map(p => {
        const stock = p.stock ?? 50;
        const stockClass = stock <= 0 ? 'stock-empty' : stock <= 5 ? 'stock-warn' : 'stock-ok';
        return `<tr>
            <td>${p.image ? `<img src="${p.image}" style="width:42px;height:42px;object-fit:cover;border-radius:8px;">` : `<div style="width:42px;height:42px;border-radius:8px;background:linear-gradient(135deg,#1e293b,#0f172a);display:flex;align-items:center;justify-content:center;font-weight:700;color:rgba(255,255,255,.2);">${p.name.charAt(0)}</div>`}</td>
            <td><strong>${p.name}</strong></td>
            <td><span class="status-badge" style="background:rgba(99,102,241,.12);color:#818cf8;">${p.category || 'Semua'}</span></td>
            <td>Rp ${p.price.toLocaleString('id-ID')}</td>
            <td><span class="product-card-stock ${stockClass}">${stock}</span></td>
            <td><div class="btn-action-group">
                <button class="btn-secondary btn-sm" onclick="editProduct('${p._id}')">Edit</button>
                <button class="btn-danger btn-sm" onclick="deleteProduct('${p._id}')">Hapus</button>
            </div></td>
        </tr>`;
    }).join('');
}

function previewSelectedImage(input) {
    const preview = document.getElementById('uploadPreview');
    const placeholder = document.getElementById('uploadPlaceholder');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; if (placeholder) placeholder.style.display = 'none'; };
        reader.readAsDataURL(input.files[0]);
    }
}

function resetProductForm() {
    document.getElementById('productForm')?.reset();
    document.getElementById('crudProductId').value = '';
    document.getElementById('formTitle').textContent = 'Tambah Produk Baru';
    document.getElementById('btnSubmitProduct').textContent = 'Simpan Produk';
    const preview = document.getElementById('uploadPreview');
    const placeholder = document.getElementById('uploadPlaceholder');
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (placeholder) placeholder.style.display = 'flex';
}

async function handleProductSubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('cashier_token');
    const id = document.getElementById('crudProductId').value;
    const formData = new FormData();
    formData.append('name', document.getElementById('crudProductName').value.trim());
    formData.append('price', document.getElementById('crudProductPrice').value);
    formData.append('stock', document.getElementById('crudProductStock').value);
    formData.append('category', document.getElementById('crudProductCategory').value);
    formData.append('barcode', document.getElementById('crudProductBarcode').value.trim());
    const imgInput = document.getElementById('crudProductImage');
    if (imgInput.files[0]) formData.append('image', imgInput.files[0]);

    const url = id ? `/api/products/${id}` : '/api/products';
    const method = id ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token }, body: formData });
        const data = await res.json();
        if (data.success) { showToast(data.message, 'success'); resetProductForm(); await loadProducts(); }
        else showToast(data.message || 'Gagal menyimpan produk.', 'error');
    } catch { showToast('Koneksi error!', 'error'); }
}

function editProduct(id) {
    const p = products.find(p => p._id === id);
    if (!p) return;
    document.getElementById('crudProductId').value = p._id;
    document.getElementById('crudProductName').value = p.name;
    document.getElementById('crudProductPrice').value = p.price;
    document.getElementById('crudProductStock').value = p.stock ?? 50;
    document.getElementById('crudProductCategory').value = p.category || 'Semua';
    document.getElementById('crudProductBarcode').value = p.barcode || '';
    document.getElementById('formTitle').textContent = 'Edit Produk';
    document.getElementById('btnSubmitProduct').textContent = 'Perbarui Produk';
    if (p.image) {
        const preview = document.getElementById('uploadPreview');
        const placeholder = document.getElementById('uploadPlaceholder');
        if (preview) { preview.src = p.image; preview.style.display = 'block'; }
        if (placeholder) placeholder.style.display = 'none';
    }
    // Scroll to form
    document.getElementById('product-tab')?.scrollIntoView({ behavior: 'smooth' });
}

async function deleteProduct(id) {
    if (!confirm('Hapus produk ini? Tindakan ini tidak dapat dibatalkan.')) return;
    const token = localStorage.getItem('cashier_token');
    try {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
        const data = await res.json();
        if (data.success) { showToast('Produk berhasil dihapus!', 'success'); await loadProducts(); }
        else showToast(data.message || 'Gagal menghapus.', 'error');
    } catch { showToast('Koneksi error!', 'error'); }
}

// ── Change Password ────────────────────────────────────────────
async function handleChangePassword(e) {
    e.preventDefault();
    const oldPwd = document.getElementById('oldPassword').value;
    const newPwd = document.getElementById('newPassword').value;
    const confirmPwd = document.getElementById('confirmPassword').value;
    if (newPwd !== confirmPwd) { showToast('Password baru tidak cocok!', 'error'); return; }
    if (newPwd.length < 3) { showToast('Password minimal 3 karakter!', 'warning'); return; }
    const token = localStorage.getItem('cashier_token');
    try {
        const res = await fetch('/api/auth/change-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
        });
        const data = await res.json();
        if (data.success) { showToast('Password berhasil diubah!', 'success'); closeModal('changePasswordModal'); e.target.reset(); }
        else showToast(data.message, 'error');
    } catch { showToast('Koneksi error!', 'error'); }
}

// ── Modal Helpers ──────────────────────────────────────────────
function openModal(id) { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) {
    document.getElementById(id)?.classList.remove('show');
    if (id === 'checkoutModal') clearInterval(qrisCountdownInterval);
}

// ── Keyboard Shortcuts ─────────────────────────────────────────
function registerKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in input
        if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
            if (e.key === 'Escape') { e.target.blur(); return; }
            return;
        }
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
            return;
        }
        if (e.key === 'F9') { e.preventDefault(); toggleSidebar(); return; }
        if (e.key === 'F10') { e.preventDefault(); toggleTheme(); return; }
        if (e.ctrlKey && e.key === 's') { e.preventDefault(); openCheckoutModal(); return; }
        if (e.ctrlKey && e.key === 'p') { e.preventDefault(); if (lastReceiptTx) printReceipt(); return; }
        if (e.altKey && e.key === '1') { e.preventDefault(); selectPaymentMethod('Tunai'); return; }
        if (e.altKey && e.key === '2') { e.preventDefault(); selectPaymentMethod('QRIS'); return; }
    });
}