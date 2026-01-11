// --- CONFIG ---
const API_BASE = '';
const URLS = {
    products: '/products',
    transactions: '/calculate-total',
    recommendation: '/recommendation/restock',
    auth: '/api/auth',
    dashboard: '/api/dashboard/summary',
    restock: '/products/restock',
    health: '/health'
};

// --- STATE ---
let state = {
    authToken: localStorage.getItem('authToken'),
    authUser: JSON.parse(localStorage.getItem('authUser') || 'null'),
    products: [],
    cart: []
};

// --- DOM ELEMENTS ---
const el = (id) => document.getElementById(id);

// --- AUTH LOGIC (WALL) ---
function initAuth() {
    if (state.authToken && state.authUser) {
        // Logged In
        el('auth-section').style.display = 'none';
        el('app-section').style.display = 'flex';
        el('user-display').textContent = `Hi, ${state.authUser.username}`;

        if (state.authUser.role === 'admin') {
            el('admin-actions').classList.remove('hidden');
        } else {
            el('admin-actions').classList.add('hidden');
        }

        fetchProducts(); // Load data
    } else {
        // Logged Out
        el('auth-section').style.display = 'flex';
        el('app-section').style.display = 'none';
        navigate('products'); // Reset nav
    }
}

function toggleAuthMode(mode) {
    if (mode === 'register') {
        el('form-login').classList.add('hidden');
        el('form-register').classList.remove('hidden');
        el('auth-toggle-text').innerHTML = `Sudah punya akun? <button onclick="toggleAuthMode('login')" class="text-indigo-600 font-semibold hover:underline">Masuk disini</button>`;
    } else {
        el('form-register').classList.add('hidden');
        el('form-login').classList.remove('hidden');
        el('auth-toggle-text').innerHTML = `Belum punya akun? <button onclick="toggleAuthMode('register')" class="text-indigo-600 font-semibold hover:underline">Daftar sekarang</button>`;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = 'Memuat...';

    const formData = new FormData(e.target);
    try {
        const res = await fetch(`${URLS.auth}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(formData))
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Login gagal.');

        // Success
        state.authToken = data.token;
        state.authUser = data.user;
        localStorage.setItem('authToken', state.authToken);
        localStorage.setItem('authUser', JSON.stringify(state.authUser));

        showToast(`Selamat datang, ${data.user.username}`);
        initAuth();

    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = orig;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData);

    if (payload.password !== payload.confirm_password) {
        return showToast('Password konfirmasi tidak cocok', 'error');
    }

    const btn = e.target.querySelector('button');
    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = 'Mendaftar...';

    try {
        const res = await fetch(`${URLS.auth}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: payload.username, password: payload.password, role: 'cashier' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Registrasi gagal.');

        showToast('Akun berhasil dibuat. Silakan login.');
        toggleAuthMode('login');

    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = orig;
    }
}

function handleLogout() {
    localStorage.clear();
    state.authToken = null;
    state.authUser = null;
    showToast('Berhasil keluar.');
    initAuth();
}

// --- NAVIGATION ---
function navigate(page) {
    // Hide all
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => {
        el.classList.remove('text-indigo-600', 'bg-indigo-50');
        el.classList.add('text-slate-500');
    });

    // Show target
    el(`page-${page}`).classList.remove('hidden');

    // Highlight nav
    const activeBtn = document.querySelector(`.nav-btn[data-target="${page}"]`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-500');
        activeBtn.classList.add('text-indigo-600', 'bg-indigo-50');
    }

    if (page === 'dashboard') loadDashboard();
}

// --- FEATURES ---

// 1. Products
async function fetchProducts() {
    try {
        const res = await fetch(URLS.products);
        if (!res.ok) throw new Error('Gagal muat produk');
        state.products = await res.json();
        renderProducts();
        updateDatalist();
        renderLowStock();
    } catch (err) {
        console.error(err);
        showToast('Gagal memuat data produk', 'error');
    }
}

function renderProducts() {
    const grid = el('product-grid');
    if (!state.products.length) {
        grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10">Belum ada data produk.</div>';
        return;
    }

    const isAdmin = state.authUser?.role === 'admin';

    grid.innerHTML = state.products.map(p => `
        <div class="card p-4 hover:border-indigo-200 group">
             <div class="flex justify-between items-start mb-2">
                <span class="text-xs font-mono text-slate-400 bg-slate-100 px-2 rounded">${p.sku}</span>
                ${isAdmin ? `
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="openEditModal('${p.sku}')" class="p-1 hover:bg-yellow-50 text-yellow-600 rounded">✎</button>
                    <button onclick="deleteProduct('${p.sku}')" class="p-1 hover:bg-red-50 text-red-600 rounded">🗑</button>
                </div>
                ` : ''}
             </div>
             <h3 class="font-bold text-slate-800 mb-1 line-clamp-1">${p.name}</h3>
             <div class="flex justify-between items-end mt-4">
                <div>
                    <p class="text-xs text-slate-500">Stok</p>
                    <p class="font-semibold ${p.stock < 10 ? 'text-red-500' : 'text-slate-700'}">${p.stock}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-slate-500">Harga</p>
                    <p class="font-bold text-indigo-600 text-lg">${formatCurrency(p.price)}</p>
                </div>
             </div>
        </div>
    `).join('');
}

async function handleAddProduct(e) {
    e.preventDefault();
    const headers = { 'Content-Type': 'application/json' };
    if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;

    const formData = new FormData(e.target);
    const payload = {
        name: formData.get('name'),
        price: Number(formData.get('price')),
        stock: Number(formData.get('stock'))
    };

    try {
        const res = await fetch(URLS.products, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('Gagal tambah produk');

        e.target.reset();
        showToast('Produk ditambahkan');
        fetchProducts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// 2. Edit Functionality (Restored)
function openEditModal(sku) {
    const p = state.products.find(x => x.sku === sku);
    if (!p) return;

    el('edit-sku').value = p.sku;
    el('edit-name').value = p.name;
    el('edit-price').value = p.price;
    el('edit-stock').value = p.stock;

    el('edit-modal').classList.add('active');
}

function closeEditModal() {
    el('edit-modal').classList.remove('active');
}

async function handleEditProduct(e) {
    e.preventDefault();
    const sku = el('edit-sku').value;
    const body = {
        name: el('edit-name').value,
        price: Number(el('edit-price').value),
        stock: Number(el('edit-stock').value),
    };

    const headers = { 'Content-Type': 'application/json' };
    if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;

    try {
        const res = await fetch(`${URLS.products}/${sku}`, { method: 'PUT', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('Gagal update produk');

        showToast('Produk berhasil diperbarui');
        closeEditModal();
        fetchProducts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteProduct(sku) {
    if (!confirm('Hapus produk ini?')) return;
    const headers = { 'Content-Type': 'application/json' };
    if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;

    try {
        const res = await fetch(`${URLS.products}/${sku}`, { method: 'DELETE', headers });
        if (!res.ok) throw new Error('Gagal hapus');
        showToast('Produk dihapus');
        fetchProducts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// 3. Cart & Transaction
function addToCart(val) {
    // Val could be SKU or just text, try to match SKU
    const p = state.products.find(x => x.sku === val || x.name === val);
    if (!p) return showToast('Produk tidak ditemukan', 'error');

    const item = state.cart.find(x => x.sku === p.sku);
    if (item) item.quantity++;
    else state.cart.push({ sku: p.sku, quantity: 1 });

    renderCart();
    showToast('Masuk keranjang');
}

function renderCart() {
    const list = el('cart-list');
    let total = 0;

    list.innerHTML = state.cart.map(i => {
        const p = state.products.find(x => x.sku === i.sku);
        if (!p) return '';
        total += p.price * i.quantity;
        return `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <div>
                     <p class="font-medium text-sm text-slate-800">${p.name}</p>
                     <p class="text-xs text-slate-500">${formatCurrency(p.price)} x ${i.quantity}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-sm text-slate-700">${formatCurrency(p.price * i.quantity)}</span>
                    <button onclick="removeFromCart('${i.sku}')" class="text-red-400 hover:text-red-600">✕</button>
                </div>
            </div>
        `;
    }).join('');

    if (!state.cart.length) list.innerHTML = '<p class="text-center text-sm text-slate-400 py-4">Keranjang kosong</p>';
    el('cart-total').textContent = formatCurrency(total);
}

function removeFromCart(sku) {
    state.cart = state.cart.filter(x => x.sku !== sku);
    renderCart();
}

async function processTransaction() {
    if (!state.cart.length) return showToast('Keranjang kosong', 'error');

    try {
        const res = await fetch(URLS.transactions, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: state.cart })
        });
        if (!res.ok) throw new Error('Transaksi gagal');

        state.cart = [];
        renderCart();
        fetchProducts();
        alert('Transaksi Berhasil! Struk akan dicetak.. (Simulasi)');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// 4. Dashboard
async function loadDashboard() {
    try {
        const res = await fetch(URLS.dashboard);
        const data = await res.json();

        el('dash-revenue').textContent = formatCurrency(data.totalRevenue);
        el('dash-transactions').textContent = data.totalTransactions;
        // Bestsellers render...
        el('dash-bestsellers').innerHTML = (data.bestSellers || []).map(b => `
             <div class="border p-3 rounded text-center">
                <span class="block font-bold text-indigo-600 text-lg">#${b.sku}</span>
                <span class="text-xs text-slate-500">${b.quantitySold} Terjual</span>
             </div>
        `).join('');

        if (data.weeklyChart) {
            renderRevenueChart(data.weeklyChart.labels, data.weeklyChart.data);
        } else {
            renderRevenueChart(); // fallback dummy
        }

    } catch (err) {/* ignore */ }
}

let revenueChartInstance = null;

function renderRevenueChart(labels, dataPoints) {
    const ctx = document.getElementById('revenueChart').getContext('2d');

    // Destroy existing chart to avoid duplicates/memory leaks
    if (revenueChartInstance) {
        revenueChartInstance.destroy();
    }

    // Default Dummy Data (if not provided)
    if (!labels || !dataPoints) {
        labels = ['Sen', 'Sel', 'Rab', 'Kam', 'jum', 'Sab', 'Min'];
        dataPoints = [0, 0, 0, 0, 0, 0, 0];
    }

    revenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pendapatan (Rp)',
                data: dataPoints,
                borderColor: '#4f46e5', // indigo-600
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                borderWidth: 2,
                tension: 0.4, // smooth curves
                fill: true,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#4f46e5',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ' ' + formatCurrency(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#f1f5f9'
                    },
                    ticks: {
                        callback: function (value) {
                            return (value / 1000) + 'k';
                        },
                        font: {
                            size: 10
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

function renderLowStock() {
    const low = state.products.filter(p => p.stock < 10);
    el('low-stock-list').innerHTML = low.map(p =>
        `<div class="flex justify-between text-xs text-slate-600 border-b border-red-100 pb-1"><span>${p.name}</span><span class="font-bold text-red-500">${p.stock} unit</span></div>`
    ).join('');
}

async function autoRestock() {
    await fetch(URLS.restock, { method: 'POST' });
    showToast('Auto restock triggered');
    fetchProducts();
}


// --- UTILS ---
const formatCurrency = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
function showToast(msg, type = 'success') {
    const box = document.createElement('div');
    const color = type === 'error' ? 'bg-red-500 text-white' : 'bg-slate-800 text-white';
    box.className = `${color} px-4 py-2 rounded shadow-lg text-sm font-medium animate-fade-in`;
    box.textContent = msg;
    el('toast-container').appendChild(box);
    setTimeout(() => box.remove(), 3000);
}
function updateDatalist() {
    el('sku-list').innerHTML = state.products.map(p => `<option value="${p.sku}">${p.name}</option>`).join('');
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initAuth();

    // Listeners
    el('form-login').addEventListener('submit', handleLogin);
    el('form-register').addEventListener('submit', handleRegister);
    el('form-add-product').addEventListener('submit', handleAddProduct);
    el('form-edit-product').addEventListener('submit', handleEditProduct);

    // Globals
    window.toggleAuthMode = toggleAuthMode;
    window.handleLogout = handleLogout;
    window.navigate = navigate;
    window.fetchProducts = fetchProducts;
    window.addToCart = addToCart;
    window.removeFromCart = removeFromCart;
    window.processTransaction = processTransaction;
    window.openEditModal = openEditModal;
    window.closeEditModal = closeEditModal;
    window.deleteProduct = deleteProduct;
    window.autoRestock = autoRestock;
});
