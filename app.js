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
    const key = r.customerName || 'Unknown';
    const due = rentalDue(r);
    if (due > 0) duesByCust[key] = (duesByCust[key] || 0) + due;
    const paid = rentalPaid(r);
    if (paid > 0) collectedByCust[key] = (collectedByCust[key] || 0) + paid;
  });
  const duesList = Object.entries(duesByCust).sort((a, b) => b[1] - a[1]);
  const collectedList = Object.entries(collectedByCust).sort((a, b) => b[1] - a[1]);

  return `
    <div class="page-header"><h2>Reports</h2></div>
    <div class="stat-grid">
      <div class="stat-card" style="background:linear-gradient(135deg,#e0e7ff,#c7d2fe);"><div class="num" style="color:var(--indigo-900)">${totalRentals}</div><div class="lbl">Total Rentals</div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#fef3c7,#fde68a);"><div class="num" style="color:#92400e">${fmtMoney(totalBilled)}</div><div class="lbl">Total Billed</div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);"><div class="num" style="color:#15803d">${fmtMoney(totalReceived)}</div><div class="lbl">Total Received</div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#fee2e2,#fecaca);"><div class="num" style="color:#b91c1c">${fmtMoney(totalDue)}</div><div class="lbl">Total Due</div></div>
    </div>

    <div class="section-title">Monthly Revenue (6 months)</div>
    <div class="card">
      <div style="display:flex;align-items:flex-end;gap:8px;height:120px;">
        ${monthlyData.map((v, i) => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
            <div style="font-size:9px;color:var(--text-soft);margin-bottom:3px;">${v > 0 ? Math.round(v/1000)+'k' : ''}</div>
            <div style="width:100%;background:linear-gradient(180deg,var(--amber),#ea7c1f);border-radius:6px 6px 0 0;height:${Math.max((v/maxMonth)*90,2)}px;"></div>
            <div style="font-size:9px;color:var(--text-soft);margin-top:4px;">${months[i].slice(5)}/${months[i].slice(2,4)}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="section-title">💰 Payment Dues by Customer</div>
    <div class="card">
      ${duesList.length ? duesList.map(([name, val]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid var(--border);">
          <span>${escapeHtml(name)}</span><b style="color:var(--red)">${fmtMoney(val)}</b>
        </div>`).join('') : '<div class="empty">No pending dues 🎉</div>'}
    </div>

    <div class="section-title">✅ Payment Collected by Customer</div>
    <div class="card">
      ${collectedList.length ? collectedList.map(([name, val]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid var(--border);">
          <span>${escapeHtml(name)}</span><b style="color:var(--green)">${fmtMoney(val)}</b>
        </div>`).join('') : '<div class="empty">No data yet.</div>'}
    </div>
  `;
}

/* ---------- Settings ---------- */
function renderSettings() {
  const s = state.settings;
  return `
    <div class="page-header"><h2>Settings</h2></div>
    <div class="section-title">Business Details</div>
    <div class="card">
      <div class="field"><label>Business Name</label><input id="setBizName" value="${escapeHtml(s.businessName)}"></div>
      <div class="field"><label>Tagline</label><input id="setTagline" value="${escapeHtml(s.tagline || '')}"></div>
      <div class="field"><label>Owner Name</label><input id="setOwner" value="${escapeHtml(s.ownerName)}"></div>
      <div class="field"><label>Phone</label><input id="setPhone" value="${escapeHtml(s.phone)}"></div>
      <div class="field"><label>Email</label><input id="setEmail" value="${escapeHtml(s.email || '')}"></div>
      <div class="field"><label>Address</label><input id="setAddress" value="${escapeHtml(s.address)}"></div>
      <div class="field"><label>GST Number (optional)</label><input id="setGst" value="${escapeHtml(s.gst)}"></div>
      <div class="field-row">
        <div class="field"><label>Currency Symbol</label><input id="setCurrency" value="${escapeHtml(s.currency)}"></div>
        <div class="field"><label>Default Rent/Day</label><input id="setDefaultRent" type="number" value="${s.defaultRent}"></div>
      </div>
      <button class="btn btn-primary" id="saveSettingsBtn">Save Business Details</button>
    </div>

    <div class="section-title">App Logo</div>
    <div class="card">
      <p style="font-size:12px;color:var(--text-soft);margin-top:0;">Shown in the app header and on your printed invoices.</p>
      ${s.logoImg ? `<img src="${s.logoImg}" style="max-height:60px;display:block;margin-bottom:8px;border-radius:10px;">` : ''}
      <button type="button" class="btn btn-ghost btn-sm" id="uploadLogoBtn">${s.logoImg ? 'Replace' : 'Upload'} Logo</button>
      <input type="file" id="logoFile" accept="image/*" style="display:none;">
    </div>

    <div class="section-title">Invoice Signature &amp; Stamp</div>
    <div class="card">
      <p style="font-size:12px;color:var(--text-soft);margin-top:0;">Uploaded once — every invoice you print will automatically include your stamp and signature.</p>
      <div class="field-row">
        <div class="field">
          <label>Signature</label>
          ${s.signatureImg ? `<img src="${s.signatureImg}" style="max-height:50px;display:block;margin-bottom:6px;">` : ''}
          <button type="button" class="btn btn-ghost btn-sm" id="uploadSigBtn">${s.signatureImg ? 'Replace' : 'Upload'} Signature</button>
          <input type="file" id="sigFile" accept="image/*" style="display:none;">
        </div>
        <div class="field">
          <label>Stamp</label>
          ${s.stampImg ? `<img src="${s.stampImg}" style="max-height:50px;display:block;margin-bottom:6px;">` : ''}
          <button type="button" class="btn btn-ghost btn-sm" id="uploadStampBtn">${s.stampImg ? 'Replace' : 'Upload'} Stamp</button>
          <input type="file" id="stampFile" accept="image/*" style="display:none;">
        </div>
      </div>
    </div>

    <div class="section-title">Invoice Numbering</div>
    <div class="card">
      <p style="font-size:12px;color:var(--text-soft);margin-top:0;">Every new rental automatically gets the next invoice number. Change these only if you need to realign the sequence.</p>
      <div class="field-row">
        <div class="field"><label>Prefix</label><input id="setInvoicePrefix" value="${escapeHtml(s.invoicePrefix || 'RR')}"></div>
        <div class="field"><label>Next Number</label><input id="setInvoiceCounter" type="number" value="${s.invoiceCounter || 1}"></div>
      </div>
      <div style="font-size:12px;color:var(--text-soft);margin:-6px 0 10px;">Next invoice will be: <b>${nextInvoiceNumber()}</b></div>
      <button class="btn btn-outline" id="saveInvoiceNumBtn">Save Numbering</button>
    </div>

    <div class="section-title">App Lock</div>
    <div class="card">
      <div class="field" style="display:flex;justify-content:space-between;align-items:center;">
        <label style="margin:0;">Enable PIN Lock</label>
        <input type="checkbox" id="pinToggle" ${s.pinEnabled ? 'checked' : ''} style="width:20px;height:20px;">
      </div>
      <div id="pinSetupWrap" style="${s.pinEnabled ? '' : 'display:none;'}margin-top:10px;">
        <div class="field"><label>4-digit PIN</label><input id="setPin" maxlength="4" inputmode="numeric" value="${escapeHtml(s.pin)}"></div>
        <button class="btn btn-outline" id="savePinBtn">Save PIN</button>
      </div>
    </div>

    <div class="section-title">Backup &amp; Restore</div>
    <div class="card">
      <p style="font-size:12.5px;color:var(--text-soft);margin-top:0;">Data is stored only on this phone. Export a backup file regularly and keep it safe (Google Drive, WhatsApp to self, etc). Direct Google Drive sync isn't available in this app version — use manual export/import instead.</p>
      <div class="btn-row">
        <button class="btn btn-primary" id="exportBtn">⬇ Export Backup</button>
        <button class="btn btn-outline" id="importBtn">⬆ Import Backup</button>
      </div>
      <input type="file" id="importFile" accept="application/json" style="display:none;">
    </div>

    <div class="section-title">Appearance</div>
    <div class="card">
      <label style="font-size:12px;font-weight:600;color:var(--text-soft);display:block;margin-bottom:8px;">Theme</label>
      <div class="chip-row">
        <div class="chip theme-chip ${s.theme === 'light' ? 'active' : ''}" data-theme-pick="light">☀️ Light</div>
        <div class="chip theme-chip ${s.theme === 'dark' ? 'active' : ''}" data-theme-pick="dark">🌙 Dark</div>
        <div class="chip theme-chip ${s.theme === 'gray' ? 'active' : ''}" data-theme-pick="gray">◐ Gray</div>
      </div>
    </div>

    <div class="section-title">Frequent Items</div>
    <div class="card">
      <p style="font-size:12px;color:var(--text-soft);margin:0;">${state.frequentItems.length ? state.frequentItems.map(i => escapeHtml(i.name)).join(', ') : 'None yet — items you use in rentals will appear here.'}</p>
    </div>

    <div style="text-align:center;color:var(--text-soft);font-size:11px;margin-top:20px;">Roop Rental Services App · v1.0</div>
  `;
}

/* ---------- Rental Form (Add/Edit) ---------- */
let formDraft = null; // working copy of rental being added/edited

function newBlankRental() {
  return {
    id: uid(), createdAt: Date.now(),
    invoiceNumber: nextInvoiceNumber(),
    invoiceDate: todayISO(),
    date: todayISO(), time: new Date().toTimeString().slice(0, 5),
    customerName: '', customerMobile: '', altMobile: '', customerAddress: '', deliveryAddress: '',
    transportMode: '', transporterName: '', transporterMobile: '', transportCharge: 0,
    items: [],
    advanceAmount: 0, advanceMode: 'Cash', refundAmount: 0, oldDues: 0, discount: 0, notes: '',
    actualReturnDate: '', actualReturnTime: '',
    payments: [], kyc: [], archived: false, deleted: false
  };
}
function blankItem() {
  return { id: uid(), name: '', qty: 1, rentPerDay: 0, returnedQty: 0 };
}

function openRentalForm(existingId) {
  formDraft = existingId ? JSON.parse(JSON.stringify(state.rentals.find(r => r.id === existingId))) : newBlankRental();
  state.editingId = existingId || null;
  renderModal(rentalFormHTML());
  bindRentalFormEvents();
}

function rentalFormHTML() {
  const r = formDraft;
  const totalItems = rentalItemsTotal(r);
  const grand = rentalGrandTotal(r);
  const paid = rentalPaid(r);
  const due = Math.max(grand - paid, 0);
  return `
  <div class="modal-handle"></div>
  <div class="page-header"><h2>${state.editingId ? 'Edit Rental' : 'New Rental'}</h2><button class="back-btn" id="closeForm">✕</button></div>

  <div class="field-row">
    <div class="field"><label>Invoice Number</label><input id="f_invoiceNumber" value="${escapeHtml(r.invoiceNumber || '')}"></div>
    <div class="field"><label>Invoice Date</label><input id="f_invoiceDate" type="date" value="${r.invoiceDate || todayISO()}"></div>
  </div>

  <div class="section-title">Customer</div>
  <div class="field" style="position:relative;">
    <label>Customer Name</label>
    <input id="f_customerName" value="${escapeHtml(r.customerName)}" autocomplete="off" placeholder="Type to search saved customers">
    <div id="custAutofill"></div>
  </div>
  <div class="field-row">
    <div class="field"><label>Mobile</label><input id="f_customerMobile" value="${escapeHtml(r.customerMobile)}" inputmode="tel"></div>
    <div class="field"><label>Alt. Mobile</label><input id="f_altMobile" value="${escapeHtml(r.altMobile)}" inputmode="tel"></div>
  </div>
  <div class="btn-row" style="margin-top:-4px;margin-bottom:12px;">
    <button class="btn btn-ghost btn-sm" id="pickContactBtn" type="button">📇 Pick from Contacts</button>
  </div>
  <div class="field"><label>Customer Address</label><textarea id="f_customerAddress">${escapeHtml(r.customerAddress)}</textarea></div>
  <div class="field"><label>Delivery Address</label><textarea id="f_deliveryAddress">${escapeHtml(r.deliveryAddress)}</textarea></div>

  <div class="section-title">Transport</div>
  <div class="field"><label>Mode of Transport</label><input id="f_transportMode" value="${escapeHtml(r.transportMode)}" placeholder="e.g. Tempo, Auto, Own Vehicle"></div>
  <div class="field-row">
    <div class="field"><label>Transporter Name</label><input id="f_transporterName" value="${escapeHtml(r.transporterName)}"></div>
    <div class="field"><label>Transporter Mobile</label><input id="f_transporterMobile" value="${escapeHtml(r.transporterMobile)}" inputmode="tel"></div>
  </div>
  <div class="field"><label>Transportation Charge</label><input id="f_transportCharge" type="number" value="${r.transportCharge || 0}"></div>

  <div class="section-title">Rental Date &amp; Time</div>
  <div class="field-row">
    <div class="field"><label>Rental Date</label><input id="f_date" type="date" value="${r.date}"></div>
    <div class="field"><label>Time</label><input id="f_time" type="time" value="${r.time || ''}"></div>
  </div>

  <div class="section-title">Actual Return</div>
  <div class="field-row">
    <div class="field"><label>Return Date</label><input id="f_actualReturn" type="date" value="${r.actualReturnDate || ''}"></div>
    <div class="field"><label>Return Time</label><input id="f_actualReturnTime" type="time" value="${r.actualReturnTime || ''}"></div>
  </div>
  <div style="font-size:12px;color:var(--text-soft);margin:-6px 0 12px;">Rental Days (auto-calculated): <b id="rentalDaysDisplay">${rentalDays(r)}</b>${r.actualReturnDate ? '' : ' (still ongoing — counted till today)'}</div>

  <div class="section-title">Items — just enter quantity</div>
  <div class="card" id="stdItemsWrap">${standardItemsHTML(r.items)}</div>

  <div class="section-title">Other / Custom Items <a id="addItemBtn" style="cursor:pointer;">+ Add Item</a></div>
  <div id="itemsWrap">${customItemsHTML(r.items)}</div>

  <div class="section-title">Payment</div>
  <div class="field-row">
    <div class="field"><label>Advance Amount</label><input id="f_advance" type="number" value="${r.advanceAmount}"></div>
    <div class="field"><label>Advance Mode</label>
      <select id="f_advanceMode">
        ${['Cash', 'Online', 'UPI', 'Cheque', 'Bank Transfer'].map(m => `<option ${r.advanceMode === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </div>
  </div>
  <div class="field-row">
    <div class="field"><label>Old Dues</label><input id="f_oldDues" type="number" value="${r.oldDues}"></div>
    <div class="field"><label>Refund Amount</label><input id="f_refund" type="number" value="${r.refundAmount}"></div>
  </div>
  <div class="field"><label>Discount</label><input id="f_discount" type="number" value="${r.discount || 0}"></div>
  <div class="field"><label>Notes</label><textarea id="f_notes">${escapeHtml(r.notes)}</textarea></div>

  <div class="totals-box" id="totalsBox">
    <div class="row"><span>Items Total</span><span>${fmtMoney(totalItems)}</span></div>
    <div class="row"><span>+ Transportation</span><span>${fmtMoney(r.transportCharge)}</span></div>
    <div class="row"><span>- Discount</span><span>${fmtMoney(r.discount)}</span></div>
    <div class="row"><span>+ Old Dues</span><span>${fmtMoney(r.oldDues)}</span></div>
    <div class="row"><span>- Refund</span><span>${fmtMoney(r.refundAmount)}</span></div>
    <div class="row"><span>Paid (Advance + Payments)</span><span>${fmtMoney(paid)}</span></div>
    <div class="row big"><span>Balance Due</span><span>${fmtMoney(due)}</span></div>
  </div>

  <div class="section-title">KYC Documents</div>
  <div class="btn-row">
    <button class="btn btn-ghost btn-sm" id="kycCameraBtn" type="button">📷 Camera</button>
    <button class="btn btn-ghost btn-sm" id="kycGalleryBtn" type="button">🖼 Gallery / PDF</button>
  </div>
  <input type="file" id="kycCameraInput" accept="image/*" capture="environment" style="display:none;">
  <input type="file" id="kycGalleryInput" accept="image/*,application/pdf" multiple style="display:none;">
  <div class="kyc-grid" id="kycGrid">${kycThumbsHTML(r.kyc || [])}</div>

  <div class="btn-row">
    <button class="btn btn-outline" id="cancelFormBtn">Cancel</button>
    <button class="btn btn-primary" id="saveRentalBtn">Save Rental</button>
  </div>
  `;
}

function standardItemsHTML(items) {
  return Object.keys(ITEM_RATES).map(name => {
    const entry = (items || []).find(it => it.name === name);
    const qty = entry ? entry.qty : '';
    const rate = entry ? entry.rentPerDay : ITEM_RATES[name];
    return `
    <div class="std-item-row" data-std-name="${escapeHtml(name)}">
      <div class="std-item-label">${escapeHtml(name)}</div>
      <input type="number" class="std-qty" min="0" placeholder="0" value="${qty}">
      <span class="std-x">×</span>
      <input type="number" class="std-rate" value="${rate}">
    </div>`;
  }).join('');
}

function customItemsHTML(items) {
  const custom = (items || []).filter(it => !Object.prototype.hasOwnProperty.call(ITEM_RATES, it.name));
  if (!custom.length) return '<div class="empty" style="padding:14px 4px;">No custom items added.</div>';
  return custom.map(it => itemRowHTML(it, it.id)).join('');
}

function itemRowHTML(it, id) {
  return `
  <div class="item-row" data-item-id="${id}">
    <button type="button" class="del-item" data-del-item="${id}">✕</button>
    <div class="field">
      <label>Item</label>
      <input list="itemSuggestions" class="it-name" data-id="${id}" value="${escapeHtml(it.name)}" placeholder="Select from list or type item">
    </div>
    <div class="field-row">
      <div class="field"><label>Qty</label><input type="number" class="it-qty" data-id="${id}" value="${it.qty}"></div>
      <div class="field"><label>Rate/Day</label><input type="number" class="it-rate" data-id="${id}" value="${it.rentPerDay}"></div>
    </div>
    <div style="font-size:12px;color:var(--text-soft);">Line total: <b>${fmtMoney(itemTotal(it, formDraft))}</b></div>
  </div>`;
}

function kycThumbsHTML(kyc) {
  return kyc.map((k, i) => `
    <div class="kyc-thumb" data-kyc-view="${i}">
      ${k.type === 'application/pdf' ? `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:26px;">📄</div>` : `<img src="${k.dataUrl}">`}
      <div class="lbl">${escapeHtml(k.name)}</div>
      <button class="rm" data-kyc-del="${i}" type="button">✕</button>
    </div>`).join('');
}

/* item suggestion datalist */
function itemSuggestionsHTML() {
  const names = new Set(PRELOADED_ITEMS);
  state.frequentItems.forEach(i => names.add(i.name));
  return `<datalist id="itemSuggestions">${[...names].map(n => `<option value="${escapeHtml(n)}">`).join('')}</datalist>`;
}

/* ---------- Modal ---------- */
function renderModal(innerHTML) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-sheet">${itemSuggestionsHTML()}${innerHTML}</div></div>`;
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}
function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
  formDraft = null;
}

function refreshFormTotals() {
  const box = document.getElementById('totalsBox');
  if (!box) return;
  const totalItems = rentalItemsTotal(formDraft);
  const grand = rentalGrandTotal(formDraft);
  const paid = rentalPaid(formDraft);
  const due = Math.max(grand - paid, 0);
  box.innerHTML = `
    <div class="row"><span>Items Total</span><span>${fmtMoney(totalItems)}</span></div>
    <div class="row"><span>+ Transportation</span><span>${fmtMoney(formDraft.transportCharge)}</span></div>
    <div class="row"><span>- Discount</span><span>${fmtMoney(formDraft.discount)}</span></div>
    <div class="row"><span>+ Old Dues</span><span>${fmtMoney(formDraft.oldDues)}</span></div>
    <div class="row"><span>- Refund</span><span>${fmtMoney(formDraft.refundAmount)}</span></div>
    <div class="row"><span>Paid (Advance + Payments)</span><span>${fmtMoney(paid)}</span></div>
    <div class="row big"><span>Balance Due</span><span>${fmtMoney(due)}</span></div>
  `;
}

function bindRentalFormEvents() {
  const sheet = document.querySelector('.modal-sheet');
  document.getElementById('closeForm').onclick = closeModal;
  document.getElementById('cancelFormBtn').onclick = closeModal;

  const simpleFields = {
    f_invoiceNumber: 'invoiceNumber', f_invoiceDate: 'invoiceDate', f_customerName: 'customerName', f_customerMobile: 'customerMobile', f_altMobile: 'altMobile',
    f_customerAddress: 'customerAddress', f_deliveryAddress: 'deliveryAddress', f_transportMode: 'transportMode',
    f_transporterName: 'transporterName', f_transporterMobile: 'transporterMobile', f_transportCharge: 'transportCharge', f_date: 'date', f_time: 'time',
    f_actualReturn: 'actualReturnDate', f_actualReturnTime: 'actualReturnTime', f_advance: 'advanceAmount',
    f_advanceMode: 'advanceMode', f_oldDues: 'oldDues', f_refund: 'refundAmount', f_discount: 'discount', f_notes: 'notes'
  };
  const dateFields = ['f_date', 'f_time', 'f_actualReturn', 'f_actualReturnTime'];
  const totalsFields = ['f_advance', 'f_oldDues', 'f_refund', 'f_transportCharge', 'f_discount'];
  Object.entries(simpleFields).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      formDraft[key] = el.type === 'number' ? Number(el.value) : el.value;
      if (dateFields.includes(id)) refreshAll();
      else if (totalsFields.includes(id)) refreshFormTotals();
    });
  });

  // customer autofill
  const nameInput = document.getElementById('f_customerName');
  nameInput.addEventListener('input', () => {
    const q = nameInput.value.trim().toLowerCase();
    const box = document.getElementById('custAutofill');
    if (!q) { box.innerHTML = ''; return; }
    const matches = state.customers.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5);
    if (!matches.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="autofill-list">${matches.map(c => `<div data-pick-cust="${c.id}"><b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.mobile || '')} ${escapeHtml(c.address || '')}</span></div>`).join('')}</div>`;
    box.querySelectorAll('[data-pick-cust]').forEach(el => {
      el.addEventListener('click', () => {
        const c = state.customers.find(x => x.id === el.dataset.pickCust);
        formDraft.customerName = c.name; formDraft.customerMobile = c.mobile || ''; formDraft.altMobile = c.altMobile || ''; formDraft.customerAddress = c.address || '';
        nameInput.value = c.name;
        document.getElementById('f_customerMobile').value = c.mobile || '';
        document.getElementById('f_altMobile').value = c.altMobile || '';
        document.getElementById('f_customerAddress').value = c.address || '';
        box.innerHTML = '';
      });
    });
  });

  // contact picker (supported on some Android Chrome versions)
  document.getElementById('pickContactBtn').onclick = async () => {
    if (!('contacts' in navigator && 'ContactsManager' in window)) {
      toast('Contact picker not supported on this browser — type manually.');
      return;
    }
    try {
      const props = ['name', 'tel'];
      const contacts = await navigator.contacts.select(props, { multiple: false });
      if (contacts && contacts[0]) {
        const c = contacts[0];
        formDraft.customerName = (c.name && c.name[0]) || formDraft.customerName;
        formDraft.customerMobile = (c.tel && c.tel[0]) || formDraft.customerMobile;
        document.getElementById('f_customerName').value = formDraft.customerName;
        document.getElementById('f_customerMobile').value = formDraft.customerMobile;
      }
    } catch (e) { toast('Contact pick cancelled.'); }
  };

  // standard (prefilled) items — just enter quantity
  function setStandardItem(name, qty, rate) {
    const idx = formDraft.items.findIndex(it => it.name === name);
    if (qty > 0) {
      if (idx >= 0) { formDraft.items[idx].qty = qty; formDraft.items[idx].rentPerDay = rate; }
      else formDraft.items.push({ id: uid(), name, qty, rentPerDay: rate, returnedQty: 0 });
    } else if (idx >= 0) {
      formDraft.items.splice(idx, 1);
    }
  }
  document.querySelectorAll('#stdItemsWrap .std-item-row').forEach(row => {
    const name = row.dataset.stdName;
    const qtyInput = row.querySelector('.std-qty');
    const rateInput = row.querySelector('.std-rate');
    qtyInput.addEventListener('input', () => {
      setStandardItem(name, Number(qtyInput.value) || 0, Number(rateInput.value) || 0);
      refreshFormTotals();
    });
    rateInput.addEventListener('input', () => {
      if (Number(qtyInput.value) > 0) setStandardItem(name, Number(qtyInput.value), Number(rateInput.value) || 0);
      refreshFormTotals();
    });
  });

  // custom (extra) items — free text name, id-keyed
  function bindItemRow(id) {
    const row = document.querySelector(`.item-row[data-item-id="${id}"]`);
    if (!row) return;
    row.querySelector('.it-name').addEventListener('input', (e) => {
      const item = formDraft.items.find(it => it.id === id);
      item.name = e.target.value;
      if (Object.prototype.hasOwnProperty.call(ITEM_RATES, e.target.value)) {
        item.rentPerDay = ITEM_RATES[e.target.value];
        row.querySelector('.it-rate').value = ITEM_RATES[e.target.value];
        refreshFormTotals(); updateLineTotal(id);
      }
    });
    row.querySelector('.it-qty').addEventListener('input', (e) => { formDraft.items.find(it => it.id === id).qty = Number(e.target.value); refreshFormTotals(); updateLineTotal(id); });
    row.querySelector('.it-rate').addEventListener('input', (e) => { formDraft.items.find(it => it.id === id).rentPerDay = Number(e.target.value); refreshFormTotals(); updateLineTotal(id); });
    const delBtn = row.querySelector('[data-del-item]');
    if (delBtn) delBtn.addEventListener('click', () => {
      formDraft.items = formDraft.items.filter(it => it.id !== id);
      rerenderCustomItems();
    });
  }
  function updateLineTotal(id) {
    const row = document.querySelector(`.item-row[data-item-id="${id}"]`);
    if (!row) return;
    const item = formDraft.items.find(it => it.id === id);
    const el = row.lastElementChild;
    if (el && item) el.innerHTML = `Line total: <b>${fmtMoney(itemTotal(item, formDraft))}</b>`;
  }
  function refreshAll() {
    const daysEl = document.getElementById('rentalDaysDisplay');
    if (daysEl) daysEl.textContent = rentalDays(formDraft);
    refreshFormTotals();
    formDraft.items.forEach(it => updateLineTotal(it.id));
  }
  function rerenderCustomItems() {
    document.getElementById('itemsWrap').innerHTML = customItemsHTML(formDraft.items);
    formDraft.items.filter(it => !Object.prototype.hasOwnProperty.call(ITEM_RATES, it.name)).forEach(it => bindItemRow(it.id));
  }
  rerenderCustomItems();
  document.getElementById('addItemBtn').onclick = () => { formDraft.items.push(blankItem()); rerenderCustomItems(); };

  // KYC
  document.getElementById('kycCameraBtn').onclick = () => document.getElementById('kycCameraInput').click();
  document.getElementById('kycGalleryBtn').onclick = () => document.getElementById('kycGalleryInput').click();
  function handleFiles(files) {
    [...files].forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        formDraft.kyc = formDraft.kyc || [];
        formDraft.kyc.push({ id: uid(), name: file.name.split('.')[0], type: file.type, dataUrl: reader.result });
        document.getElementById('kycGrid').innerHTML = kycThumbsHTML(formDraft.kyc);
        bindKycEvents();
      };
      reader.readAsDataURL(file);
    });
  }
  document.getElementById('kycCameraInput').addEventListener('change', (e) => handleFiles(e.target.files));
  document.getElementById('kycGalleryInput').addEventListener('change', (e) => handleFiles(e.target.files));
  function bindKycEvents() {
    document.querySelectorAll('[data-kyc-del]').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        formDraft.kyc.splice(Number(btn.dataset.kycDel), 1);
        document.getElementById('kycGrid').innerHTML = kycThumbsHTML(formDraft.kyc);
        bindKycEvents();
      };
    });
  }
  bindKycEvents();

  // save
  document.getElementById('saveRentalBtn').onclick = async () => {
    if (!formDraft.customerName.trim()) { toast('Please enter customer name.'); return; }
    formDraft.items = formDraft.items.filter(i => i.name && i.name.trim() && Number(i.qty) > 0);
    if (!formDraft.items.length) { toast('Add at least one item with quantity.'); return; }
    if (!formDraft.invoiceNumber || !formDraft.invoiceNumber.trim()) formDraft.invoiceNumber = nextInvoiceNumber();
    const isNew = !state.editingId;
    await dbPut('rentals', formDraft);
    const idx = state.rentals.findIndex(r => r.id === formDraft.id);
    if (idx >= 0) state.rentals[idx] = formDraft; else state.rentals.push(formDraft);
    await upsertCustomerFromRental(formDraft);
    for (const it of formDraft.items) await bumpFrequentItem(it.name);
    state.frequentItems = await dbGetAll('items');
    if (isNew) {
      registerInvoiceNumberUsed(formDraft.invoiceNumber);
      await dbPut('settings', { key: 'main', value: state.settings });
    }
    toast('Rental saved.');
    closeModal();
    route();
  };
}

/* ---------- Rental Detail (view) ---------- */
function openRentalDetail(id) {
  const r = state.rentals.find(x => x.id === id);
  if (!r) return;
  renderModal(rentalDetailHTML(r));
  bindRentalDetailEvents(r);
}

function rentalDetailHTML(r) {
  const badge = rentalStatusBadge(r);
  const due = rentalDue(r);
  const days = rentalDays(r);
  return `
  <div class="modal-handle"></div>
  <div class="page-header"><h2>Rental Details</h2><button class="back-btn" id="closeDetail">✕</button></div>
  <div class="card">
    <div class="top"><div class="name">${escapeHtml(r.customerName)}</div><span class="badge ${badge.cls}">${badge.label}</span></div>
    <div style="font-size:12px;color:var(--amber-dark);font-weight:700;margin-top:2px;">Invoice #${escapeHtml(r.invoiceNumber || '—')}</div>
    <div style="font-size:13px;line-height:1.8;margin-top:8px;">
      📞 <a href="tel:${r.customerMobile}">${escapeHtml(r.customerMobile || '—')}</a>${r.altMobile ? ' / ' + escapeHtml(r.altMobile) : ''}<br>
      📍 Address: ${escapeHtml(r.customerAddress || '—')}<br>
      🚚 Delivery Address: ${escapeHtml(r.deliveryAddress || '—')}<br>
      📅 Rental: ${fmtDateTime(r.date, r.time)}<br>
      ${r.actualReturnDate ? `✅ Returned: ${fmtDateTime(r.actualReturnDate, r.actualReturnTime)}<br>` : `⏳ Still ongoing (${days} day${days !== 1 ? 's' : ''} so far)<br>`}
      ${r.transporterName ? `🚛 ${escapeHtml(r.transporterName)} ${r.transporterMobile ? '(' + escapeHtml(r.transporterMobile) + ')' : ''}<br>` : ''}
    </div>
  </div>
  <div class="section-title">Items <span style="font-weight:400;color:var(--text-soft);font-size:11.5px;">(${days} day${days !== 1 ? 's' : ''})</span></div>
  <div class="card">
    ${r.items.map(it => `
      <div style="padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <div style="display:flex;justify-content:space-between;"><b>${escapeHtml(it.name)}</b><span>${fmtMoney(itemTotal(it, r))}</span></div>
        <div style="font-size:11.5px;color:var(--text-soft);">${fmtMoney(it.rentPerDay)}/day × ${it.qty} qty × ${days} day${days !== 1 ? 's' : ''}</div>
      </div>`).join('')}
  </div>
  <div class="totals-box">
    <div class="row"><span>Items Total</span><span>${fmtMoney(rentalItemsTotal(r))}</span></div>
    <div class="row"><span>+ Transportation</span><span>${fmtMoney(r.transportCharge)}</span></div>
    <div class="row"><span>- Discount</span><span>${fmtMoney(r.discount)}</span></div>
    <div class="row"><span>+ Old Dues</span><span>${fmtMoney(r.oldDues)}</span></div>
    <div class="row"><span>- Refund</span><span>${fmtMoney(r.refundAmount)}</span></div>
    <div class="row"><span>Paid</span><span>${fmtMoney(rentalPaid(r))}</span></div>
    <div class="row big"><span>Balance Due</span><span>${fmtMoney(due)}</span></div>
  </div>
  ${r.notes ? `<div class="section-title">Notes</div><div class="card" style="font-size:13px;">${escapeHtml(r.notes)}</div>` : ''}
  ${(r.kyc || []).length ? `<div class="section-title">KYC Documents</div><div class="kyc-grid">${kycThumbsViewHTML(r.kyc)}</div>` : ''}

  ${(r.payments || []).length ? `
  <div class="section-title">Payment History</div>
  <div class="card">
    ${r.payments.map(p => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
        <span>${fmtDate(p.date)} · ${escapeHtml(p.mode)}</span><b>${fmtMoney(p.amount)}</b>
      </div>`).join('')}
  </div>` : ''}

  <div class="section-title">Add Payment</div>
  <div class="card">
    <div class="field-row">
      <div class="field"><label>Amount</label><input id="payAmount" type="number"></div>
      <div class="field"><label>Mode</label>
        <select id="payMode">${['Cash', 'Online', 'UPI', 'Cheque', 'Bank Transfer'].map(m => `<option>${m}</option>`).join('')}</select>
      </div>
    </div>
    <div class="field"><label>Date</label><input id="payDate" type="date" value="${todayISO()}"></div>
    <button class="btn btn-outline" id="addPaymentBtn">+ Record Payment</button>
  </div>

  <div class="btn-row">
    <button class="btn btn-ghost" id="whatsappReceiptBtn">📩 WhatsApp Receipt</button>
    <button class="btn btn-ghost" id="whatsappInvoiceBtn">🧾 WhatsApp Invoice</button>
  </div>
  <div class="btn-row">
    <button class="btn btn-primary" id="printInvoiceBtn">🖨 Print / PDF Invoice</button>
  </div>
  <div class="btn-row">
    <button class="btn btn-outline" id="editRentalBtn">✏️ Edit</button>
    <button class="btn btn-outline" id="duplicateRentalBtn">🧬 Duplicate</button>
  </div>
  <div class="btn-row">
    ${r.deleted
      ? `<button class="btn btn-outline" id="restoreBtn">♻️ Restore</button><button class="btn btn-danger" id="permDelBtn">Delete Forever</button>`
      : `<button class="btn btn-outline" id="archiveBtn">${r.archived ? '📤 Unarchive' : '📥 Archive'}</button><button class="btn btn-danger" id="deleteBtn">🗑 Delete</button>`}
  </div>
  `;
}
function kycThumbsViewHTML(kyc) {
  return kyc.map(k => `<div class="kyc-thumb">${k.type === 'application/pdf' ? `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:26px;">📄</div>` : `<img src="${k.dataUrl}">`}<div class="lbl">${escapeHtml(k.name)}</div></div>`).join('');
}

/* WhatsApp message #1 — sent when items go out on rent */
function buildReceiptText(r) {
  const s = state.settings;
  const itemLines = r.items.map(i => `• ${i.name}: ${i.qty} Nos.`).join('\n');
  return [
    `🧾 ${s.businessName.toUpperCase()}`,
    `Rental Receipt`,
    ``,
    `📅 Rental Date: ${fmtDate(r.date)}`,
    `👤 Customer Name: ${r.customerName}`,
    `📞 Mobile: ${r.customerMobile || '—'}`,
    `📍 Delivery Address: ${r.deliveryAddress || r.customerAddress || '—'}`,
    ``,
    `📦 Items Issued on Rent:`,
    itemLines,
    ``,
    `💰 Advance Paid: ${fmtMoney(r.advanceAmount)}`,
    ``,
    `Thank you for choosing ${s.businessName}. We appreciate your trust and look forward to serving you again.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👨‍💼 ${s.ownerName}`,
    `📞 ${s.phone}`,
    `📍 ${s.address}`
  ].join('\n');
}

/* WhatsApp message #2 — final invoice with balance */
function buildInvoiceText(r) {
  const s = state.settings;
  const itemLines = r.items.map(i => `• ${i.name}: ${i.qty} Nos.`).join('\n');
  const due = rentalDue(r);
  return [
    `🧾 ${s.businessName.toUpperCase()}`,
    `Rental Invoice #${r.invoiceNumber || ''}`,
    ``,
    `👤 Customer Name: ${r.customerName}`,
    `📞 Mobile: ${r.customerMobile || '—'}`,
    `📍 Delivery Address: ${r.deliveryAddress || r.customerAddress || '—'}`,
    ``,
    `📦 Items Rented:`,
    itemLines,
    ``,
    `📅 Rental Date: ${fmtDate(r.date)}`,
    `📅 Return Date: ${r.actualReturnDate ? fmtDate(r.actualReturnDate) : 'Ongoing'}`,
    `📆 Rental Period: ${rentalDays(r)} Days`,
    ``,
    `💰 Total Rental Charges: ${fmtMoney(rentalGrandTotal(r))}`,
    `💵 Advance Paid: ${fmtMoney(rentalPaid(r))}`,
    `💳 Balance Amount: ${fmtMoney(due)}`,
    ``,
    `✅ Payment Status: ${due <= 0 ? 'Paid' : 'Pending'}`,
    ``,
    `Thank you for choosing ${s.businessName}. We truly appreciate your business and look forward to serving you again.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👨‍💼 ${s.ownerName}`,
    `📞 ${s.phone}`,
    `📍 ${s.address}`
  ].join('\n');
}

function sendWhatsApp(r, text) {
  const phone = (r.customerMobile || '').replace(/\D/g, '');
  const url = `https://wa.me/${phone ? '91' + phone.slice(-10) : ''}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

function bindRentalDetailEvents(r) {
  document.getElementById('closeDetail').onclick = closeModal;
  document.getElementById('editRentalBtn').onclick = () => { closeModal(); openRentalForm(r.id); };
  document.getElementById('whatsappReceiptBtn').onclick = () => sendWhatsApp(r, buildReceiptText(r));
  document.getElementById('whatsappInvoiceBtn').onclick = () => sendWhatsApp(r, buildInvoiceText(r));
  document.getElementById('printInvoiceBtn').onclick = () => openInvoicePrint(r);
  document.getElementById('duplicateRentalBtn').onclick = () => {
    closeModal();
    formDraft = JSON.parse(JSON.stringify(r));
    formDraft.id = uid();
    formDraft.createdAt = Date.now();
    formDraft.invoiceNumber = nextInvoiceNumber();
    formDraft.invoiceDate = todayISO();
    formDraft.date = todayISO();
    formDraft.time = new Date().toTimeString().slice(0, 5);
    formDraft.actualReturnDate = ''; formDraft.actualReturnTime = '';
    formDraft.advanceAmount = 0; formDraft.refundAmount = 0; formDraft.payments = [];
    formDraft.kyc = []; formDraft.archived = false; formDraft.deleted = false;
    state.editingId = null;
    renderModal(rentalFormHTML());
    bindRentalFormEvents();
    toast('Duplicated — review and save as a new rental.');
  };
  document.getElementById('addPaymentBtn').onclick = async () => {
    const amt = Number(document.getElementById('payAmount').value);
    if (!amt) { toast('Enter an amount.'); return; }
    const mode = document.getElementById('payMode').value;
    const date = document.getElementById('payDate').value || todayISO();
    r.payments = r.payments || [];
    r.payments.push({ amount: amt, mode, date });
    await dbPut('rentals', r);
    toast('Payment recorded.');
    openRentalDetail(r.id);
  };
  const archiveBtn = document.getElementById('archiveBtn');
  if (archiveBtn) archiveBtn.onclick = async () => { r.archived = !r.archived; await dbPut('rentals', r); toast(r.archived ? 'Archived.' : 'Unarchived.'); closeModal(); route(); };
  const deleteBtn = document.getElementById('deleteBtn');
  if (deleteBtn) deleteBtn.onclick = async () => { r.deleted = true; r.deletedAt = Date.now(); await dbPut('rentals', r); toast('Moved to Trash.'); closeModal(); route(); };
  const restoreBtn = document.getElementById('restoreBtn');
  if (restoreBtn) restoreBtn.onclick = async () => { r.deleted = false; delete r.deletedAt; await dbPut('rentals', r); toast('Restored.'); closeModal(); route(); };
  const permDelBtn = document.getElementById('permDelBtn');
  if (permDelBtn) permDelBtn.onclick = async () => {
    if (!confirm('Permanently delete this rental? This cannot be undone.')) return;
    await dbDelete('rentals', r.id);
    state.rentals = state.rentals.filter(x => x.id !== r.id);
    toast('Deleted permanently.');
    closeModal(); route();
  };
}

/* ---------- Invoice Print ---------- */
function openInvoicePrint(r) {
  const s = state.settings;
  const w = window.open('', '_blank');
  const rows = r.items.map((it, i) => `<tr style="background:${i % 2 ? '#fff7ec' : '#ffffff'}"><td>${escapeHtml(it.name)}</td><td style="text-align:center;">${it.qty}</td><td style="text-align:right;">${fmtMoney(it.rentPerDay)}</td><td style="text-align:right;">${fmtMoney(itemTotal(it, r))}</td></tr>`).join('');
  const due = rentalDue(r);
  const stampSigBlock = `
    <div style="display:flex;justify-content:flex-end;gap:24px;margin-top:36px;align-items:flex-end;">
      ${s.stampImg ? `<img src="${s.stampImg}" style="max-height:90px;max-width:110px;opacity:.9;">` : ''}
      ${s.signatureImg ? `<div style="text-align:center;"><img src="${s.signatureImg}" style="max-height:60px;max-width:150px;display:block;margin:0 auto;"><div style="border-top:1px solid #333;font-size:11px;padding-top:3px;margin-top:2px;">Authorized Signature</div></div>` : ''}
    </div>`;
  w.document.write(`
    <html><head><title>Invoice ${escapeHtml(r.invoiceNumber || '')} - ${escapeHtml(r.customerName)}</title>
    <style>
      * { box-sizing: border-box; }
      body{font-family:Arial,'Segoe UI',sans-serif;padding:0;margin:0;color:#161b33;background:#f3f4fa;}
      .sheet{max-width:720px;margin:0 auto;background:#fff;}
      .band{background:linear-gradient(135deg,#1e2952,#2b3968);color:#fff;padding:26px 32px 20px;position:relative;overflow:hidden;}
      .band::after{content:'';position:absolute;right:-40px;top:-40px;width:160px;height:160px;background:rgba(245,158,11,.25);border-radius:50%;}
      .band-top{display:flex;align-items:center;gap:14px;}
      .band-top img{height:52px;width:52px;object-fit:contain;border-radius:12px;background:#fff;padding:4px;}
      .band h1{margin:0;font-size:21px;letter-spacing:.3px;}
      .band .tagline{opacity:.9;font-size:11.5px;margin-top:3px;font-style:italic;}
      .band .sub{opacity:.85;font-size:12px;margin-top:8px;line-height:1.6;}
      .invoice-tag{display:inline-block;background:#f59e0b;color:#2b1400;font-weight:800;font-size:12px;padding:4px 12px;border-radius:20px;margin-top:10px;}
      .body{padding:24px 32px 8px;}
      .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;background:#fff7ec;border:1px solid #f3d9ad;border-radius:10px;padding:14px 16px;margin-bottom:18px;font-size:13px;}
      .meta-grid div span{display:block;color:#8a5a2b;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;font-weight:700;}
      table{width:100%;border-collapse:collapse;margin-top:4px;border-radius:10px;overflow:hidden;}
      th{background:#1e2952;color:#fff;padding:10px 8px;font-size:12px;text-align:left;}
      th:nth-child(2){text-align:center;} th:nth-child(3),th:nth-child(4){text-align:right;}
      td{padding:9px 8px;font-size:13px;border-bottom:1px solid #eee;}
      .totals{margin-top:16px;width:100%;max-width:320px;margin-left:auto;background:#fff7ec;border:1px solid #f3d9ad;border-radius:10px;padding:14px 16px;}
      .totals div{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;}
      .totals .grand{font-weight:800;font-size:16px;border-top:2px solid #f59e0b;padding-top:8px;margin-top:6px;color:#1e2952;}
      @media print { body{background:#fff;} .sheet{max-width:100%;} }
    </style></head><body>
    <div class="sheet">
      <div class="band">
        <div class="band-top">
          ${s.logoImg ? `<img src="${s.logoImg}">` : ''}
          <div>
            <h1>${escapeHtml(s.businessName)}</h1>
            ${s.tagline ? `<div class="tagline">${escapeHtml(s.tagline)}</div>` : ''}
          </div>
        </div>
        <div class="sub">${escapeHtml(s.address)}<br>📞 ${escapeHtml(s.phone)}${s.email ? ' · ✉️ ' + escapeHtml(s.email) : ''}${s.gst ? ' · GST: ' + escapeHtml(s.gst) : ''}</div>
        <div class="invoice-tag">Invoice #${escapeHtml(r.invoiceNumber || '—')}</div>
      </div>
      <div class="body">
        <div class="meta-grid">
          <div><span>Customer</span>${escapeHtml(r.customerName)}</div>
          <div><span>Mobile</span>${escapeHtml(r.customerMobile || '—')}</div>
          <div><span>Address</span>${escapeHtml(r.customerAddress || '—')}</div>
          <div><span>Delivery Address</span>${escapeHtml(r.deliveryAddress || '—')}</div>
          <div><span>Invoice Date</span>${fmtDate(r.invoiceDate || r.date)}</div>
          <div><span>Rental Date</span>${fmtDate(r.date)}</div>
          <div><span>Return Date</span>${r.actualReturnDate ? fmtDate(r.actualReturnDate) : 'Ongoing'}</div>
          <div><span>Total Days</span>${rentalDays(r)}</div>
        </div>
        <table><thead><tr><th>Item</th><th>Qty</th><th>Rate/Day</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="totals">
          <div><span>Items Total</span><span>${fmtMoney(rentalItemsTotal(r))}</span></div>
          ${Number(r.transportCharge) > 0 ? `<div><span>Transportation</span><span>${fmtMoney(r.transportCharge)}</span></div>` : ''}
          ${Number(r.discount) > 0 ? `<div><span>Discount</span><span>-${fmtMoney(r.discount)}</span></div>` : ''}
          <div><span>Advance Paid</span><span>-${fmtMoney(rentalPaid(r))}</span></div>
          <div class="grand"><span>Balance Due</span><span>${fmtMoney(due)}</span></div>
        </div>
        ${stampSigBlock}
      </div>
    </div>
    <script>window.onload = () => window.print();<\/script>
    </body></html>
  `);
  w.document.close();
}

/* ---------- Backup / Restore ---------- */
async function exportBackup() {
  const data = {
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    rentals: await dbGetAll('rentals'),
    customers: await dbGetAll('customers'),
    items: await dbGetAll('items')
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `roop-rental-backup-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast('Backup exported.');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!confirm('Importing will replace all current data. Continue?')) return;
      await dbClear('rentals'); await dbClear('customers'); await dbClear('items');
      for (const r of data.rentals || []) await dbPut('rentals', r);
      for (const c of data.customers || []) await dbPut('customers', c);
      for (const i of data.items || []) await dbPut('items', i);
      if (data.settings) { state.settings = { ...state.settings, ...data.settings }; await dbPut('settings', { key: 'main', value: state.settings }); }
      await loadAllData();
      toast('Backup restored.');
      route();
    } catch (e) { toast('Invalid backup file.'); }
  };
  reader.readAsText(file);
}

/* ---------- PIN Lock ---------- */
let pinBuffer = '';
function showLockScreen() {
  const el = document.getElementById('lockscreen');
  el.style.display = 'flex';
  el.innerHTML = `
    <div style="font-size:40px;">🔒</div>
    <div style="margin-top:10px;font-weight:700;">Enter PIN</div>
    <div class="pin-dots" id="pinDots">${'<span></span>'.repeat(4)}</div>
    <div class="keypad">
      ${[1,2,3,4,5,6,7,8,9].map(n => `<button data-pin="${n}">${n}</button>`).join('')}
      <button data-pin="clear">⌫</button><button data-pin="0">0</button><button data-pin="ok">✓</button>
    </div>
  `;
  pinBuffer = '';
  el.querySelectorAll('[data-pin]').forEach(btn => {
    btn.onclick = () => {
      const v = btn.dataset.pin;
      if (v === 'clear') pinBuffer = pinBuffer.slice(0, -1);
      else if (v === 'ok') { checkPin(); return; }
      else if (pinBuffer.length < 4) pinBuffer += v;
      updatePinDots();
    };
  });
}
function updatePinDots() {
  document.querySelectorAll('#pinDots span').forEach((s, i) => s.classList.toggle('filled', i < pinBuffer.length));
}
function checkPin() {
  if (pinBuffer === state.settings.pin) {
    document.getElementById('lockscreen').style.display = 'none';
  } else {
    toast('Wrong PIN');
    pinBuffer = '';
    updatePinDots();
  }
}

/* ---------- Settings events (bound after render) ---------- */
function bindSettingsEvents() {
  const saveBtn = document.getElementById('saveSettingsBtn');
  if (!saveBtn) return;
  saveBtn.onclick = async () => {
    state.settings.businessName = document.getElementById('setBizName').value;
    state.settings.tagline = document.getElementById('setTagline').value;
    state.settings.ownerName = document.getElementById('setOwner').value;
    state.settings.phone = document.getElementById('setPhone').value;
    state.settings.email = document.getElementById('setEmail').value;
    state.settings.address = document.getElementById('setAddress').value;
    state.settings.gst = document.getElementById('setGst').value;
    state.settings.currency = document.getElementById('setCurrency').value;
    state.settings.defaultRent = Number(document.getElementById('setDefaultRent').value);
    await dbPut('settings', { key: 'main', value: state.settings });
    document.getElementById('headerTitle').textContent = state.settings.businessName;
    document.getElementById('headerSub').textContent = state.settings.address + ' · ' + state.settings.ownerName;
    toast('Business details saved.');
  };
  function readImageToSettings(file, key) {
    const reader = new FileReader();
    reader.onload = async () => {
      state.settings[key] = reader.result;
      await dbPut('settings', { key: 'main', value: state.settings });
      const labels = { signatureImg: 'Signature', stampImg: 'Stamp', logoImg: 'Logo' };
      toast((labels[key] || 'Image') + ' saved.');
      if (key === 'logoImg') updateHeaderLogo();
      route();
    };
    reader.readAsDataURL(file);
  }
  document.getElementById('uploadSigBtn').onclick = () => document.getElementById('sigFile').click();
  document.getElementById('sigFile').addEventListener('change', (e) => { if (e.target.files[0]) readImageToSettings(e.target.files[0], 'signatureImg'); });
  document.getElementById('uploadStampBtn').onclick = () => document.getElementById('stampFile').click();
  document.getElementById('stampFile').addEventListener('change', (e) => { if (e.target.files[0]) readImageToSettings(e.target.files[0], 'stampImg'); });

  document.getElementById('saveInvoiceNumBtn').onclick = async () => {
    state.settings.invoicePrefix = document.getElementById('setInvoicePrefix').value.trim() || 'RR';
    state.settings.invoiceCounter = Math.max(1, Number(document.getElementById('setInvoiceCounter').value) || 1);
    await dbPut('settings', { key: 'main', value: state.settings });
    toast('Invoice numbering updated.');
    route();
  };

  document.getElementById('pinToggle').onchange = (e) => {
    state.settings.pinEnabled = e.target.checked;
    document.getElementById('pinSetupWrap').style.display = e.target.checked ? '' : 'none';
    dbPut('settings', { key: 'main', value: state.settings });
  };
  document.getElementById('savePinBtn').onclick = async () => {
    const pin = document.getElementById('setPin').value.trim();
    if (!/^\d{4}$/.test(pin)) { toast('PIN must be 4 digits.'); return; }
    state.settings.pin = pin;
    await dbPut('settings', { key: 'main', value: state.settings });
    toast('PIN saved.');
  };
  document.getElementById('exportBtn').onclick = exportBackup;
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
  });
  document.querySelectorAll('.theme-chip').forEach(chip => {
    chip.onclick = async () => {
      state.settings.theme = chip.dataset.themePick;
      applyTheme();
      await dbPut('settings', { key: 'main', value: state.settings });
      route();
    };
  });
  document.getElementById('uploadLogoBtn').onclick = () => document.getElementById('logoFile').click();
  document.getElementById('logoFile').addEventListener('change', (e) => { if (e.target.files[0]) readImageToSettings(e.target.files[0], 'logoImg'); });
}

function applyTheme() {
  document.body.setAttribute('data-theme', state.settings.theme);
  const icons = { light: '🌙', dark: '◐', gray: '☀️' };
  document.getElementById('themeToggle').textContent = icons[state.settings.theme] || '🌙';
}

function updateHeaderLogo() {
  const img = document.getElementById('headerLogo');
  if (!img) return;
  if (state.settings.logoImg) { img.src = state.settings.logoImg; img.style.display = ''; }
  else img.style.display = 'none';
}

/* ---------- Router ---------- */
let detailStack = { view: null, id: null };

function route() {
  const main = document.getElementById('main');
  let html = '';
  if (detailStack.view === 'customerDetail') {
    html = renderCustomerDetail(detailStack.id);
  } else {
    switch (state.view) {
      case 'dashboard': html = renderDashboard(); break;
      case 'rentals': html = renderRentals(); break;
      case 'customers': html = renderCustomers(); break;
      case 'invoices': html = renderInvoices(); break;
      case 'reports': html = renderReports(); break;
      case 'settings': html = renderSettings(); break;
    }
  }
  main.innerHTML = html;
  bindMainEvents();
  if (state.view === 'settings' && detailStack.view !== 'customerDetail') bindSettingsEvents();
  document.querySelectorAll('nav.bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
}

function bindMainEvents() {
  document.querySelectorAll('[data-open-rental]').forEach(el => {
    el.addEventListener('click', () => openRentalDetail(el.dataset.openRental));
  });
  document.querySelectorAll('[data-open-customer]').forEach(el => {
    el.addEventListener('click', () => { detailStack = { view: 'customerDetail', id: el.dataset.openCustomer }; route(); });
  });
  document.querySelectorAll('[data-back]').forEach(el => {
    el.addEventListener('click', () => { detailStack = { view: null, id: null }; state.view = el.dataset.back; route(); });
  });
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => { detailStack = { view: null, id: null }; state.view = el.dataset.nav; route(); });
  });
  document.querySelectorAll('[data-filter]').forEach(el => {
    el.addEventListener('click', () => { state.filter = el.dataset.filter; route(); });
  });
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.addEventListener('change', (e) => { state.sort = e.target.value; route(); });
}

/* ---------- Global init ---------- */
async function loadAllData() {
  state.rentals = await dbGetAll('rentals');
  state.customers = await dbGetAll('customers');
  state.frequentItems = (await dbGetAll('items')).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 12);
  const savedSettings = await dbGet('settings', 'main');
  if (savedSettings) state.settings = { ...state.settings, ...savedSettings.value };
}

async function init() {
  await openDB();
  await loadAllData();
  applyTheme();
  document.getElementById('headerTitle').textContent = state.settings.businessName;
  document.getElementById('headerSub').textContent = state.settings.address + ' · ' + state.settings.ownerName;
  updateHeaderLogo();

  if (state.settings.pinEnabled && state.settings.pin) showLockScreen();
  else document.getElementById('lockscreen').style.display = 'none';

  document.querySelectorAll('nav.bottomnav button').forEach(btn => {
    btn.addEventListener('click', () => {
      detailStack = { view: null, id: null };
      state.view = btn.dataset.view;
      state.filter = 'all';
      route();
    });
  });
  document.getElementById('fabAdd').addEventListener('click', () => openRentalForm(null));
  document.getElementById('themeToggle').addEventListener('click', () => {
    const order = ['light', 'dark', 'gray'];
    const idx = order.indexOf(state.settings.theme);
    state.settings.theme = order[(idx + 1) % order.length];
    applyTheme();
    dbPut('settings', { key: 'main', value: state.settings });
  });
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (state.view === 'dashboard') { state.view = 'rentals'; state.filter = 'all'; }
    route();
  });

  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
