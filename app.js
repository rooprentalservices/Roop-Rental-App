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
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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

const PRELOADED_ITEMS = ['8 ft Ladder', '10 ft Ladder', '15 ft Ladder', '20 ft Ladder', 'Drum', 'Fan', 'H Frame', 'Scaffolding Panel'];

/* ---------- Global State ---------- */
const state = {
  view: 'dashboard',
  rentals: [],
  customers: [],
  frequentItems: [],
  settings: {
    businessName: 'Roop Rental Services',
    ownerName: 'Adil Ansari',
    phone: '+91 9033819381',
    address: 'Ahmedabad, Gujarat',
    gst: '',
    theme: 'light',
    currency: '₹',
    defaultRent: 50,
    pin: '',
    pinEnabled: false
  },
  searchQuery: '',
  filter: 'all',
  sort: 'newest',
  editingId: null
};

/* ---------- Rental computations ---------- */
function itemTotal(item) {
  const days = daysBetween(item.startDate || todayISO(), item.actualReturn || null);
  return (Number(item.qty) || 0) * (Number(item.rentPerDay) || 0) * days;
}
function rentalItemsTotal(r) {
  return (r.items || []).reduce((sum, it) => sum + itemTotal(it), 0);
}
function rentalPaid(r) {
  const adv = Number(r.advanceAmount) || 0;
  const extra = (r.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return adv + extra;
}
function rentalGrandTotal(r) {
  return rentalItemsTotal(r) + (Number(r.oldDues) || 0) - (Number(r.refundAmount) || 0);
}
function rentalDue(r) {
  return Math.max(rentalGrandTotal(r) - rentalPaid(r), 0);
}
function itemReturnState(r) {
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
  const dueToday = active.filter(r => r.expectedReturnDate === today).length;
  const overdue = active.filter(r => r.expectedReturnDate && r.expectedReturnDate < today && itemReturnState(r) !== 'returned').length;
  const pendingPayments = active.filter(r => rentalDue(r) > 0).length;
  const monthStart = today.slice(0, 7);
  const monthlyRevenue = active.filter(r => (r.date || '').startsWith(monthStart)).reduce((s, r) => s + rentalPaid(r), 0);
  return { totalActive, todayRentals, dueToday, overdue, pendingPayments, monthlyRevenue };
}

function renderDashboard() {
  const s = computeStats();
  const active = state.rentals.filter(r => !r.deleted && !r.archived);
  const recent = [...active].sort((a, b) => b.createdAt - a.createdAt).slice(0, 7);
  return `
    <div class="stat-grid">
      <div class="stat-card accent"><div class="num">${s.totalActive}</div><div class="lbl">Active Rentals</div></div>
      <div class="stat-card"><div class="num">${s.todayRentals}</div><div class="lbl">Today's Rentals</div></div>
      <div class="stat-card"><div class="num">${s.dueToday}</div><div class="lbl">Due Today</div></div>
      <div class="stat-card"><div class="num" style="color:var(--red)">${s.overdue}</div><div class="lbl">Overdue</div></div>
      <div class="stat-card"><div class="num" style="color:var(--brown)">${s.pendingPayments}</div><div class="lbl">Pending Payments</div></div>
      <div class="stat-card"><div class="num">${fmtMoney(s.monthlyRevenue)}</div><div class="lbl">This Month Revenue</div></div>
    </div>
    <div class="section-title">Recent Rentals <a data-nav="rentals">View all</a></div>
    ${recent.length ? recent.map(rentalCardHTML).join('') : '<div class="empty">No rentals yet. Tap + to add one.</div>'}
  `;
}

function rentalCardHTML(r) {
  const badge = rentalStatusBadge(r);
  const due = rentalDue(r);
  const itemNames = (r.items || []).map(i => i.name).filter(Boolean).join(', ') || '—';
  return `
  <div class="card rental-card" data-open-rental="${r.id}">
    <div class="top">
      <div>
        <div class="name">${escapeHtml(r.customerName || 'No name')}</div>
        <div class="items">${escapeHtml(itemNames)}</div>
      </div>
      <span class="badge ${badge.cls}">${badge.label}</span>
    </div>
    <div class="meta">
      <span>📅 ${fmtDate(r.date)}</span>
      <span>↩️ ${fmtDate(r.expectedReturnDate)}</span>
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
    returnDate: (a, b) => (a.expectedReturnDate || '').localeCompare(b.expectedReturnDate || '')
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
    <div class="section-title">Rental History</div>
    ${rentals.length ? rentals.map(rentalCardHTML).join('') : '<div class="empty">No rental history.</div>'}
  `;
}


/* ---------- Reports ---------- */
function renderReports() {
  const active = state.rentals.filter(r => !r.deleted);
  const totalRentals = active.length;
  const totalBilled = active.reduce((s, r) => s + rentalGrandTotal(r), 0);
  const totalReceived = active.reduce((s, r) => s + rentalPaid(r), 0);
  const totalDue = active.reduce((s, r) => s + rentalDue(r), 0);
  const totalRefund = active.reduce((s, r) => s + (Number(r.refundAmount) || 0), 0);
  const avgRental = totalRentals ? Math.round(totalBilled / totalRentals) : 0;

  // top customers by business
  const byCustomer = {};
  active.forEach(r => {
    const key = r.customerName || 'Unknown';
    byCustomer[key] = (byCustomer[key] || 0) + rentalGrandTotal(r);
  });
  const topCustomers = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // most rented items
  const byItem = {};
  active.forEach(r => (r.items || []).forEach(i => { byItem[i.name] = (byItem[i.name] || 0) + (Number(i.qty) || 0); }));
  const topItems = Object.entries(byItem).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxItemQty = topItems.length ? topItems[0][1] : 1;

  // monthly revenue last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  const monthlyData = months.map(m => active.filter(r => (r.date || '').startsWith(m)).reduce((s, r) => s + rentalPaid(r), 0));
  const maxMonth = Math.max(...monthlyData, 1);

  return `
    <div class="page-header"><h2>Reports</h2></div>
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${totalRentals}</div><div class="lbl">Total Rentals</div></div>
      <div class="stat-card"><div class="num">${fmtMoney(totalBilled)}</div><div class="lbl">Total Billed</div></div>
      <div class="stat-card"><div class="num" style="color:var(--green)">${fmtMoney(totalReceived)}</div><div class="lbl">Total Received</div></div>
      <div class="stat-card"><div class="num" style="color:var(--red)">${fmtMoney(totalDue)}</div><div class="lbl">Total Due</div></div>
      <div class="stat-card"><div class="num">${fmtMoney(totalRefund)}</div><div class="lbl">Refunds Given</div></div>
      <div class="stat-card"><div class="num">${fmtMoney(avgRental)}</div><div class="lbl">Average Rental</div></div>
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

    <div class="section-title">Top Customers</div>
    <div class="card">
      ${topCustomers.length ? topCustomers.map(([name, val]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid var(--border);">
          <span>${escapeHtml(name)}</span><b>${fmtMoney(val)}</b>
        </div>`).join('') : '<div class="empty">No data yet.</div>'}
    </div>

    <div class="section-title">Most Rented Items</div>
    <div class="card">
      ${topItems.length ? topItems.map(([name, qty]) => `
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px;"><span>${escapeHtml(name)}</span><span>${qty}</span></div>
          <div style="background:var(--bg);border-radius:6px;height:8px;overflow:hidden;">
            <div style="width:${(qty/maxItemQty)*100}%;background:var(--indigo-800);height:100%;"></div>
          </div>
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
      <div class="field"><label>Owner Name</label><input id="setOwner" value="${escapeHtml(s.ownerName)}"></div>
      <div class="field"><label>Phone</label><input id="setPhone" value="${escapeHtml(s.phone)}"></div>
      <div class="field"><label>Address</label><input id="setAddress" value="${escapeHtml(s.address)}"></div>
      <div class="field"><label>GST Number (optional)</label><input id="setGst" value="${escapeHtml(s.gst)}"></div>
      <div class="field-row">
        <div class="field"><label>Currency Symbol</label><input id="setCurrency" value="${escapeHtml(s.currency)}"></div>
        <div class="field"><label>Default Rent/Day</label><input id="setDefaultRent" type="number" value="${s.defaultRent}"></div>
      </div>
      <button class="btn btn-primary" id="saveSettingsBtn">Save Business Details</button>
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
      <div class="field" style="display:flex;justify-content:space-between;align-items:center;">
        <label style="margin:0;">Dark Mode</label>
        <input type="checkbox" id="darkToggle" ${s.theme === 'dark' ? 'checked' : ''} style="width:20px;height:20px;">
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
    date: todayISO(), time: new Date().toTimeString().slice(0, 5),
    customerName: '', customerMobile: '', altMobile: '', customerAddress: '', deliveryAddress: '',
    transportMode: '', transporterName: '', transporterMobile: '',
    items: [blankItem()],
    advanceAmount: 0, advanceMode: 'Cash', refundAmount: 0, oldDues: 0, notes: '',
    expectedReturnDate: '', actualReturnDate: '',
    payments: [], kyc: [], archived: false, deleted: false
  };
}
function blankItem() {
  return { id: uid(), name: '', qty: 1, rentPerDay: state.settings.defaultRent || 0, startDate: todayISO(), returnedQty: 0, expectedReturn: '', actualReturn: '', remarks: '' };
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
  const grand = totalItems + (Number(r.oldDues) || 0) - (Number(r.refundAmount) || 0);
  const paid = (Number(r.advanceAmount) || 0) + (r.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const due = Math.max(grand - paid, 0);
  return `
  <div class="modal-handle"></div>
  <div class="page-header"><h2>${state.editingId ? 'Edit Rental' : 'New Rental'}</h2><button class="back-btn" id="closeForm">✕</button></div>

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

  <div class="section-title">Date &amp; Return</div>
  <div class="field-row">
    <div class="field"><label>Rental Date</label><input id="f_date" type="date" value="${r.date}"></div>
    <div class="field"><label>Time</label><input id="f_time" type="time" value="${r.time || ''}"></div>
  </div>
  <div class="field-row">
    <div class="field"><label>Expected Return Date</label><input id="f_expectedReturn" type="date" value="${r.expectedReturnDate || ''}"></div>
    <div class="field"><label>Actual Return Date</label><input id="f_actualReturn" type="date" value="${r.actualReturnDate || ''}"></div>
  </div>

  <div class="section-title">Items <a id="addItemBtn" style="cursor:pointer;">+ Add Item</a></div>
  <div id="itemsWrap">${r.items.map((it, idx) => itemRowHTML(it, idx)).join('')}</div>

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
  <div class="field"><label>Notes</label><textarea id="f_notes">${escapeHtml(r.notes)}</textarea></div>

  <div class="totals-box" id="totalsBox">
    <div class="row"><span>Items Total</span><span>${fmtMoney(totalItems)}</span></div>
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

function itemRowHTML(it, idx) {
  return `
  <div class="item-row" data-item-idx="${idx}">
    <button type="button" class="del-item" data-del-item="${idx}">✕</button>
    <div class="field">
      <label>Item Name</label>
      <input list="itemSuggestions" class="it-name" data-idx="${idx}" value="${escapeHtml(it.name)}" placeholder="Select or type item">
    </div>
    <div class="field-row">
      <div class="field"><label>Qty</label><input type="number" class="it-qty" data-idx="${idx}" value="${it.qty}"></div>
      <div class="field"><label>Rent/Day</label><input type="number" class="it-rate" data-idx="${idx}" value="${it.rentPerDay}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Start Date</label><input type="date" class="it-start" data-idx="${idx}" value="${it.startDate || ''}"></div>
      <div class="field"><label>Returned Qty</label><input type="number" class="it-retqty" data-idx="${idx}" value="${it.returnedQty || 0}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Expected Return</label><input type="date" class="it-expret" data-idx="${idx}" value="${it.expectedReturn || ''}"></div>
      <div class="field"><label>Actual Return</label><input type="date" class="it-actret" data-idx="${idx}" value="${it.actualReturn || ''}"></div>
    </div>
    <div class="field"><label>Remarks</label><input class="it-remarks" data-idx="${idx}" value="${escapeHtml(it.remarks || '')}"></div>
    <div style="font-size:12px;color:var(--text-soft);">Line total: <b>${fmtMoney(itemTotal(it))}</b></div>
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
  const grand = totalItems + (Number(formDraft.oldDues) || 0) - (Number(formDraft.refundAmount) || 0);
  const paid = (Number(formDraft.advanceAmount) || 0) + (formDraft.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const due = Math.max(grand - paid, 0);
  box.innerHTML = `
    <div class="row"><span>Items Total</span><span>${fmtMoney(totalItems)}</span></div>
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
    f_customerName: 'customerName', f_customerMobile: 'customerMobile', f_altMobile: 'altMobile',
    f_customerAddress: 'customerAddress', f_deliveryAddress: 'deliveryAddress', f_transportMode: 'transportMode',
    f_transporterName: 'transporterName', f_transporterMobile: 'transporterMobile', f_date: 'date', f_time: 'time',
    f_expectedReturn: 'expectedReturnDate', f_actualReturn: 'actualReturnDate', f_advance: 'advanceAmount',
    f_advanceMode: 'advanceMode', f_oldDues: 'oldDues', f_refund: 'refundAmount', f_notes: 'notes'
  };
  Object.entries(simpleFields).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      formDraft[key] = el.type === 'number' ? Number(el.value) : el.value;
      if (['f_advance', 'f_oldDues', 'f_refund'].includes(id)) refreshFormTotals();
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

  // items
  function bindItemRow(idx) {
    const row = document.querySelector(`.item-row[data-item-idx="${idx}"]`);
    if (!row) return;
    row.querySelector('.it-name').addEventListener('input', (e) => { formDraft.items[idx].name = e.target.value; });
    row.querySelector('.it-qty').addEventListener('input', (e) => { formDraft.items[idx].qty = Number(e.target.value); refreshFormTotals(); updateLineTotal(idx); });
    row.querySelector('.it-rate').addEventListener('input', (e) => { formDraft.items[idx].rentPerDay = Number(e.target.value); refreshFormTotals(); updateLineTotal(idx); });
    row.querySelector('.it-start').addEventListener('input', (e) => { formDraft.items[idx].startDate = e.target.value; refreshFormTotals(); updateLineTotal(idx); });
    row.querySelector('.it-retqty').addEventListener('input', (e) => { formDraft.items[idx].returnedQty = Number(e.target.value); });
    row.querySelector('.it-expret').addEventListener('input', (e) => { formDraft.items[idx].expectedReturn = e.target.value; syncExpectedReturn(); });
    row.querySelector('.it-actret').addEventListener('input', (e) => { formDraft.items[idx].actualReturn = e.target.value; refreshFormTotals(); updateLineTotal(idx); });
    row.querySelector('.it-remarks').addEventListener('input', (e) => { formDraft.items[idx].remarks = e.target.value; });
    const delBtn = row.querySelector('[data-del-item]');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (formDraft.items.length <= 1) { toast('At least one item row is required.'); return; }
      formDraft.items.splice(idx, 1);
      rerenderItems();
    });
  }
  function updateLineTotal(idx) {
    const row = document.querySelector(`.item-row[data-item-idx="${idx}"]`);
    if (!row) return;
    const el = row.lastElementChild;
    if (el) el.innerHTML = `Line total: <b>${fmtMoney(itemTotal(formDraft.items[idx]))}</b>`;
  }
  function syncExpectedReturn() {
    // rental-level expected return = latest item expected return
    const dates = formDraft.items.map(i => i.expectedReturn).filter(Boolean).sort();
    if (dates.length) formDraft.expectedReturnDate = dates[dates.length - 1];
  }
  function rerenderItems() {
    document.getElementById('itemsWrap').innerHTML = formDraft.items.map((it, idx) => itemRowHTML(it, idx)).join('');
    formDraft.items.forEach((_, idx) => bindItemRow(idx));
  }
  rerenderItems();
  document.getElementById('addItemBtn').onclick = () => { formDraft.items.push(blankItem()); rerenderItems(); };

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
    formDraft.items = formDraft.items.filter(i => i.name.trim());
    if (!formDraft.items.length) { toast('Add at least one item.'); return; }
    await dbPut('rentals', formDraft);
    const idx = state.rentals.findIndex(r => r.id === formDraft.id);
    if (idx >= 0) state.rentals[idx] = formDraft; else state.rentals.push(formDraft);
    await upsertCustomerFromRental(formDraft);
    for (const it of formDraft.items) await bumpFrequentItem(it.name);
    state.frequentItems = await dbGetAll('items');
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
  return `
  <div class="modal-handle"></div>
  <div class="page-header"><h2>Rental Details</h2><button class="back-btn" id="closeDetail">✕</button></div>
  <div class="card">
    <div class="top"><div class="name">${escapeHtml(r.customerName)}</div><span class="badge ${badge.cls}">${badge.label}</span></div>
    <div style="font-size:13px;line-height:1.8;margin-top:8px;">
      📞 <a href="tel:${r.customerMobile}">${escapeHtml(r.customerMobile || '—')}</a>${r.altMobile ? ' / ' + escapeHtml(r.altMobile) : ''}<br>
      📍 ${escapeHtml(r.customerAddress || '—')}<br>
      📅 Rental: ${fmtDate(r.date)} ${r.time ? '· ' + r.time : ''}<br>
      ↩️ Expected Return: ${fmtDate(r.expectedReturnDate)}<br>
      ${r.actualReturnDate ? `✅ Actual Return: ${fmtDate(r.actualReturnDate)}<br>` : ''}
      ${r.transporterName ? `🚚 ${escapeHtml(r.transporterName)} ${r.transporterMobile ? '(' + escapeHtml(r.transporterMobile) + ')' : ''}<br>` : ''}
    </div>
  </div>
  <div class="section-title">Items</div>
  <div class="card">
    ${r.items.map(it => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span>${escapeHtml(it.name)} × ${it.qty}${it.returnedQty ? ` (${it.returnedQty} returned)` : ''}</span>
        <span>${fmtMoney(itemTotal(it))}</span>
      </div>`).join('')}
  </div>
  <div class="totals-box">
    <div class="row"><span>Items Total</span><span>${fmtMoney(rentalItemsTotal(r))}</span></div>
    <div class="row"><span>+ Old Dues</span><span>${fmtMoney(r.oldDues)}</span></div>
    <div class="row"><span>- Refund</span><span>${fmtMoney(r.refundAmount)}</span></div>
    <div class="row"><span>Paid</span><span>${fmtMoney(rentalPaid(r))}</span></div>
    <div class="row big"><span>Balance Due</span><span>${fmtMoney(due)}</span></div>
  </div>
  ${r.notes ? `<div class="section-title">Notes</div><div class="card" style="font-size:13px;">${escapeHtml(r.notes)}</div>` : ''}
  ${(r.kyc || []).length ? `<div class="section-title">KYC Documents</div><div class="kyc-grid">${kycThumbsViewHTML(r.kyc)}</div>` : ''}

  <div class="section-title">Add Payment</div>
  <div class="card">
    <div class="field-row">
      <div class="field"><label>Amount</label><input id="payAmount" type="number"></div>
      <div class="field"><label>Mode</label>
        <select id="payMode">${['Cash', 'Online', 'UPI', 'Cheque', 'Bank Transfer'].map(m => `<option>${m}</option>`).join('')}</select>
      </div>
    </div>
    <button class="btn btn-outline" id="addPaymentBtn">+ Record Payment</button>
  </div>

  <div class="btn-row">
    <button class="btn btn-ghost" id="whatsappBtn">💬 WhatsApp</button>
    <button class="btn btn-ghost" id="invoiceBtn">🧾 Invoice</button>
  </div>
  <div class="btn-row">
    <button class="btn btn-outline" id="editRentalBtn">✏️ Edit</button>
    ${r.deleted
      ? `<button class="btn btn-outline" id="restoreBtn">♻️ Restore</button><button class="btn btn-danger" id="permDelBtn">Delete Forever</button>`
      : `<button class="btn btn-outline" id="archiveBtn">${r.archived ? '📤 Unarchive' : '📥 Archive'}</button><button class="btn btn-danger" id="deleteBtn">🗑 Delete</button>`}
  </div>
  `;
}
function kycThumbsViewHTML(kyc) {
  return kyc.map(k => `<div class="kyc-thumb">${k.type === 'application/pdf' ? `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:26px;">📄</div>` : `<img src="${k.dataUrl}">`}<div class="lbl">${escapeHtml(k.name)}</div></div>`).join('');
}

function buildWhatsAppText(r) {
  const s = state.settings;
  const lines = [
    `🧾 ${s.businessName}`,
    `Rental Details`,
    ``,
    `📅 Date: ${fmtDate(r.date)}`,
    `👤 Customer: ${r.customerName}`,
    `📞 Mobile: ${r.customerMobile || '—'}`,
    `📦 Items: ${r.items.map(i => i.name + ' x' + i.qty).join(', ')}`,
    `📅 Return Date: ${fmtDate(r.expectedReturnDate)}`,
    `💰 Total Amount: ${fmtMoney(rentalGrandTotal(r))}`,
    `💵 Advance: ${fmtMoney(r.advanceAmount)}`,
    `🧾 Due Amount: ${fmtMoney(rentalDue(r))}`,
    ``,
    `Thank you for your business.`,
    `${s.ownerName}`,
    `📞 ${s.phone}`,
    `${s.businessName}`,
    `${s.address}`
  ];
  return lines.join('\n');
}

function bindRentalDetailEvents(r) {
  document.getElementById('closeDetail').onclick = closeModal;
  document.getElementById('editRentalBtn').onclick = () => { closeModal(); openRentalForm(r.id); };
  document.getElementById('whatsappBtn').onclick = () => {
    const text = buildWhatsAppText(r);
    const phone = (r.customerMobile || '').replace(/\D/g, '');
    const url = `https://wa.me/${phone ? '91' + phone.slice(-10) : ''}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };
  document.getElementById('invoiceBtn').onclick = () => openInvoicePrint(r);
  document.getElementById('addPaymentBtn').onclick = async () => {
    const amt = Number(document.getElementById('payAmount').value);
    if (!amt) { toast('Enter an amount.'); return; }
    const mode = document.getElementById('payMode').value;
    r.payments = r.payments || [];
    r.payments.push({ amount: amt, mode, date: todayISO() });
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
  const rows = r.items.map(it => `<tr><td>${escapeHtml(it.name)}</td><td>${it.qty}</td><td>${fmtMoney(it.rentPerDay)}</td><td>${fmtMoney(itemTotal(it))}</td></tr>`).join('');
  w.document.write(`
    <html><head><title>Invoice - ${escapeHtml(r.customerName)}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;color:#161b33;}
      h1{margin-bottom:0;} .sub{color:#666;margin-top:2px;}
      table{width:100%;border-collapse:collapse;margin-top:16px;}
      th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px;}
      .totals{margin-top:14px;width:100%;max-width:300px;margin-left:auto;}
      .totals div{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;}
      .totals .grand{font-weight:bold;font-size:15px;border-top:1px solid #333;padding-top:6px;}
      .foot{margin-top:30px;font-size:12px;color:#666;}
    </style></head><body>
    <h1>${escapeHtml(s.businessName)}</h1>
    <div class="sub">${escapeHtml(s.address)} · ${escapeHtml(s.phone)}${s.gst ? ' · GST: ' + escapeHtml(s.gst) : ''}</div>
    <hr>
    <p><b>Customer:</b> ${escapeHtml(r.customerName)}<br>
    <b>Mobile:</b> ${escapeHtml(r.customerMobile || '—')}<br>
    <b>Address:</b> ${escapeHtml(r.customerAddress || '—')}<br>
    <b>Rental Date:</b> ${fmtDate(r.date)} &nbsp; <b>Return Date:</b> ${fmtDate(r.expectedReturnDate)}</p>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Rate/Day</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
      <div><span>Items Total</span><span>${fmtMoney(rentalItemsTotal(r))}</span></div>
      <div><span>Old Dues</span><span>${fmtMoney(r.oldDues)}</span></div>
      <div><span>Refund</span><span>-${fmtMoney(r.refundAmount)}</span></div>
      <div><span>Advance Paid</span><span>-${fmtMoney(rentalPaid(r))}</span></div>
      <div class="grand"><span>Balance Due</span><span>${fmtMoney(rentalDue(r))}</span></div>
    </div>
    <div class="foot">Thank you for your business.<br>${escapeHtml(s.ownerName)} · ${escapeHtml(s.phone)}</div>
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
    state.settings.ownerName = document.getElementById('setOwner').value;
    state.settings.phone = document.getElementById('setPhone').value;
    state.settings.address = document.getElementById('setAddress').value;
    state.settings.gst = document.getElementById('setGst').value;
    state.settings.currency = document.getElementById('setCurrency').value;
    state.settings.defaultRent = Number(document.getElementById('setDefaultRent').value);
    await dbPut('settings', { key: 'main', value: state.settings });
    document.getElementById('headerTitle').textContent = state.settings.businessName;
    document.getElementById('headerSub').textContent = state.settings.address + ' · ' + state.settings.ownerName;
    toast('Business details saved.');
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
  document.getElementById('darkToggle').onchange = (e) => {
    state.settings.theme = e.target.checked ? 'dark' : 'light';
    applyTheme();
    dbPut('settings', { key: 'main', value: state.settings });
  };
}

function applyTheme() {
  document.body.setAttribute('data-theme', state.settings.theme);
  document.getElementById('themeToggle').textContent = state.settings.theme === 'dark' ? '☀️' : '🌙';
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
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
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
