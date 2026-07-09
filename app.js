/* ============ Roop Rental Services — App Logic ============ */

/* ---------- IndexedDB ---------- */
const DB_NAME = 'roopRentalDB';
const DB_VER = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('rentals')) {
        const s = d.createObjectStore('rentals', { keyPath: 'id' });
        s.createIndex('customerMobile', 'customerMobile');
        s.createIndex('createdAt', 'createdAt');
      }
      if (!d.objectStoreNames.contains('customers')) {
        d.createObjectStore('customers', { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('items')) {
        d.createObjectStore('items', { keyPath: 'name' });
      }
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e);
  });
}

function tx(store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}
function dbGetAll(store) {
  return new Promise((res, rej) => {
    const r = tx(store).getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = rej;
  });
}
function dbGet(store, key) {
  return new Promise((res, rej) => {
    const r = tx(store).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = rej;
  });
}
function dbPut(store, val) {
  return new Promise((res, rej) => {
    const r = tx(store, 'readwrite').put(val);
    r.onsuccess = () => res(val);
    r.onerror = rej;
  });
}
function dbDelete(store, key) {
  return new Promise((res, rej) => {
    const r = tx(store, 'readwrite').delete(key);
    r.onsuccess = () => res();
    r.onerror = rej;
  });
}
function dbClear(store) {
  return new Promise((res, rej) => {
    const r = tx(store, 'readwrite').clear();
    r.onsuccess = () => res();
    r.onerror = rej;
  });
}

/* ---------- Utilities ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return iso;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${ampm}`;
}
function fmtDateTime(iso, time) {
  if (!iso) return '—';
  return time ? `${fmtDate(iso)}, ${fmtTime(time)}` : fmtDate(iso);
}
function combineDateTime(dateStr, timeStr) {
  return new Date(`${dateStr || todayISO()}T${timeStr || '00:00'}:00`);
}
function rentalDays(r) {
  const start = combineDateTime(r.date, r.time);
  const end = r.actualReturnDate ? combineDateTime(r.actualReturnDate, r.actualReturnTime) : new Date();
  const diff = Math.ceil((end - start) / 86400000);
  return Math.max(diff, 1);
}
function fmtMoney(n) {
  n = Number(n) || 0;
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function daysBetween(a, b) {
  if (!a) return 0;
  const d1 = new Date(a), d2 = b ? new Date(b) : new Date();
  const diff = Math.round((d2 - d1) / 86400000);
  return Math.max(diff, 1);
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
function escapeHtml(s) {
  return (s || '').toString().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ITEM_RATES = {
  'H Frames': 50, 'Bracings': 0, 'Walkway Plank': 20, 'Wheels': 15, 'Jack': 25,
  'Ladder 6ft': 30, 'Ladder 8ft': 50, 'Ladder 10ft': 100, 'Ladder 12ft': 120,
  'Ladder 15ft': 200, 'Ladder 18ft': 300, 'Ladder 20ft': 300, 'Sidi 20ft': 250,
  'Drum': 50, 'Jhula': 150
};
const PRELOADED_ITEMS = Object.keys(ITEM_RATES);

/* ---------- Global State ---------- */
const state = {
  view: 'dashboard',
  rentals: [],
  customers: [],
  frequentItems: [],
  settings: {
    businessName: 'ROOP RENTAL SERVICES',
    tagline: 'All types of construction equipments available on rental basis',
    ownerName: 'Adil Ansari',
    phone: '+91 9033819381',
    email: 'rooprentalservices@gmail.com',
    address: '101/489, Near Garibnagar Cross Road, Rakhiyal Road, Bapunagar, Ahmedabad, Gujarat 380024',
    gst: '',
    theme: 'light',
    currency: '₹',
    defaultRent: 50,
    pin: '',
    pinEnabled: false,
    invoiceCounter: 1,
    invoicePrefix: 'RR',
    logoImg: ''
  },
  searchQuery: '',
  filter: 'all',
  sort: 'newest',
  editingId: null
};

function nextInvoiceNumber() {
  const n = state.settings.invoiceCounter || 1;
  return `${state.settings.invoicePrefix || 'RR'}-${String(n).padStart(4, '0')}`;
}
function registerInvoiceNumberUsed(invNum) {
  const match = /(\d+)\s*$/.exec(invNum || '');
  const used = match ? parseInt(match[1], 10) : NaN;
  const current = state.settings.invoiceCounter || 1;
  state.settings.invoiceCounter = (!isNaN(used) && used >= current) ? used + 1 : current + 1;
}

/* ---------- Rental computations ---------- */
function itemTotal(item, r) {
  const days = rentalDays(r);
  return (Number(item.qty) || 0) * (Number(item.rentPerDay) || 0) * days;
}
function rentalItemsTotal(r) {
  return (r.items || []).reduce((sum, it) => sum + itemTotal(it, r), 0);
}
function rentalPaid(r) {
  const adv = Number(r.advanceAmount) || 0;
  const extra = (r.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return adv + extra;
}
function rentalGrandTotal(r) {
  return rentalItemsTotal(r) + (Number(r.oldDues) || 0) - (Number(r.refundAmount) || 0)
    + (Number(r.transportCharge) || 0) - (Number(r.discount) || 0);
}
function rentalDue(r) {
  return Math.max(rentalGrandTotal(r) - rentalPaid(r), 0);
}
function itemReturnState(r) {
  if (r.actualReturnDate) return 'returned';
  const items = r.items || [];
  if (!items.length) return 'on';
  const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const returnedQty = items.reduce((s, i) => s + (Number(i.returnedQty) || 0), 0);
  if (returnedQty <= 0) return 'on';
  if (returnedQty >= totalQty) return 'returned';
  return 'partial';
}
function rentalStatusBadge(r) {
  if (r.archived) return { cls: 'archived', label: 'Archived' };
  const st = itemReturnState(r);
  const due = rentalDue(r);
  if (st === 'returned' && due > 0) return { cls: 'pending', label: 'Payment Pending' };
  if (st === 'returned') return { cls: 'returned', label: 'Returned' };
  if (st === 'partial') return { cls: 'partial', label: 'Partial Return' };
  return { cls: 'on', label: 'On Rent' };
}

/* ---------- Customer upsert ---------- */
async function upsertCustomerFromRental(r) {
  if (!r.customerName) return;
  let existing = state.customers.find(c => (r.customerMobile && c.mobile === r.customerMobile) || (!r.customerMobile && c.name === r.customerName));
  if (existing) {
    existing.name = r.customerName || existing.name;
    existing.mobile = r.customerMobile || existing.mobile;
    existing.altMobile = r.altMobile || existing.altMobile;
    existing.address = r.customerAddress || existing.address;
    await dbPut('customers', existing);
  } else {
    const c = { id: uid(), name: r.customerName, mobile: r.customerMobile || '', altMobile: r.altMobile || '', address: r.customerAddress || '', createdAt: Date.now() };
    state.customers.push(c);
    await dbPut('customers', c);
  }
}

async function bumpFrequentItem(name) {
  if (!name) return;
  let existing = await dbGet('items', name);
  if (existing) { existing.count = (existing.count || 0) + 1; await dbPut('items', existing); }
  else await dbPut('items', { name, count: 1 });
}

/* ---------- Rendering: Dashboard ---------- */
function computeStats() {
  const active = state.rentals.filter(r => !r.deleted && !r.archived);
  const today = todayISO();
  const totalActive = active.filter(r => itemReturnState(r) !== 'returned').length;
  const todayRentals = active.filter(r => r.date === today).length;
  const pendingPayments = active.filter(r => rentalDue(r) > 0).length;
  const monthStart = today.slice(0, 7);
  const monthlyRevenue = active.filter(r => (r.date || '').startsWith(monthStart)).reduce((s, r) => s + rentalPaid(r), 0);
  return { totalActive, todayRentals, pendingPayments, monthlyRevenue };
}

function renderDashboard() {
  const s = computeStats();
  const active = state.rentals.filter(r => !r.deleted && !r.archived);
  const recent = [...active].sort((a, b) => b.createdAt - a.createdAt).slice(0, 7);
  return `
    <div class="stat-grid">
      <div class="stat-card accent"><div class="num">${s.totalActive}</div><div class="lbl">Active Rentals</div></div>
      <div class="stat-card"><div class="num">${s.todayRentals}</div><div class="lbl">Today's Rentals</div></div>
      <div class="stat-card"><div class="num" style="color:var(--brown)">${s.pendingPayments}</div><div class="lbl">Pending Payments</div></div>
      <div class="stat-card"><div class="num">${fmtMoney(s.monthlyRevenue)}</div><div class="lbl">This Month Revenue</div></div>
    </div>
    <div class="section-title">Recent Rentals <a data-nav="rentals">View all</a></div>
    ${recent.length ? recent.map(rentalCardHTML).join('') : '<div class="empty">No rentals yet. Tap + to add one.</div>'}
  `;
}

function truncate(s, n) {
  s = s || '';
  return s.length > n ? s.slice(0, n).trim() + '…' : s;
}

function rentalCardHTML(r) {
  const badge = rentalStatusBadge(r);
  const due = rentalDue(r);
  const names = (r.items || []).map(i => `${i.name} x${i.qty}`).filter(Boolean);
  const itemPreview = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '') || '—';
  return `
  <div class="card rental-card" data-open-rental="${r.id}">
    <div class="top">
      <div>
        <div class="name">${escapeHtml(r.customerName || 'No name')}</div>
        <div class="items">${escapeHtml(itemPreview)}</div>
      </div>
      <span class="badge ${badge.cls}">${badge.label}</span>
    </div>
    <div class="meta">
      <span>#${escapeHtml(r.invoiceNumber || '—')}</span>
      <span>📅 ${fmtDate(r.date)}</span>
      ${r.deliveryAddress ? `<span>📍 ${escapeHtml(truncate(r.deliveryAddress, 28))}</span>` : ''}
      <span class="due-amt ${due <= 0 ? 'clear' : ''}">${due > 0 ? 'Due ' + fmtMoney(due) : 'Cleared'}</span>
    </div>
  </div>`;
}

/* ---------- Rentals List View ---------- */
function filterRentals() {
  const q = state.searchQuery.trim().toLowerCase();
  let list = state.rentals.filter(r => {
    if (state.filter === 'trash') return r.deleted;
    if (r.deleted) return false;
    if (state.filter === 'archived') return r.archived;
    if (r.archived) return false;
    if (state.filter === 'active') return itemReturnState(r) !== 'returned';
    if (state.filter === 'returned') return itemReturnState(r) === 'returned';
    if (state.filter === 'pending') return rentalDue(r) > 0;
    if (state.filter === 'today') return r.date === todayISO();
    return true;
  });
  if (q) {
    list = list.filter(r => {
      const hay = [r.customerName, r.customerMobile, r.altMobile, r.customerAddress, r.transporterName,
        r.notes, (r.items || []).map(i => i.name).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  const sortFns = {
    newest: (a, b) => b.createdAt - a.createdAt,
    oldest: (a, b) => a.createdAt - b.createdAt,
    nameAZ: (a, b) => (a.customerName || '').localeCompare(b.customerName || ''),
    nameZA: (a, b) => (b.customerName || '').localeCompare(a.customerName || ''),
    highestDue: (a, b) => rentalDue(b) - rentalDue(a),
    lowestDue: (a, b) => rentalDue(a) - rentalDue(b),
    returnDate: (a, b) => (a.actualReturnDate || '').localeCompare(b.actualReturnDate || '')
  };
  list.sort(sortFns[state.sort] || sortFns.newest);
  return list;
}

function renderRentals() {
  const list = filterRentals();
  const filters = [
    ['all', 'All'], ['active', 'Active'], ['today', 'Today'], ['pending', 'Payment Pending'],
    ['returned', 'Returned'], ['archived', 'Archived'], ['trash', 'Trash']
  ];
  const sorts = [['newest', 'Newest'], ['oldest', 'Oldest'], ['nameAZ', 'Name A-Z'], ['nameZA', 'Name Z-A'],
    ['highestDue', 'Highest Due'], ['lowestDue', 'Lowest Due'], ['returnDate', 'Return Date']];
  return `
    <div class="page-header"><h2>Rentals</h2>
      <select id="sortSelect" style="border:1px solid var(--border);border-radius:10px;padding:7px;background:var(--card);color:var(--text);font-size:12px;">
        ${sorts.map(([v, l]) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="filter-scroll">
      ${filters.map(([v, l]) => `<div class="chip ${state.filter === v ? 'active' : ''}" data-filter="${v}">${l}</div>`).join('')}
    </div>
    ${list.length ? list.map(rentalCardHTML).join('') : '<div class="empty">No rentals match.</div>'}
  `;
}

/* ---------- Customers ---------- */
function renderCustomers() {
  const q = state.searchQuery.trim().toLowerCase();
  let list = [...state.customers];
  if (q) list = list.filter(c => (c.name + c.mobile + c.address).toLowerCase().includes(q));
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return `
    <div class="page-header"><h2>Customers</h2></div>
    ${list.length ? list.map(c => {
      const rentals = state.rentals.filter(r => !r.deleted && (r.customerMobile === c.mobile || r.customerName === c.name));
      const totalDue = rentals.reduce((s, r) => s + rentalDue(r), 0);
      return `<div class="card" data-open-customer="${c.id}">
        <div class="top">
          <div><div class="name">${escapeHtml(c.name)}</div><div class="items">${escapeHtml(c.mobile || 'No mobile')}</div></div>
          ${totalDue > 0 ? `<span class="due-amt">Due ${fmtMoney(totalDue)}</span>` : `<span class="due-amt clear">Clear</span>`}
        </div>
        <div class="meta"><span>${rentals.length} rental${rentals.length !== 1 ? 's' : ''}</span></div>
      </div>`;
    }).join('') : '<div class="empty">No customers saved yet.</div>'}
  `;
}

function renderCustomerDetail(id) {
  const c = state.customers.find(x => x.id === id);
  if (!c) return '<div class="empty">Customer not found.</div>';
  const rentals = state.rentals.filter(r => !r.deleted && (r.customerMobile === c.mobile || r.customerName === c.name))
    .sort((a, b) => b.createdAt - a.createdAt);
  const totalBiz = rentals.reduce((s, r) => s + rentalGrandTotal(r), 0);
  const totalDue = rentals.reduce((s, r) => s + rentalDue(r), 0);

  // full payment ledger across all this customer's rentals (advance counted as a payment too)
  const ledger = [];
  rentals.forEach(r => {
    if (Number(r.advanceAmount) > 0) ledger.push({ date: r.date, amount: r.advanceAmount, mode: r.advanceMode || 'Cash', invoiceNumber: r.invoiceNumber });
    (r.payments || []).forEach(p => ledger.push({ date: p.date, amount: p.amount, mode: p.mode, invoiceNumber: r.invoiceNumber }));
  });
  ledger.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return `
    <div class="page-header"><button class="back-btn" data-back="customers">←</button><h2>${escapeHtml(c.name)}</h2></div>
    <div class="card">
      <div style="font-size:13px;line-height:1.7;">
        📞 <a href="tel:${c.mobile}">${escapeHtml(c.mobile || '—')}</a>${c.altMobile ? ' / ' + escapeHtml(c.altMobile) : ''}<br>
        📍 ${escapeHtml(c.address || '—')}<br>
        💼 Total Business: <b>${fmtMoney(totalBiz)}</b><br>
        ${totalDue > 0 ? `⚠️ Outstanding: <b style="color:var(--red)">${fmtMoney(totalDue)}</b>` : `✅ No outstanding dues`}
      </div>
    </div>

    <div class="section-title">Invoices <span style="font-weight:400;color:var(--text-soft);font-size:11.5px;">(${rentals.length})</span></div>
    ${rentals.length ? rentals.map(r => {
      const due = rentalDue(r);
      return `<div class="card" data-open-rental="${r.id}" style="cursor:pointer;">
        <div class="top">
          <div>
            <div class="name">#${escapeHtml(r.invoiceNumber || '—')}</div>
            <div class="items">${fmtDate(r.date)} · ${fmtMoney(rentalGrandTotal(r))}</div>
          </div>
          <span class="due-amt ${due <= 0 ? 'clear' : ''}">${due > 0 ? 'Due ' + fmtMoney(due) : 'Paid'}</span>
        </div>
      </div>`;
    }).join('') : '<div class="empty">No invoices yet.</div>'}

    <div class="section-title">Payment History</div>
    <div class="card">
      ${ledger.length ? ledger.map(p => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
          <span>${fmtDate(p.date)} · ${escapeHtml(p.mode)} · #${escapeHtml(p.invoiceNumber || '—')}</span><b>${fmtMoney(p.amount)}</b>
        </div>`).join('') : '<div class="empty">No payments recorded yet.</div>'}
    </div>
  `;
}


/* ---------- Reports ---------- */
/* ---------- Invoices (dedicated view) ---------- */
function renderInvoices() {
  const q = state.searchQuery.trim().toLowerCase();
  let list = state.rentals.filter(r => !r.deleted);
  if (q) {
    list = list.filter(r => (r.invoiceNumber || '').toLowerCase().includes(q) || (r.customerName || '').toLowerCase().includes(q));
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  const totalDue = list.reduce((s, r) => s + rentalDue(r), 0);
  return `
    <div class="page-header"><h2>Invoices</h2></div>
    <div class="stat-grid" style="grid-template-columns:1fr 1fr;">
      <div class="stat-card" style="background:linear-gradient(135deg,#e0e7ff,#c7d2fe);"><div class="num" style="color:var(--indigo-900)">${list.length}</div><div class="lbl">Total Invoices</div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#fee2e2,#fecaca);"><div class="num" style="color:#b91c1c">${fmtMoney(totalDue)}</div><div class="lbl">Total Outstanding</div></div>
    </div>
    ${list.length ? list.map(r => {
      const due = rentalDue(r);
      const names = (r.items || []).map(i => `${i.name} x${i.qty}`).slice(0, 2).join(', ');
      return `<div class="card" data-open-rental="${r.id}" style="cursor:pointer;">
        <div class="top">
          <div>
            <div class="name">#${escapeHtml(r.invoiceNumber || '—')} · ${escapeHtml(r.customerName || 'No name')}</div>
            <div class="items">${escapeHtml(names)}</div>
          </div>
          <span class="due-amt ${due <= 0 ? 'clear' : ''}">${due > 0 ? 'Due ' + fmtMoney(due) : 'Paid'}</span>
        </div>
        <div class="meta"><span>📅 ${fmtDate(r.invoiceDate || r.date)}</span><span>💰 ${fmtMoney(rentalGrandTotal(r))}</span></div>
      </div>`;
    }).join('') : '<div class="empty">No invoices yet.</div>'}
  `;
}

function renderReports() {
  const active = state.rentals.filter(r => !r.deleted);
  const totalRentals = active.length;
  const totalBilled = active.reduce((s, r) => s + rentalGrandTotal(r), 0);
  const totalReceived = active.reduce((s, r) => s + rentalPaid(r), 0);
  const totalDue = active.reduce((s, r) => s + rentalDue(r), 0);

  // monthly revenue last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  const monthlyData = months.map(m => active.filter(r => (r.date || '').startsWith(m)).reduce((s, r) => s + rentalPaid(r), 0));
  const maxMonth = Math.max(...monthlyData, 1);

  // dues & collections by customer
  const duesByCust = {}, collectedByCust = {};
  active.forEach(r => {
    const key =
