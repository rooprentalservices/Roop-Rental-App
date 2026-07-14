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

/* 12-hour AM/PM time picker (native <input type=time> shows 24hr on many Android devices) */
function time24to12(t) {
  let [h, m] = (t || '00:00').split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return { h12, m, ampm };
}
function time12to24(h12, m, ampm) {
  let h = Number(h12) % 12;
  if (ampm === 'PM') h += 12;
  return `${pad2(h)}:${pad2(m)}`;
}
function timePickerHTML(idPrefix, value24) {
  const t = time24to12(value24);
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const mins = Array.from({ length: 60 }, (_, i) => i);
  return `
  <div class="time-picker">
    <select class="tp-hour" id="${idPrefix}_h">${hours.map(h => `<option value="${h}" ${h === t.h12 ? 'selected' : ''}>${h}</option>`).join('')}</select>
    <span>:</span>
    <select class="tp-min" id="${idPrefix}_m">${mins.map(m => `<option value="${m}" ${m === t.m ? 'selected' : ''}>${pad2(m)}</option>`).join('')}</select>
    <select class="tp-ampm" id="${idPrefix}_ap">
      <option ${t.ampm === 'AM' ? 'selected' : ''}>AM</option>
      <option ${t.ampm === 'PM' ? 'selected' : ''}>PM</option>
    </select>
  </div>`;
}
function readTimePicker(idPrefix) {
  const h = Number(document.getElementById(idPrefix + '_h').value);
  const m = Number(document.getElementById(idPrefix + '_m').value);
  const ap = document.getElementById(idPrefix + '_ap').value;
  return time12to24(h, m, ap);
}
function bindTimePicker(idPrefix, onChange) {
  ['_h', '_m', '_ap'].forEach(suffix => {
    const el = document.getElementById(idPrefix + suffix);
    if (el) el.addEventListener('change', () => onChange(readTimePicker(idPrefix)));
  });
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

const DEFAULT_ITEM_CATALOG = [
  { name: 'H Frames', rate: 50, stock: 0 }, { name: 'Bracings', rate: 0, stock: 0 }, { name: 'Walkway Plank', rate: 20, stock: 0 },
  { name: 'Wheels', rate: 15, stock: 0 }, { name: 'Jack', rate: 25, stock: 0 }, { name: 'Ladder 6ft', rate: 30, stock: 0 },
  { name: 'Ladder 8ft', rate: 50, stock: 0 }, { name: 'Ladder 10ft', rate: 100, stock: 0 }, { name: 'Ladder 12ft', rate: 120, stock: 0 },
  { name: 'Ladder 15ft', rate: 200, stock: 0 }, { name: 'Ladder 18ft', rate: 300, stock: 0 }, { name: 'Ladder 20ft', rate: 300, stock: 0 },
  { name: 'Sidi 20ft', rate: 250, stock: 0 }, { name: 'Drum', rate: 50, stock: 0 }, { name: 'Jhula', rate: 150, stock: 0 }
];
function getItemCatalog() {
  return state.settings.itemCatalog && state.settings.itemCatalog.length ? state.settings.itemCatalog : DEFAULT_ITEM_CATALOG;
}
function getItemRatesMap() {
  const map = {};
  getItemCatalog().forEach(i => { map[i.name] = i.rate; });
  return map;
}

/* ---------- Global State ---------- */
const state = {
  view: 'rentals',
  settingsPage: null,
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
    logoImg: '',
    headerCollapsed: false,
    fabPosition: null,
    invoiceTerms: [
      'Rental charges are calculated from the delivery date until the actual return date.',
      'The customer is responsible for any loss, theft, or damage to rented items.',
      'Any damaged or missing item will be charged at replacement or repair cost.',
      'Transportation charges, if applicable, are payable by the customer.',
      'Payment is due as per the agreed rental terms.',
      'Subject to Ahmedabad, Gujarat jurisdiction only.',
      'Kindly preserve this invoice for future reference.'
    ],
    themeConfig: null, // filled in with defaultThemeConfig() below at first run
    itemCatalog: null, // filled in with DEFAULT_ITEM_CATALOG below at first run
    fingerprintEnabled: false,
    fingerprintCredentialId: '',
    whatsappReceiptTemplate: '',
    whatsappInvoiceTemplate: ''
  },
  searchQuery: '',
  filter: 'active',
  invoiceFilter: 'all',
  sort: 'newest',
  editingId: null
};

/* ---------- Theme Customization ---------- */
const ACCENT_PRESETS = {
  blue: '#2563eb', red: '#dc2626', green: '#16a34a', orange: '#f59e0b',
  purple: '#9333ea', teal: '#0d9488', black: '#1f2937'
};
const FONT_FAMILIES = {
  system: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  mono: "ui-monospace,'SF Mono',Menlo,monospace",
  rounded: "ui-rounded,'Segoe UI Rounded',-apple-system,sans-serif"
};
const FONT_SCALE = { small: 0.9, medium: 1, large: 1.15, xlarge: 1.3 };
const FONT_WEIGHT_MAP = { normal: 400, medium: 500, bold: 700 };
const CARD_PAD_MAP = { compact: '9px 11px', normal: '13px 14px', spacious: '18px 18px' };
const CARD_ELEVATION_MAP = {
  none: 'none', low: '0 1px 4px rgba(20,25,50,.06)',
  medium: '0 4px 14px rgba(20,25,50,.12)', high: '0 10px 28px rgba(20,25,50,.2)'
};
const BTN_RADIUS_MAP = { rounded: '14px', square: '6px' };
const BTN_PAD_MAP = { compact: '9px 10px', normal: '13px', large: '16px 18px' };
const ANIM_SPEED_MAP = { slow: '.32s', normal: '.15s', fast: '.06s' };

function defaultThemeConfig() {
  return {
    mode: 'light', // 'light' | 'dark' | 'gray' | 'system'
    accentPreset: 'orange',
    accentColor: ACCENT_PRESETS.orange,
    screenBg: '', cardBg: '',
    fontSize: 'medium', fontFamily: 'system', fontWeight: 'normal',
    cardRadius: 16, cardElevation: 'low', cardBorder: true, cardPadding: 'normal',
    buttonShape: 'rounded', buttonFill: 'filled', buttonSize: 'normal',
    dashboardDensity: 'comfortable',
    animationsEnabled: true, animationSpeed: 'normal'
  };
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return { r: 245, g: 158, b: 11 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(255 * f(0), 255 * f(8), 255 * f(4));
}
/* Accepts #hex, rgb(), rgba(), hsl() — returns a clean #rrggbb hex, or null if unparseable */
function parseColorToHex(input) {
  if (!input) return null;
  const s = input.trim();
  let m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(s);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return '#' + hex.toLowerCase();
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(s);
  if (m) return rgbToHex(+m[1], +m[2], +m[3]);
  m = /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/i.exec(s);
  if (m) return hslToHex(+m[1], +m[2], +m[3]);
  return null;
}
function shadeHex(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent);
  const nr = Math.round((t - r) * p) + r;
  const ng = Math.round((t - g) * p) + g;
  const nb = Math.round((t - b) * p) + b;
  return '#' + [nr, ng, nb].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
function isDarkColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

function effectiveThemeMode() {
  const tc = state.settings.themeConfig;
  if (tc.mode === 'system') {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return tc.mode;
}

function applyThemeConfig() {
  const tc = state.settings.themeConfig;
  const mode = effectiveThemeMode();
  document.body.setAttribute('data-theme', mode);
  const root = document.documentElement.style;

  // accent color drives buttons, FAB, header band, active states, links, charts
  const accent = tc.accentColor || ACCENT_PRESETS.orange;
  root.setProperty('--amber', accent);
  root.setProperty('--amber-dark', shadeHex(accent, -0.35));
  root.setProperty('--amber-light', shadeHex(accent, 0.35));
  const headerDark1 = shadeHex(accent, -0.72);
  const headerDark2 = shadeHex(accent, -0.6);
  root.setProperty('--indigo-900', mode === 'dark' ? headerDark1 : headerDark1);
  root.setProperty('--indigo-800', headerDark2);

  // backgrounds
  if (tc.screenBg) root.setProperty('--bg', tc.screenBg);
  else root.removeProperty('--bg');
  if (tc.cardBg) root.setProperty('--card', tc.cardBg);
  else root.removeProperty('--card');

  // fonts
  root.setProperty('--app-font-family', FONT_FAMILIES[tc.fontFamily] || FONT_FAMILIES.system);
  root.setProperty('--app-font-weight', FONT_WEIGHT_MAP[tc.fontWeight] || 400);
  document.getElementById('app').style.zoom = FONT_SCALE[tc.fontSize] || 1;

  // card design
  root.setProperty('--radius', (tc.cardRadius || 16) + 'px');
  root.setProperty('--card-shadow', CARD_ELEVATION_MAP[tc.cardElevation] || CARD_ELEVATION_MAP.low);
  root.setProperty('--card-border-w', tc.cardBorder === false ? '0px' : '1px');
  root.setProperty('--card-pad', CARD_PAD_MAP[tc.cardPadding] || CARD_PAD_MAP.normal);

  // buttons
  root.setProperty('--btn-radius', BTN_RADIUS_MAP[tc.buttonShape] || BTN_RADIUS_MAP.rounded);
  root.setProperty('--btn-pad', BTN_PAD_MAP[tc.buttonSize] || BTN_PAD_MAP.normal);
  document.body.setAttribute('data-btn-fill', tc.buttonFill || 'filled');

  // dashboard density
  document.body.setAttribute('data-dash-density', tc.dashboardDensity || 'comfortable');

  // animations
  root.setProperty('--transition-duration', tc.animationsEnabled === false ? '0s' : (ANIM_SPEED_MAP[tc.animationSpeed] || ANIM_SPEED_MAP.normal));

  const icons = { light: '🌙', dark: '◐', gray: '⚙️', system: '⚙️' };
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = icons[tc.mode] || '🌙';
}

let systemThemeListenerBound = false;
function bindSystemThemeListener() {
  if (systemThemeListenerBound || !window.matchMedia) return;
  systemThemeListenerBound = true;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.themeConfig.mode === 'system') applyThemeConfig();
  });
}


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
    + transportBilledTotal(r) - (Number(r.discount) || 0);
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
  if (r.isDraft) return { cls: 'draft', label: 'Draft' };
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
    existing.homeAddress = r.customerAddress || existing.homeAddress || existing.address || '';
    await dbPut('customers', existing);
  } else {
    const c = {
      id: uid(), name: r.customerName, mobile: r.customerMobile || '', altMobile: r.altMobile || '',
      homeAddress: r.customerAddress || '', businessAddress: '', aadharPhotos: [], visitingCardPhotos: [],
      createdAt: Date.now()
    };
    state.customers.push(c);
    await dbPut('customers', c);
  }
}

function custHomeAddr(c) { return c.homeAddress || c.address || ''; }

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
  const catalog = getItemCatalog();
  return `
    <div class="stat-grid">
      <div class="stat-card accent"><div class="num">${s.totalActive}</div><div class="lbl">Active Rentals</div></div>
      <div class="stat-card"><div class="num">${s.todayRentals}</div><div class="lbl">Today's Rentals</div></div>
      <div class="stat-card"><div class="num" style="color:var(--brown)">${s.pendingPayments}</div><div class="lbl">Pending Payments</div></div>
      <div class="stat-card"><div class="num">${fmtMoney(s.monthlyRevenue)}</div><div class="lbl">This Month Revenue</div></div>
    </div>
    <div class="section-title">📦 Stock <span style="font-weight:400;color:var(--text-soft);font-size:11.5px;">(auto-updates as items go out/return)</span></div>
    ${catalog.length ? `<div class="card"><div id="stockList">${stockRowsHTML(catalog)}</div></div>` : '<div class="empty">No items in your catalog yet — add some in Settings → Manage Items.</div>'}
  `;
}

function stockRowsHTML(catalog) {
  return catalog.map((it, idx) => `
    <div class="stock-row" data-stock-idx="${idx}">
      <div class="stock-name">${escapeHtml(it.name)}</div>
      <div class="stock-qty ${(it.stock || 0) <= 0 ? 'low' : ''}">${it.stock || 0}</div>
      <button type="button" class="stock-btn stock-minus" data-idx="${idx}" title="Manual stock out">− Out</button>
      <button type="button" class="stock-btn stock-plus" data-idx="${idx}" title="Manual stock in">+ In</button>
    </div>`).join('');
}

async function adjustStock(itemName, delta) {
  const catalog = getItemCatalog();
  const idx = catalog.findIndex(i => i.name === itemName);
  if (idx < 0) return;
  catalog[idx].stock = (catalog[idx].stock || 0) + delta;
  state.settings.itemCatalog = catalog;
  await dbPut('settings', { key: 'main', value: state.settings });
}

function bindStockRows() {
  document.querySelectorAll('.stock-minus').forEach(btn => {
    btn.onclick = async () => {
      const amt = Number(prompt('Reduce stock by how many? (manual stock-out)', '1'));
      if (!amt || amt <= 0) return;
      const catalog = getItemCatalog();
      await adjustStock(catalog[Number(btn.dataset.idx)].name, -amt);
      route();
    };
  });
  document.querySelectorAll('.stock-plus').forEach(btn => {
    btn.onclick = async () => {
      const amt = Number(prompt('Add how many back to stock? (manual stock-in)', '1'));
      if (!amt || amt <= 0) return;
      const catalog = getItemCatalog();
      await adjustStock(catalog[Number(btn.dataset.idx)].name, amt);
      route();
    };
  });
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
  <div class="card rental-card compact-card" data-open-rental="${r.id}">
    <div class="top">
      <div>
        <div class="name">${escapeHtml(r.customerName || 'No name')}</div>
        <div class="items">${escapeHtml(itemPreview)}</div>
      </div>
      <span class="badge ${badge.cls}">${badge.label}</span>
    </div>
    <div class="meta">
      <span>${r.invoiceNumber ? '#' + escapeHtml(r.invoiceNumber) : 'Not invoiced'}</span>
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
    if (state.filter === 'active') return itemReturnState(r) !== 'returned' && !r.archived;
    if (state.filter === 'returned') return itemReturnState(r) === 'returned' && !r.archived;
    if (state.filter === 'pending') return rentalDue(r) > 0 && !r.archived;
    return true; // 'all' — everything not deleted, including archived
  });
  if (q) {
    list = list.filter(r => {
      const hay = [r.customerName, r.customerMobile, r.altMobile, r.customerAddress, r.transporterName,
        r.notes, (r.items || []).map(i => i.name).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  const sortFns = {
    newest: (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt,
    oldest: (a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt - b.createdAt,
    nameAZ: (a, b) => (a.customerName || '').localeCompare(b.customerName || ''),
    nameZA: (a, b) => (b.customerName || '').localeCompare(a.customerName || ''),
    highestDue: (a, b) => rentalDue(b) - rentalDue(a),
    lowestDue: (a, b) => rentalDue(a) - rentalDue(b)
  };
  list.sort(sortFns[state.sort] || sortFns.newest);
  return list;
}

function renderRentals() {
  const list = filterRentals();
  const filters = [
    ['active', 'Rented'], ['returned', 'Returned'], ['pending', 'Payment Due'], ['trash', 'Trash'], ['all', 'All']
  ];
  const sorts = [['newest', 'Rental Date: New to Old'], ['oldest', 'Rental Date: Old to New'], ['nameAZ', 'Name A-Z'], ['nameZA', 'Name Z-A'],
    ['highestDue', 'Highest Due'], ['lowestDue', 'Lowest Due']];
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
  if (q) list = list.filter(c => (c.name + c.mobile + custHomeAddr(c) + (c.businessAddress||'')).toLowerCase().includes(q));
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return `
    <div class="page-header"><h2>Customers</h2><button class="btn btn-primary btn-sm" id="newCustomerBtn">+ New</button></div>
    ${list.length ? list.map(c => {
      const rentals = state.rentals.filter(r => !r.deleted && (r.customerMobile === c.mobile || r.customerName === c.name));
      const totalDue = rentals.reduce((s, r) => s + rentalDue(r), 0);
      return `<div class="card compact-card" data-open-customer="${c.id}">
        <div class="top">
          <div style="display:flex;align-items:center;gap:9px;">
            <div style="width:32px;height:32px;border-radius:50%;overflow:hidden;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">
              ${c.photo ? `<img src="${c.photo}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
            </div>
            <div>
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="items">${escapeHtml(c.mobile || 'No mobile')}${custHomeAddr(c) ? ' · ' + escapeHtml(truncate(custHomeAddr(c), 26)) : ''}</div>
            </div>
          </div>
          ${totalDue > 0 ? `<span class="due-amt">Due ${fmtMoney(totalDue)}</span>` : `<span class="due-amt clear">Paid</span>`}
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
    if (Number(r.advanceAmount) > 0) ledger.push({ date: r.advanceDate || r.date, amount: r.advanceAmount, mode: r.advanceMode || 'Cash', invoiceNumber: r.invoiceNumber });
    (r.payments || []).forEach(p => ledger.push({ date: p.date, amount: p.amount, mode: p.mode, invoiceNumber: r.invoiceNumber }));
  });
  ledger.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return `
    <div class="page-header"><button class="back-btn" data-back="customers">←</button><h2>${escapeHtml(c.name)}</h2></div>
    ${c.photo ? `<div style="text-align:center;margin-bottom:12px;"><img src="${c.photo}" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid var(--card);box-shadow:0 4px 12px rgba(0,0,0,.12);"></div>` : ''}
    <div class="card">
      <div style="font-size:13px;line-height:1.7;">
        📞 <a href="tel:${c.mobile}">${escapeHtml(c.mobile || '—')}</a>${c.altMobile ? ' / ' + escapeHtml(c.altMobile) : ''}<br>
        📍 Home: ${escapeHtml(custHomeAddr(c) || '—')}<br>
        ${c.businessAddress ? `🏢 Business: ${escapeHtml(c.businessAddress)}<br>` : ''}
        💼 Total Business: <b>${fmtMoney(totalBiz)}</b><br>
        ${totalDue > 0 ? `⚠️ Outstanding: <b style="color:var(--red)">${fmtMoney(totalDue)}</b>` : `✅ No outstanding dues`}
      </div>
      <button class="btn btn-outline btn-sm" id="editCustomerBtn" style="margin-top:10px;">✏️ Edit Customer Details</button>
    </div>

    ${(c.aadharPhotos || []).length ? `<div class="section-title">Aadhar Card</div><div class="kyc-grid">${kycThumbsViewHTML(c.aadharPhotos)}</div>` : ''}
    ${(c.visitingCardPhotos || []).length ? `<div class="section-title">Visiting Card</div><div class="kyc-grid">${kycThumbsViewHTML(c.visitingCardPhotos)}</div>` : ''}

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

/* ---------- Customer Form (Add/Edit) ---------- */
function openCustomerForm(existingId) {
  customerFormDraft = existingId ? JSON.parse(JSON.stringify(state.customers.find(c => c.id === existingId))) : blankCustomer();
  customerFormDraft.aadharPhotos = customerFormDraft.aadharPhotos || [];
  customerFormDraft.visitingCardPhotos = customerFormDraft.visitingCardPhotos || [];
  if (customerFormDraft.homeAddress === undefined) customerFormDraft.homeAddress = customerFormDraft.address || '';
  renderModal(customerFormHTML(!!existingId));
  bindCustomerFormEvents(existingId);
  pushModalHistory();
}

function customerFormHTML(isEdit) {
  const c = customerFormDraft;
  return `
  <div class="modal-handle"></div>
  <div class="page-header"><h2>${isEdit ? 'Edit Customer' : 'New Customer'}</h2><button class="back-btn" id="closeCustForm">✕</button></div>

  <div class="section-title">Photo</div>
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px;">
    <div id="custPhotoPreview" style="width:66px;height:66px;border-radius:50%;overflow:hidden;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;">
      ${c.photo ? `<img src="${c.photo}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
    </div>
    <div class="btn-row" style="margin:0;flex:1;">
      <button class="btn btn-ghost btn-sm" id="custPhotoCameraBtn" type="button">📷 Camera</button>
      <button class="btn btn-ghost btn-sm" id="custPhotoGalleryBtn" type="button">🖼 Gallery</button>
      ${c.photo ? `<button class="btn btn-ghost btn-sm" id="custPhotoRemoveBtn" type="button">✕ Remove</button>` : ''}
    </div>
  </div>
  <input type="file" id="custPhotoCameraInput" accept="image/*" capture="user" style="display:none;">
  <input type="file" id="custPhotoGalleryInput" accept="image/*" style="display:none;">

  <div class="field"><label>Name</label><input id="cf_name" value="${escapeHtml(c.name)}"></div>
  <div class="field-row">
    <div class="field"><label>Mobile</label><input id="cf_mobile" value="${escapeHtml(c.mobile)}" inputmode="tel"></div>
    <div class="field"><label>Alt. Mobile</label><input id="cf_altMobile" value="${escapeHtml(c.altMobile)}" inputmode="tel"></div>
  </div>
  <div class="field"><label>Home Address</label><textarea id="cf_homeAddress">${escapeHtml(c.homeAddress)}</textarea></div>
  <div class="field"><label>Business Address</label><textarea id="cf_businessAddress">${escapeHtml(c.businessAddress)}</textarea></div>

  <div class="section-title">Aadhar Card</div>
  <div class="btn-row">
    <button class="btn btn-ghost btn-sm" id="aadharCameraBtn" type="button">📷 Camera</button>
    <button class="btn btn-ghost btn-sm" id="aadharGalleryBtn" type="button">🖼 Gallery</button>
  </div>
  <input type="file" id="aadharCameraInput" accept="image/*" capture="environment" style="display:none;">
  <input type="file" id="aadharGalleryInput" accept="image/*" multiple style="display:none;">
  <div class="kyc-grid" id="aadharGrid">${kycThumbsHTML(c.aadharPhotos)}</div>

  <div class="section-title">Visiting Card</div>
  <div class="btn-row">
    <button class="btn btn-ghost btn-sm" id="cardCameraBtn" type="button">📷 Camera</button>
    <button class="btn btn-ghost btn-sm" id="cardGalleryBtn" type="button">🖼 Gallery</button>
  </div>
  <input type="file" id="cardCameraInput" accept="image/*" capture="environment" style="display:none;">
  <input type="file" id="cardGalleryInput" accept="image/*" multiple style="display:none;">
  <div class="kyc-grid" id="cardGrid">${kycThumbsHTML(c.visitingCardPhotos)}</div>

  <div class="btn-row">
    <button class="btn btn-outline" id="cancelCustFormBtn">Cancel</button>
    <button class="btn btn-primary" id="saveCustomerBtn">Save Customer</button>
  </div>
  `;
}

function bindCustomerFormEvents(existingId) {
  document.getElementById('closeCustForm').onclick = closeModal;
  document.getElementById('cancelCustFormBtn').onclick = closeModal;

  const fields = {
    cf_name: 'name', cf_mobile: 'mobile', cf_altMobile: 'altMobile',
    cf_homeAddress: 'homeAddress', cf_businessAddress: 'businessAddress'
  };
  Object.entries(fields).forEach(([id, key]) => {
    document.getElementById(id).addEventListener('input', (e) => { customerFormDraft[key] = e.target.value; });
  });

  function refreshPhotoPreview() {
    const preview = document.getElementById('custPhotoPreview');
    preview.innerHTML = customerFormDraft.photo ? `<img src="${customerFormDraft.photo}" style="width:100%;height:100%;object-fit:cover;">` : '👤';
  }
  function handlePhotoFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      customerFormDraft.photo = reader.result;
      refreshPhotoPreview();
      rerenderCustPhotoButtons();
    };
    reader.readAsDataURL(file);
  }
  function rerenderCustPhotoButtons() {
    const wrap = document.getElementById('custPhotoCameraBtn').parentElement;
    wrap.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="custPhotoCameraBtn" type="button">📷 Camera</button>
      <button class="btn btn-ghost btn-sm" id="custPhotoGalleryBtn" type="button">🖼 Gallery</button>
      ${customerFormDraft.photo ? `<button class="btn btn-ghost btn-sm" id="custPhotoRemoveBtn" type="button">✕ Remove</button>` : ''}
    `;
    bindPhotoButtons();
  }
  function bindPhotoButtons() {
    document.getElementById('custPhotoCameraBtn').onclick = () => document.getElementById('custPhotoCameraInput').click();
    document.getElementById('custPhotoGalleryBtn').onclick = () => document.getElementById('custPhotoGalleryInput').click();
    const removeBtn = document.getElementById('custPhotoRemoveBtn');
    if (removeBtn) removeBtn.onclick = () => { customerFormDraft.photo = ''; refreshPhotoPreview(); rerenderCustPhotoButtons(); };
  }
  document.getElementById('custPhotoCameraInput').addEventListener('change', (e) => { if (e.target.files[0]) handlePhotoFile(e.target.files[0]); });
  document.getElementById('custPhotoGalleryInput').addEventListener('change', (e) => { if (e.target.files[0]) handlePhotoFile(e.target.files[0]); });
  bindPhotoButtons();

  function bindPhotoUpload(cameraBtnId, cameraInputId, galleryBtnId, galleryInputId, gridId, arrKey) {
    document.getElementById(cameraBtnId).onclick = () => document.getElementById(cameraInputId).click();
    document.getElementById(galleryBtnId).onclick = () => document.getElementById(galleryInputId).click();
    function handleFiles(files) {
      [...files].forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          customerFormDraft[arrKey].push({ id: uid(), name: file.name.split('.')[0], type: file.type, dataUrl: reader.result });
          document.getElementById(gridId).innerHTML = kycThumbsHTML(customerFormDraft[arrKey]);
          bindDeletes();
        };
        reader.readAsDataURL(file);
      });
    }
    document.getElementById(cameraInputId).addEventListener('change', (e) => handleFiles(e.target.files));
    document.getElementById(galleryInputId).addEventListener('change', (e) => handleFiles(e.target.files));
    function bindDeletes() {
      document.querySelectorAll(`#${gridId} [data-kyc-del]`).forEach(btn => {
        btn.onclick = (ev) => {
          ev.stopPropagation();
          customerFormDraft[arrKey].splice(Number(btn.dataset.kycDel), 1);
          document.getElementById(gridId).innerHTML = kycThumbsHTML(customerFormDraft[arrKey]);
          bindDeletes();
        };
      });
    }
    bindDeletes();
  }
  bindPhotoUpload('aadharCameraBtn', 'aadharCameraInput', 'aadharGalleryBtn', 'aadharGalleryInput', 'aadharGrid', 'aadharPhotos');
  bindPhotoUpload('cardCameraBtn', 'cardCameraInput', 'cardGalleryBtn', 'cardGalleryInput', 'cardGrid', 'visitingCardPhotos');

  document.getElementById('saveCustomerBtn').onclick = async () => {
    if (!customerFormDraft.name.trim()) { toast('Please enter a name.'); return; }
    await dbPut('customers', customerFormDraft);
    const idx = state.customers.findIndex(c => c.id === customerFormDraft.id);
    if (idx >= 0) state.customers[idx] = customerFormDraft; else state.customers.push(customerFormDraft);
    toast('Customer saved.');
    closeModal();
    if (existingId) { detailStack = { view: 'customerDetail', id: existingId }; }
    route();
  };
}


/* ---------- Invoices (dedicated view) ---------- */
function renderInvoices() {
  const q = state.searchQuery.trim().toLowerCase();
  let list = state.rentals.filter(r => !r.deleted && r.invoiceNumber);
  if (q) {
    list = list.filter(r => (r.invoiceNumber || '').toLowerCase().includes(q) || (r.customerName || '').toLowerCase().includes(q));
  }
  if (state.invoiceFilter === 'paid') list = list.filter(r => rentalDue(r) <= 0);
  else if (state.invoiceFilter === 'due') list = list.filter(r => rentalDue(r) > 0);
  list.sort((a, b) => b.createdAt - a.createdAt);
  const totalDue = list.reduce((s, r) => s + rentalDue(r), 0);
  const invFilters = [['all', 'All'], ['due', 'Due'], ['paid', 'Paid']];
  return `
    <div class="page-header"><h2>Invoices</h2></div>
    <div class="stat-grid" style="grid-template-columns:1fr 1fr;">
      <div class="stat-card" style="background:linear-gradient(135deg,#e0e7ff,#c7d2fe);"><div class="num" style="color:var(--indigo-900)">${list.length}</div><div class="lbl">Total Invoices</div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#fee2e2,#fecaca);"><div class="num" style="color:#b91c1c">${fmtMoney(totalDue)}</div><div class="lbl">Total Outstanding</div></div>
    </div>
    <div class="filter-scroll">
      ${invFilters.map(([v, l]) => `<div class="chip ${((state.invoiceFilter || 'all') === v) ? 'active' : ''}" data-invoice-filter="${v}">${l}</div>`).join('')}
    </div>
    ${list.length ? list.map(r => {
      const due = rentalDue(r);
      const names = (r.items || []).map(i => `${i.name} x${i.qty}`).slice(0, 2).join(', ');
      return `<div class="card compact-card" data-open-rental="${r.id}" style="cursor:pointer;">
        <div class="top">
          <div>
            <div class="name">#${escapeHtml(r.invoiceNumber || '—')} · ${escapeHtml(r.customerName || 'No name')}</div>
            <div class="items">${escapeHtml(names)}</div>
          </div>
          <span class="due-amt ${due <= 0 ? 'clear' : ''}">${due > 0 ? 'Due ' + fmtMoney(due) : 'Paid'}</span>
        </div>
        <div class="meta"><span>📅 ${fmtDate(r.invoiceDate || r.date)}</span><span>💰 ${fmtMoney(rentalGrandTotal(r))}</span>${r.deliveryAddress ? `<span>📍 ${escapeHtml(truncate(r.deliveryAddress, 28))}</span>` : ''}</div>
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
  `;
}

/* ---------- Settings ---------- */
function itemCatalogRowsHTML(catalog) {
  return catalog.map((it, idx) => `
    <div class="catalog-row" data-cat-idx="${idx}">
      <div class="catalog-reorder">
        <button type="button" class="cat-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" class="cat-down" data-idx="${idx}" ${idx === catalog.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
      <input class="cat-name" data-idx="${idx}" value="${escapeHtml(it.name)}" placeholder="Item name">
      <input class="cat-rate" type="number" data-idx="${idx}" value="${it.rate}" placeholder="Rate">
      <input class="cat-stock" type="number" data-idx="${idx}" value="${it.stock || 0}" placeholder="Stock">
      <button type="button" class="cat-del" data-idx="${idx}">✕</button>
    </div>`).join('');
}

const SETTINGS_MENU = [
  { id: 'business', icon: '🏢', title: 'Business Details', desc: 'Name, address, contact info, GST' },
  { id: 'logo', icon: '🖼️', title: 'App Logo', desc: 'Shown in header and on invoices' },
  { id: 'signature', icon: '✍️', title: 'Invoice Signature & Stamp', desc: 'Auto-added to every printed invoice' },
  { id: 'invoicing', icon: '🧾', title: 'Invoice Numbering', desc: 'Prefix and sequence for invoice numbers' },
  { id: 'items', icon: '📦', title: 'Manage Items', desc: 'Rental catalog, rates, and stock' },
  { id: 'applock', icon: '🔒', title: 'App Lock', desc: 'PIN or fingerprint to open the app' },
  { id: 'backup', icon: '💾', title: 'Backup & Restore', desc: 'Export or import all your data' },
  { id: 'theme', icon: '🎨', title: 'Theme Customization', desc: 'Colors, fonts, layout, and more' },
  { id: 'terms', icon: '📜', title: 'Terms & Conditions', desc: 'Shown on every printed invoice' },
  { id: 'whatsapp', icon: '💬', title: 'WhatsApp Templates', desc: 'Edit your Receipt and Invoice messages' }
];

function settingsPageHeader(title) {
  return `<div class="page-header"><button class="back-btn" id="settingsBackBtn">←</button><h2>${title}</h2></div>`;
}

function renderSettingsMenu() {
  return `
    <div class="page-header"><h2>Settings</h2></div>
    ${SETTINGS_MENU.map(m => `
      <div class="card settings-menu-item" data-settings-page="${m.id}">
        <div class="sm-icon">${m.icon}</div>
        <div class="sm-text">
          <div class="sm-title">${m.title}</div>
          <div class="sm-desc">${m.desc}</div>
        </div>
        <div class="sm-arrow">›</div>
      </div>`).join('')}
    <div style="text-align:center;color:var(--text-soft);font-size:11px;margin-top:20px;">Roop Rental Services App · v1.0</div>
  `;
}

function renderSettingsBusiness() {
  const s = state.settings;
  return `
    ${settingsPageHeader('Business Details')}
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
  `;
}

function renderSettingsLogo() {
  const s = state.settings;
  return `
    ${settingsPageHeader('App Logo')}
    <div class="card">
      <p style="font-size:12px;color:var(--text-soft);margin-top:0;">Shown in the app header and on your printed invoices.</p>
      ${s.logoImg ? `<img src="${s.logoImg}" style="max-height:60px;display:block;margin-bottom:8px;border-radius:10px;">` : ''}
      <button type="button" class="btn btn-ghost btn-sm" id="uploadLogoBtn">${s.logoImg ? 'Replace' : 'Upload'} Logo</button>
      <input type="file" id="logoFile" accept="image/*" style="display:none;">
    </div>
  `;
}

function renderSettingsSignature() {
  const s = state.settings;
  return `
    ${settingsPageHeader('Invoice Signature & Stamp')}
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
  `;
}

function renderSettingsInvoicing() {
  const s = state.settings;
  return `
    ${settingsPageHeader('Invoice Numbering')}
    <div class="card">
      <p style="font-size:12px;color:var(--text-soft);margin-top:0;">Every rental automatically gets the next invoice number once it's returned. Change these only if you need to realign the sequence.</p>
      <div class="field-row">
        <div class="field"><label>Prefix</label><input id="setInvoicePrefix" value="${escapeHtml(s.invoicePrefix || 'RR')}"></div>
        <div class="field"><label>Next Number</label><input id="setInvoiceCounter" type="number" value="${s.invoiceCounter || 1}"></div>
      </div>
      <div style="font-size:12px;color:var(--text-soft);margin:-6px 0 10px;">Next invoice will be: <b>${nextInvoiceNumber()}</b></div>
      <button class="btn btn-outline" id="saveInvoiceNumBtn">Save Numbering</button>
    </div>
  `;
}

function renderSettingsItems() {
  return `
    ${settingsPageHeader('Manage Items')}
    <div class="card">
      <p style="font-size:12px;color:var(--text-soft);margin-top:0;">These items, rates, and stock levels show up pre-filled every time you create a new rental. Use the arrows to reorder.</p>
      <div id="itemCatalogList">${itemCatalogRowsHTML(getItemCatalog())}</div>
      <div class="btn-row">
        <button class="btn btn-ghost btn-sm" id="addCatalogItemBtn" type="button">+ Add Item</button>
      </div>
      <button class="btn btn-primary" id="saveCatalogBtn" style="margin-top:8px;">Save Items</button>
    </div>
  `;
}

function renderSettingsAppLock() {
  const s = state.settings;
  return `
    ${settingsPageHeader('App Lock')}
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
    <div class="card">
      <div class="field" style="display:flex;justify-content:space-between;align-items:center;">
        <label style="margin:0;">Enable Fingerprint Lock</label>
        <input type="checkbox" id="fingerprintToggle" ${s.fingerprintEnabled ? 'checked' : ''} style="width:20px;height:20px;">
      </div>
      <p style="font-size:11.5px;color:var(--text-soft);margin:8px 0 0;">Uses your phone's built-in fingerprint/face unlock through the browser. If your device or browser doesn't support it, you'll get a message when you try to enable it.</p>
    </div>
  `;
}

function renderSettingsBackup() {
  return `
    ${settingsPageHeader('Backup & Restore')}
    <div class="card">
      <p style="font-size:12.5px;color:var(--text-soft);margin-top:0;">Data is stored only on this phone. Export a backup file regularly and keep it safe (Google Drive, WhatsApp to self, etc). Direct Google Drive sync isn't available in this app version — use manual export/import instead.</p>
      <div class="btn-row">
        <button class="btn btn-primary" id="exportBtn">⬇ Export Backup</button>
        <button class="btn btn-outline" id="importBtn">⬆ Import Backup</button>
      </div>
      <input type="file" id="importFile" accept="application/json" style="display:none;">
    </div>
  `;
}

function renderSettingsTheme() {
  const s = state.settings;
  const tc = s.themeConfig;
  const mode = effectiveThemeMode();
  return `
    ${settingsPageHeader('Theme Customization')}
    <div class="card">
      <label class="tc-label">Theme Mode</label>
      <div class="chip-row">
        <div class="chip theme-chip ${tc.mode === 'light' ? 'active' : ''}" data-tc="mode" data-val="light">☀️ Light</div>
        <div class="chip theme-chip ${tc.mode === 'dark' ? 'active' : ''}" data-tc="mode" data-val="dark">🌙 Dark</div>
        <div class="chip theme-chip ${tc.mode === 'gray' ? 'active' : ''}" data-tc="mode" data-val="gray">◐ Gray</div>
        <div class="chip theme-chip ${tc.mode === 'system' ? 'active' : ''}" data-tc="mode" data-val="system">⚙️ System</div>
      </div>

      <label class="tc-label">Accent Color</label>
      <div class="chip-row" id="accentPresetRow">
        ${Object.entries(ACCENT_PRESETS).map(([name, hex]) => `
          <div class="accent-swatch ${tc.accentPreset === name ? 'active' : ''}" data-accent-preset="${name}" data-accent-hex="${hex}" style="background:${hex};" title="${name}"></div>
        `).join('')}
        <label class="accent-swatch custom-swatch ${tc.accentPreset === 'custom' ? 'active' : ''}" style="background:${tc.accentColor};" title="Custom">
          🎨<input type="color" id="accentCustomPicker" value="${tc.accentColor}" style="opacity:0;position:absolute;width:1px;height:1px;">
        </label>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Custom Color Code</label>
          <input id="accentCodeInput" value="${tc.accentColor}" placeholder="#2196F3, rgb(33,150,243), hsl(210,90%,56%)">
        </div>
        <button class="btn btn-outline btn-sm" id="applyAccentCodeBtn" type="button" style="align-self:flex-end;margin-bottom:12px;">Apply</button>
      </div>
      <p id="accentCodeError" style="font-size:11px;color:var(--red);margin:-8px 0 8px;display:none;">Couldn't read that color — try #hex, rgb(), rgba(), or hsl().</p>

      <label class="tc-label">Background Colors <span style="font-weight:400;color:var(--text-soft);">(leave blank for theme default)</span></label>
      <div class="field-row">
        <div class="field"><label>Screen</label><input type="color" id="screenBgPicker" value="${tc.screenBg || (mode === 'dark' ? '#0b0e1f' : '#f3f4fa')}"></div>
        <div class="field"><label>Card</label><input type="color" id="cardBgPicker" value="${tc.cardBg || (mode === 'dark' ? '#161b33' : '#ffffff')}"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-outline btn-sm" id="clearBgBtn" type="button">Reset backgrounds to default</button>
      </div>

      <label class="tc-label">Font</label>
      <div class="chip-row">
        ${['small', 'medium', 'large', 'xlarge'].map(sz => `<div class="chip ${tc.fontSize === sz ? 'active' : ''}" data-tc="fontSize" data-val="${sz}">${sz[0].toUpperCase() + sz.slice(1)}</div>`).join('')}
      </div>
      <div class="chip-row">
        ${[['system', 'System'], ['serif', 'Serif'], ['mono', 'Mono'], ['rounded', 'Rounded']].map(([v, l]) => `<div class="chip ${tc.fontFamily === v ? 'active' : ''}" data-tc="fontFamily" data-val="${v}">${l}</div>`).join('')}
      </div>
      <div class="chip-row">
        ${[['normal', 'Normal'], ['medium', 'Medium'], ['bold', 'Bold']].map(([v, l]) => `<div class="chip ${tc.fontWeight === v ? 'active' : ''}" data-tc="fontWeight" data-val="${v}">${l}</div>`).join('')}
      </div>

      <label class="tc-label">Card Design</label>
      <div class="field">
        <label style="display:flex;justify-content:space-between;">Corner Radius <span>${tc.cardRadius}px</span></label>
        <input type="range" id="cardRadiusSlider" min="0" max="28" value="${tc.cardRadius}" style="width:100%;">
      </div>
      <div class="chip-row">
        ${[['none', 'No Shadow'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']].map(([v, l]) => `<div class="chip ${tc.cardElevation === v ? 'active' : ''}" data-tc="cardElevation" data-val="${v}">${l}</div>`).join('')}
      </div>
      <div class="chip-row">
        ${[['normal', 'Normal Padding'], ['compact', 'Compact'], ['spacious', 'Spacious']].map(([v, l]) => `<div class="chip ${tc.cardPadding === v ? 'active' : ''}" data-tc="cardPadding" data-val="${v}">${l}</div>`).join('')}
      </div>
      <div class="field" style="display:flex;justify-content:space-between;align-items:center;">
        <label style="margin:0;">Card Border</label>
        <input type="checkbox" id="cardBorderToggle" ${tc.cardBorder !== false ? 'checked' : ''} style="width:20px;height:20px;">
      </div>

      <label class="tc-label">Buttons</label>
      <div class="chip-row">
        ${[['rounded', 'Rounded'], ['square', 'Square']].map(([v, l]) => `<div class="chip ${tc.buttonShape === v ? 'active' : ''}" data-tc="buttonShape" data-val="${v}">${l}</div>`).join('')}
      </div>
      <div class="chip-row">
        ${[['filled', 'Filled'], ['outlined', 'Outlined']].map(([v, l]) => `<div class="chip ${tc.buttonFill === v ? 'active' : ''}" data-tc="buttonFill" data-val="${v}">${l}</div>`).join('')}
      </div>
      <div class="chip-row">
        ${[['compact', 'Compact'], ['normal', 'Normal'], ['large', 'Large']].map(([v, l]) => `<div class="chip ${tc.buttonSize === v ? 'active' : ''}" data-tc="buttonSize" data-val="${v}">${l}</div>`).join('')}
      </div>

      <label class="tc-label">Dashboard Density</label>
      <div class="chip-row">
        ${[['comfortable', 'Comfortable'], ['compact', 'Compact']].map(([v, l]) => `<div class="chip ${tc.dashboardDensity === v ? 'active' : ''}" data-tc="dashboardDensity" data-val="${v}">${l}</div>`).join('')}
      </div>

      <label class="tc-label">Animations</label>
      <div class="field" style="display:flex;justify-content:space-between;align-items:center;">
        <label style="margin:0;">Enable Animations</label>
        <input type="checkbox" id="animEnabledToggle" ${tc.animationsEnabled !== false ? 'checked' : ''} style="width:20px;height:20px;">
      </div>
      <div class="chip-row">
        ${[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']].map(([v, l]) => `<div class="chip ${tc.animationSpeed === v ? 'active' : ''}" data-tc="animationSpeed" data-val="${v}">${l}</div>`).join('')}
      </div>

      <div class="btn-row" style="margin-top:16px;">
        <button class="btn btn-outline" id="resetThemeBtn">↺ Reset to Default</button>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" id="exportThemeBtn">⬇ Export Theme</button>
        <button class="btn btn-ghost" id="importThemeBtn">⬆ Import Theme</button>
      </div>
      <input type="file" id="importThemeFile" accept="application/json" style="display:none;">
      <p style="font-size:11px;color:var(--text-soft);margin:10px 0 0;">Note: icon shapes stay as emoji (works offline, no download needed) and aren't affected by these settings.</p>
    </div>
  `;
}

function termsRowsHTML(terms) {
  return (terms || []).map((t, idx) => `
    <div class="catalog-row" data-term-idx="${idx}">
      <textarea class="term-text" data-idx="${idx}" rows="2" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:9px;background:var(--card);color:var(--text);font-size:12.5px;">${escapeHtml(t)}</textarea>
      <button type="button" class="term-del" data-idx="${idx}">✕</button>
    </div>`).join('');
}

function renderSettingsTerms() {
  return `
    ${settingsPageHeader('Terms & Conditions')}
    <div class="card">
      <p style="font-size:12px;color:var(--text-soft);margin-top:0;">These lines print at the bottom of every invoice, numbered in order.</p>
      <div id="termsList">${termsRowsHTML(state.settings.invoiceTerms)}</div>
      <div class="btn-row">
        <button class="btn btn-ghost btn-sm" id="addTermBtn" type="button">+ Add Clause</button>
      </div>
      <button class="btn btn-primary" id="saveTermsBtn" style="margin-top:8px;">Save Terms</button>
    </div>
  `;
}

function renderSettingsWhatsApp() {
  const s = state.settings;
  const placeholders = '{businessName} {tagline} {ownerName} {phone} {address} {customerName} {mobile} {deliveryAddress} {items} {advance} {invoiceNumber} {rentalDate} {returnDate} {rentalDays} {totalCharges} {balance} {paymentStatus}';
  return `
    ${settingsPageHeader('WhatsApp Templates')}
    <div class="card">
      <p style="font-size:12px;color:var(--text-soft);margin-top:0;">Customize the exact wording sent for future entries. Available placeholders (keep the curly braces):</p>
      <p style="font-size:10.5px;color:var(--text-soft);background:var(--bg);padding:8px;border-radius:8px;word-break:break-word;">${placeholders}</p>
      <label class="tc-label">Receipt Message</label>
      <textarea id="waReceiptTemplate" rows="10" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--card);color:var(--text);font-size:12.5px;font-family:monospace;">${escapeHtml(s.whatsappReceiptTemplate || defaultReceiptTemplate())}</textarea>
      <div class="btn-row">
        <button class="btn btn-outline btn-sm" id="resetReceiptTplBtn" type="button">Reset to Default</button>
      </div>
      <label class="tc-label">Invoice Message</label>
      <textarea id="waInvoiceTemplate" rows="14" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--card);color:var(--text);font-size:12.5px;font-family:monospace;">${escapeHtml(s.whatsappInvoiceTemplate || defaultInvoiceTemplate())}</textarea>
      <div class="btn-row">
        <button class="btn btn-outline btn-sm" id="resetInvoiceTplBtn" type="button">Reset to Default</button>
      </div>
      <button class="btn btn-primary" id="saveWaTemplatesBtn" style="margin-top:8px;">Save Templates</button>
    </div>
  `;
}

function renderSettings() {
  switch (state.settingsPage) {
    case 'business': return renderSettingsBusiness();
    case 'logo': return renderSettingsLogo();
    case 'signature': return renderSettingsSignature();
    case 'invoicing': return renderSettingsInvoicing();
    case 'items': return renderSettingsItems();
    case 'applock': return renderSettingsAppLock();
    case 'backup': return renderSettingsBackup();
    case 'theme': return renderSettingsTheme();
    case 'terms': return renderSettingsTerms();
    case 'whatsapp': return renderSettingsWhatsApp();
    default: return renderSettingsMenu();
  }
}

/* ---------- Rental Form (Add/Edit) ---------- */
let formDraft = null; // working copy of rental being added/edited
let customerFormDraft = null; // working copy of customer being added/edited
function blankCustomer() {
  return { id: uid(), name: '', mobile: '', altMobile: '', homeAddress: '', businessAddress: '', photo: '', aadharPhotos: [], visitingCardPhotos: [], createdAt: Date.now() };
}

function newBlankRental() {
  return {
    id: uid(), createdAt: Date.now(),
    invoiceNumber: '',
    invoiceDate: '',
    date: todayISO(), time: '10:00',
    customerName: '', customerInvoiceName: '', customerMobile: '', altMobile: '', customerAddress: '', deliveryAddress: '',
    transportMode: '', transporterName: '', transporterMobile: '', vehicleNumber: '',
    transportChargeDelivery: 0, transportDeliveryPaidBy: 'party',
    transportChargePickup: 0, transportPickupPaidBy: 'party',
    items: [],
    advanceAmount: 0, advanceMode: 'Cash', advanceDate: todayISO(), refundAmount: 0, oldDues: 0, discount: 0, notes: '',
    actualReturnDate: '', actualReturnTime: '22:00',
    payments: [], kyc: [], archived: false, deleted: false, isDraft: false
  };
}
function ensureInvoiceNumber(r) {
  if (!r.invoiceNumber) {
    r.invoiceNumber = nextInvoiceNumber();
    registerInvoiceNumberUsed(r.invoiceNumber);
  }
  if (!r.invoiceDate) r.invoiceDate = todayISO();
  return r.invoiceNumber;
}
function blankItem() {
  return { id: uid(), name: '', qty: 1, rentPerDay: 0, returnedQty: 0 };
}
function transportBilledTotal(r) {
  let t = 0;
  if (r.transportDeliveryPaidBy === 'me') t += Number(r.transportChargeDelivery) || 0;
  if (r.transportPickupPaidBy === 'me') t += Number(r.transportChargePickup) || 0;
  return t;
}

function openRentalForm(existingId) {
  formDraft = existingId ? JSON.parse(JSON.stringify(state.rentals.find(r => r.id === existingId))) : newBlankRental();
  state.editingId = existingId || null;
  renderModal(rentalFormHTML());
  bindRentalFormEvents();
  pushModalHistory();
}

function invoiceNumBlockHTML(r) {
  if (!r.actualReturnDate) {
    return `<div class="card" style="font-size:12.5px;color:var(--text-soft);padding:12px 14px;">📋 This is an active rental — no invoice number yet. Once you set a <b>Return Date</b> below, it will automatically be assigned an invoice number and move to the Invoices tab.</div>`;
  }
  const previewNum = r.invoiceNumber || nextInvoiceNumber();
  return `
  <div class="field-row">
    <div class="field"><label>Invoice Number</label><input id="f_invoiceNumber" value="${escapeHtml(previewNum)}"></div>
    <div class="field"><label>Invoice Date</label><input id="f_invoiceDate" type="date" value="${r.invoiceDate || todayISO()}"></div>
  </div>`;
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

  <div id="invoiceNumWrap">${invoiceNumBlockHTML(r)}</div>

  <div class="section-title">Customer</div>
  <div class="field" style="position:relative;">
    <label>Customer Name</label>
    <input id="f_customerName" value="${escapeHtml(r.customerName)}" autocomplete="off" placeholder="Type to search saved customers">
    <div id="custAutofill"></div>
  </div>
  <div class="field"><label>Name for Invoice <span style="font-weight:400;color:var(--text-soft);">(if different)</span></label><input id="f_customerInvoiceName" value="${escapeHtml(r.customerInvoiceName || '')}" placeholder="Leave blank to use Customer Name above"></div>
  <div class="field-row">
    <div class="field"><label>Mobile</label><input id="f_customerMobile" value="${escapeHtml(r.customerMobile)}" inputmode="tel"></div>
    <div class="field"><label>Alt. Mobile</label><input id="f_altMobile" value="${escapeHtml(r.altMobile)}" inputmode="tel"></div>
  </div>
  <div class="btn-row" style="margin-top:-4px;margin-bottom:12px;">
    <button class="btn btn-ghost btn-sm" id="pickContactBtn" type="button">📇 Pick from Contacts</button>
  </div>
  <div class="field"><label>Customer Address</label><textarea id="f_customerAddress">${escapeHtml(r.customerAddress)}</textarea></div>
  <div class="field"><label>Delivery Address</label><textarea id="f_deliveryAddress">${escapeHtml(r.deliveryAddress)}</textarea></div>
  <div id="bizAddrHint"></div>

  <div class="section-title">Transport</div>
  <div class="field"><label>Mode of Transport</label><input id="f_transportMode" value="${escapeHtml(r.transportMode)}" placeholder="e.g. Tempo, Auto, Own Vehicle"></div>
  <div class="field-row">
    <div class="field"><label>Transporter Name</label><input id="f_transporterName" value="${escapeHtml(r.transporterName)}"></div>
    <div class="field"><label>Transporter Mobile</label><input id="f_transporterMobile" value="${escapeHtml(r.transporterMobile)}" inputmode="tel"></div>
  </div>
  <div class="field"><label>Vehicle Number</label><input id="f_vehicleNumber" value="${escapeHtml(r.vehicleNumber || '')}" placeholder="e.g. GJ01AB1234"></div>

  <div class="field"><label>Transportation Charge — Delivery</label><input id="f_transportChargeDelivery" type="number" value="${r.transportChargeDelivery || 0}"></div>
  <div class="chip-row" id="deliveryPaidByChips">
    <div class="chip ${r.transportDeliveryPaidBy === 'me' ? 'active' : ''}" data-paidby-group="delivery" data-paidby-val="me">Paid by Me</div>
    <div class="chip ${r.transportDeliveryPaidBy !== 'me' ? 'active' : ''}" data-paidby-group="delivery" data-paidby-val="party">Paid by Party</div>
  </div>

  <div class="field"><label>Transportation Charge — Pickup</label><input id="f_transportChargePickup" type="number" value="${r.transportChargePickup || 0}"></div>
  <div class="chip-row" id="pickupPaidByChips">
    <div class="chip ${r.transportPickupPaidBy === 'me' ? 'active' : ''}" data-paidby-group="pickup" data-paidby-val="me">Paid by Me</div>
    <div class="chip ${r.transportPickupPaidBy !== 'me' ? 'active' : ''}" data-paidby-group="pickup" data-paidby-val="party">Paid by Party</div>
  </div>
  <div style="font-size:11.5px;color:var(--text-soft);margin:-4px 0 12px;">"Paid by Me" charges are added to the customer's bill automatically. "Paid by Party" is just for your record and isn't billed.</div>

  <div class="section-title">Rental Date &amp; Time</div>
  <div class="field-row">
    <div class="field"><label>Rental Date</label><input id="f_date" type="date" value="${r.date}"></div>
    <div class="field"><label>Time</label>${timePickerHTML('f_time_tp', r.time || '10:00')}</div>
  </div>

  <div class="section-title">Return Date &amp; Time</div>
  <div class="field-row">
    <div class="field"><label>Return Date</label><input id="f_actualReturn" type="date" value="${r.actualReturnDate || ''}"></div>
    <div class="field"><label>Return Time</label>${timePickerHTML('f_retTime_tp', r.actualReturnTime || '22:00')}</div>
  </div>
  <div style="font-size:12px;color:var(--text-soft);margin:-6px 0 12px;">Rental Days (auto-calculated): <b id="rentalDaysDisplay">${rentalDays(r)}</b>${r.actualReturnDate ? '' : ' (still ongoing — counted till today)'}</div>

  <div class="section-title">Items — just enter quantity</div>
  <div class="card" id="stdItemsWrap">${standardItemsHTML(r.items)}</div>

  <div class="section-title">Other / Custom Items <a id="addItemBtn" style="cursor:pointer;">+ Add Item</a></div>
  <div id="itemsWrap">${customItemsHTML(r.items)}</div>

  <div class="section-title">Payment</div>
  <div class="field-row">
    <div class="field"><label>Advance Amount</label><input id="f_advance" type="number" value="${r.advanceAmount}"></div>
    <div class="field"><label>Advance Date</label><input id="f_advanceDate" type="date" value="${r.advanceDate || todayISO()}"></div>
  </div>
  <div class="field"><label>Advance Mode</label>
    <select id="f_advanceMode">
      ${['Cash', 'Online', 'UPI', 'Cheque', 'Bank Transfer'].map(m => `<option ${r.advanceMode === m ? 'selected' : ''}>${m}</option>`).join('')}
    </select>
  </div>
  <div class="field-row">
    <div class="field"><label>Old Dues</label><input id="f_oldDues" type="number" value="${r.oldDues}"></div>
    <div class="field"><label>Refund Amount</label><input id="f_refund" type="number" value="${r.refundAmount}"></div>
  </div>
  <div class="field"><label>Discount</label><input id="f_discount" type="number" value="${r.discount || 0}"></div>
  <div class="field"><label>Notes</label><textarea id="f_notes">${escapeHtml(r.notes)}</textarea></div>

  <div class="totals-box" id="totalsBox">
    <div class="row"><span>Items Total</span><span>${fmtMoney(totalItems)}</span></div>
    <div class="row"><span>+ Transportation (billed)</span><span>${fmtMoney(transportBilledTotal(r))}</span></div>
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
  const rates = getItemRatesMap();
  return Object.keys(rates).map((name, idx) => {
    const entry = (items || []).find(it => it.name === name);
    const qty = entry ? entry.qty : '';
    const rate = entry ? entry.rentPerDay : rates[name];
    return `
    <div class="std-item-row" data-std-name="${escapeHtml(name)}">
      <div class="std-item-label">${escapeHtml(name)}</div>
      <input type="number" class="std-rate" value="${rate}">
      <span class="std-x">×</span>
      <input type="number" class="std-qty" data-qty-idx="${idx}" min="0" placeholder="0" value="${qty}" inputmode="numeric">
    </div>`;
  }).join('');
}

function customItemsHTML(items) {
  const rates = getItemRatesMap();
  const custom = (items || []).filter(it => !Object.prototype.hasOwnProperty.call(rates, it.name));
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
  const names = new Set(Object.keys(getItemRatesMap()));
  state.frequentItems.forEach(i => names.add(i.name));
  return `<datalist id="itemSuggestions">${[...names].map(n => `<option value="${escapeHtml(n)}">`).join('')}</datalist>`;
}

/* ---------- Modal ---------- */
let modalHistoryActive = false;
function pushModalHistory() {
  if (!modalHistoryActive) {
    history.pushState({ modal: true }, '');
    modalHistoryActive = true;
  }
}
function popModalHistoryIfNeeded() {
  if (modalHistoryActive) {
    modalHistoryActive = false;
    history.replaceState({ modal: false }, '');
  }
}
async function saveDraftSilently(draft) {
  if (!draft) return;
  const hasContent = (draft.customerName && draft.customerName.trim()) || (draft.items && draft.items.length > 0);
  if (!hasContent) return;
  draft.isDraft = true;
  await dbPut('rentals', draft);
  const idx = state.rentals.findIndex(r => r.id === draft.id);
  if (idx >= 0) state.rentals[idx] = draft; else state.rentals.push(draft);
  toast('Back pressed — draft saved automatically. Find it in Rentals to finish later.');
}

function renderModal(innerHTML) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-sheet">${itemSuggestionsHTML()}${innerHTML}</div></div>`;
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}
function closeModal() {
  popModalHistoryIfNeeded();
  document.getElementById('modalRoot').innerHTML = '';
  formDraft = null;
}

function showNumberPickerModal(numbers, onPick) {
  const div = document.createElement('div');
  div.className = 'modal-overlay';
  div.style.zIndex = '90';
  div.innerHTML = `<div class="modal-sheet" style="max-height:50vh;">
    <div class="modal-handle"></div>
    <div class="page-header"><h2>Select Number</h2></div>
    ${numbers.map(n => `<div class="card" data-num="${escapeHtml(n)}" style="cursor:pointer;">${escapeHtml(n)}</div>`).join('')}
  </div>`;
  document.body.appendChild(div);
  div.addEventListener('click', (e) => {
    if (e.target === div) { div.remove(); return; }
    const numDiv = e.target.closest('[data-num]');
    if (numDiv) { onPick(numDiv.dataset.num); div.remove(); }
  });
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
    <div class="row"><span>+ Transportation (billed)</span><span>${fmtMoney(transportBilledTotal(formDraft))}</span></div>
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
    f_customerName: 'customerName', f_customerInvoiceName: 'customerInvoiceName',
    f_customerMobile: 'customerMobile', f_altMobile: 'altMobile',
    f_customerAddress: 'customerAddress', f_deliveryAddress: 'deliveryAddress', f_transportMode: 'transportMode',
    f_transporterName: 'transporterName', f_transporterMobile: 'transporterMobile', f_vehicleNumber: 'vehicleNumber',
    f_transportChargeDelivery: 'transportChargeDelivery', f_transportChargePickup: 'transportChargePickup',
    f_date: 'date', f_actualReturn: 'actualReturnDate', f_advance: 'advanceAmount', f_advanceDate: 'advanceDate',
    f_advanceMode: 'advanceMode', f_oldDues: 'oldDues', f_refund: 'refundAmount', f_discount: 'discount', f_notes: 'notes'
  };
  const dateFields = ['f_date', 'f_actualReturn'];
  const totalsFields = ['f_advance', 'f_oldDues', 'f_refund', 'f_discount', 'f_transportChargeDelivery', 'f_transportChargePickup'];
  Object.entries(simpleFields).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      formDraft[key] = el.type === 'number' ? Number(el.value) : el.value;
      if (dateFields.includes(id)) refreshAll();
      else if (totalsFields.includes(id)) refreshFormTotals();
    });
  });

  bindTimePicker('f_time_tp', (val) => { formDraft.time = val; refreshAll(); });
  bindTimePicker('f_retTime_tp', (val) => { formDraft.actualReturnTime = val; refreshAll(); });

  document.querySelectorAll('[data-paidby-group]').forEach(chip => {
    chip.addEventListener('click', () => {
      const group = chip.dataset.paidbyGroup;
      const val = chip.dataset.paidbyVal;
      if (group === 'delivery') formDraft.transportDeliveryPaidBy = val;
      else formDraft.transportPickupPaidBy = val;
      document.querySelectorAll(`[data-paidby-group="${group}"]`).forEach(c => c.classList.toggle('active', c.dataset.paidbyVal === val));
      refreshFormTotals();
    });
  });

  // customer autofill
  const nameInput = document.getElementById('f_customerName');
  function updateBizAddrHint() {
    const hint = document.getElementById('bizAddrHint');
    if (!hint) return;
    if (formDraft._matchedBusinessAddress) {
      hint.innerHTML = `<div class="chip" id="useBizAddrChip" style="cursor:pointer;display:inline-block;margin-top:-6px;margin-bottom:10px;">🏢 Use business address for delivery</div>`;
      document.getElementById('useBizAddrChip').onclick = () => {
        formDraft.deliveryAddress = formDraft._matchedBusinessAddress;
        document.getElementById('f_deliveryAddress').value = formDraft._matchedBusinessAddress;
      };
    } else {
      hint.innerHTML = '';
    }
  }
  function applyCustomerMatch(c) {
    formDraft.customerName = c.name; formDraft.customerMobile = c.mobile || ''; formDraft.altMobile = c.altMobile || ''; formDraft.customerAddress = custHomeAddr(c);
    formDraft._matchedBusinessAddress = c.businessAddress || '';
    nameInput.value = c.name;
    document.getElementById('f_customerMobile').value = c.mobile || '';
    document.getElementById('f_altMobile').value = c.altMobile || '';
    document.getElementById('f_customerAddress').value = custHomeAddr(c);
    // pull "Name for Invoice" from their most recent rental that had one set
    const pastRentals = state.rentals.filter(r => !r.deleted && (r.customerMobile === c.mobile || r.customerName === c.name) && r.customerInvoiceName)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (pastRentals.length) {
      formDraft.customerInvoiceName = pastRentals[0].customerInvoiceName;
      const invNameEl = document.getElementById('f_customerInvoiceName');
      if (invNameEl) invNameEl.value = pastRentals[0].customerInvoiceName;
    }
    updateBizAddrHint();
  }
  nameInput.addEventListener('input', () => {
    const q = nameInput.value.trim().toLowerCase();
    const box = document.getElementById('custAutofill');
    if (!q) { box.innerHTML = ''; return; }
    const matches = state.customers.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5);
    if (!matches.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="autofill-list">${matches.map(c => `<div data-pick-cust="${c.id}"><b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.mobile || '')} ${escapeHtml(custHomeAddr(c))}</span></div>`).join('')}</div>`;
    box.querySelectorAll('[data-pick-cust]').forEach(el => {
      el.addEventListener('click', () => {
        const c = state.customers.find(x => x.id === el.dataset.pickCust);
        applyCustomerMatch(c);
        box.innerHTML = '';
      });
    });
  });

  // autofill by mobile number when typed manually
  const mobileInput = document.getElementById('f_customerMobile');
  mobileInput.addEventListener('input', () => {
    const digits = mobileInput.value.replace(/\D/g, '');
    if (digits.length < 10) return;
    const last10 = digits.slice(-10);
    const match = state.customers.find(c => (c.mobile || '').replace(/\D/g, '').slice(-10) === last10);
    if (match && !nameInput.value.trim()) {
      applyCustomerMatch(match);
      toast('Auto-filled from saved customer.');
    }
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
        document.getElementById('f_customerName').value = formDraft.customerName;
        const nums = (c.tel || []).filter(Boolean);
        if (nums.length > 1) {
          showNumberPickerModal(nums, (chosen) => {
            formDraft.customerMobile = chosen;
            document.getElementById('f_customerMobile').value = chosen;
          });
        } else if (nums.length === 1) {
          formDraft.customerMobile = nums[0];
          document.getElementById('f_customerMobile').value = nums[0];
        }
        toast('Tip: edit "Name for Invoice" above if this contact name isn\'t how it should print.');
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
    qtyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const nextIdx = Number(qtyInput.dataset.qtyIdx) + 1;
        const next = document.querySelector(`.std-qty[data-qty-idx="${nextIdx}"]`);
        if (next) { next.focus(); next.select(); }
        else qtyInput.blur();
      }
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
      const rates = getItemRatesMap();
      if (Object.prototype.hasOwnProperty.call(rates, e.target.value)) {
        item.rentPerDay = rates[e.target.value];
        row.querySelector('.it-rate').value = rates[e.target.value];
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
  function bindInvoiceNumFields() {
    const numEl = document.getElementById('f_invoiceNumber');
    const dateEl = document.getElementById('f_invoiceDate');
    if (numEl) numEl.addEventListener('input', (e) => { formDraft.invoiceNumber = e.target.value; });
    if (dateEl) dateEl.addEventListener('input', (e) => { formDraft.invoiceDate = e.target.value; });
  }
  bindInvoiceNumFields();

  function refreshAll() {
    const daysEl = document.getElementById('rentalDaysDisplay');
    if (daysEl) daysEl.textContent = rentalDays(formDraft);
    refreshFormTotals();
    formDraft.items.forEach(it => updateLineTotal(it.id));
    document.getElementById('invoiceNumWrap').innerHTML = invoiceNumBlockHTML(formDraft);
    bindInvoiceNumFields();
  }
  function rerenderCustomItems() {
    document.getElementById('itemsWrap').innerHTML = customItemsHTML(formDraft.items);
    formDraft.items.filter(it => !Object.prototype.hasOwnProperty.call(getItemRatesMap(), it.name)).forEach(it => bindItemRow(it.id));
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
    formDraft.isDraft = false;
    const isNew = !state.editingId;
    let assignedNow = false;
    if (formDraft.actualReturnDate && !formDraft.invoiceNumber) {
      ensureInvoiceNumber(formDraft);
      assignedNow = true;
    }
    if (isNew && !formDraft.stockDeducted) {
      for (const it of formDraft.items) await adjustStock(it.name, -(Number(it.qty) || 0));
      formDraft.stockDeducted = true;
    }
    if (formDraft.actualReturnDate && !formDraft.stockReturned) {
      for (const it of formDraft.items) await adjustStock(it.name, Number(it.qty) || 0);
      formDraft.stockReturned = true;
    }
    await dbPut('rentals', formDraft);
    const idx = state.rentals.findIndex(r => r.id === formDraft.id);
    if (idx >= 0) state.rentals[idx] = formDraft; else state.rentals.push(formDraft);
    await upsertCustomerFromRental(formDraft);
    for (const it of formDraft.items) await bumpFrequentItem(it.name);
    state.frequentItems = await dbGetAll('items');
    if (assignedNow) await dbPut('settings', { key: 'main', value: state.settings });
    toast(assignedNow ? `Returned — Invoice #${formDraft.invoiceNumber} generated.` : 'Rental saved.');
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
  pushModalHistory();
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
    <div style="font-size:12px;color:${r.invoiceNumber ? 'var(--amber-dark)' : 'var(--text-soft)'};font-weight:700;margin-top:2px;">${r.invoiceNumber ? `Invoice #${escapeHtml(r.invoiceNumber)}` : 'Not yet invoiced — set a Return Date'}</div>
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
    <div class="row"><span>+ Transportation (billed)</span><span>${fmtMoney(transportBilledTotal(r))}</span></div>
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
    <button class="btn btn-ghost btn-sm" id="copyReceiptBtn" title="Copy for a normal text message" style="flex:0 0 auto;">📋</button>
  </div>
  <div class="btn-row">
    <button class="btn btn-ghost" id="whatsappInvoiceBtn">🧾 WhatsApp Invoice</button>
    <button class="btn btn-ghost btn-sm" id="copyInvoiceBtn" title="Copy for a normal text message" style="flex:0 0 auto;">📋</button>
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
function defaultReceiptTemplate() {
  return [
    '🧾 {businessName}',
    'Rental Receipt',
    '',
    '📅 Rental Date: {rentalDate}',
    '👤 Customer Name: {customerName}',
    '📞 Mobile: {mobile}',
    '📍 Delivery Address: {deliveryAddress}',
    '',
    '📦 Items Issued on Rent:',
    '{items}',
    '',
    '💰 Advance Paid: {advance}',
    '',
    'Thank you for choosing {businessName}. We appreciate your trust and look forward to serving you again.',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '👨\u200d💼 {ownerName}',
    '📞 {phone}',
    '📍 {address}'
  ].join('\n');
}
function defaultInvoiceTemplate() {
  return [
    '🧾 {businessName}',
    'Rental Invoice #{invoiceNumber}',
    '',
    '👤 Customer Name: {customerName}',
    '📞 Mobile: {mobile}',
    '📍 Delivery Address: {deliveryAddress}',
    '',
    '📦 Items Rented:',
    '{items}',
    '',
    '📅 Rental Date: {rentalDate}',
    '📅 Return Date: {returnDate}',
    '📆 Rental Period: {rentalDays} Days',
    '',
    '💰 Total Rental Charges: {totalCharges}',
    '💵 Advance Paid: {advance}',
    '💳 Balance Amount: {balance}',
    '',
    '✅ Payment Status: {paymentStatus}',
    '',
    'Thank you for choosing {businessName}. We truly appreciate your business and look forward to serving you again.',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '👨\u200d💼 {ownerName}',
    '📞 {phone}',
    '📍 {address}'
  ].join('\n');
}
function renderTemplate(tpl, values) {
  return tpl.replace(/\{(\w+)\}/g, (m, key) => (key in values) ? values[key] : m);
}

function buildReceiptText(r) {
  const s = state.settings;
  const itemLines = r.items.map(i => `• ${i.name}: ${i.qty} Nos.`).join('\n');
  const values = {
    businessName: s.businessName, tagline: s.tagline || '', ownerName: s.ownerName, phone: s.phone, address: s.address,
    customerName: r.customerInvoiceName || r.customerName, mobile: r.customerMobile || '—',
    deliveryAddress: r.deliveryAddress || r.customerAddress || '—',
    items: itemLines, advance: fmtMoney(r.advanceAmount), invoiceNumber: r.invoiceNumber || '',
    rentalDate: fmtDate(r.date)
  };
  return renderTemplate(s.whatsappReceiptTemplate || defaultReceiptTemplate(), values);
}

function buildInvoiceText(r) {
  const s = state.settings;
  const itemLines = r.items.map(i => `• ${i.name}: ${i.qty} Nos.`).join('\n');
  const due = rentalDue(r);
  const values = {
    businessName: s.businessName, tagline: s.tagline || '', ownerName: s.ownerName, phone: s.phone, address: s.address,
    customerName: r.customerInvoiceName || r.customerName, mobile: r.customerMobile || '—',
    deliveryAddress: r.deliveryAddress || r.customerAddress || '—',
    items: itemLines, invoiceNumber: r.invoiceNumber || '',
    rentalDate: fmtDate(r.date), returnDate: r.actualReturnDate ? fmtDate(r.actualReturnDate) : 'Ongoing',
    rentalDays: String(rentalDays(r)), totalCharges: fmtMoney(rentalGrandTotal(r)),
    advance: fmtMoney(rentalPaid(r)), balance: fmtMoney(due),
    paymentStatus: due <= 0 ? 'Paid' : 'Pending'
  };
  return renderTemplate(s.whatsappInvoiceTemplate || defaultInvoiceTemplate(), values);
}

function sendWhatsApp(r, text) {
  const phone = (r.customerMobile || '').replace(/\D/g, '');
  const url = `https://wa.me/${phone ? '91' + phone.slice(-10) : ''}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied — paste it into any messaging app.');
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Copied — paste it into any messaging app.');
    } catch (e2) {
      toast('Could not copy automatically — please select and copy manually.');
    }
  }
}

function bindRentalDetailEvents(r) {
  document.getElementById('closeDetail').onclick = closeModal;
  document.getElementById('editRentalBtn').onclick = () => { closeModal(); openRentalForm(r.id); };
  document.getElementById('whatsappReceiptBtn').onclick = () => sendWhatsApp(r, buildReceiptText(r));
  document.getElementById('copyReceiptBtn').onclick = () => copyToClipboard(buildReceiptText(r));
  function requireReturned(action) {
    if (!r.actualReturnDate) { toast('Set a Return Date first — this becomes an invoice once the rental is returned.'); return; }
    action();
  }
  document.getElementById('whatsappInvoiceBtn').onclick = () => requireReturned(() => sendWhatsApp(r, buildInvoiceText(r)));
  document.getElementById('copyInvoiceBtn').onclick = () => requireReturned(() => copyToClipboard(buildInvoiceText(r)));
  document.getElementById('printInvoiceBtn').onclick = () => requireReturned(() => openInvoicePrint(r));
  document.getElementById('duplicateRentalBtn').onclick = () => {
    closeModal();
    formDraft = JSON.parse(JSON.stringify(r));
    formDraft.id = uid();
    formDraft.createdAt = Date.now();
    formDraft.invoiceNumber = '';
    formDraft.invoiceDate = '';
    formDraft.date = todayISO();
    formDraft.time = '10:00';
    formDraft.actualReturnDate = ''; formDraft.actualReturnTime = '22:00';
    formDraft.advanceAmount = 0; formDraft.refundAmount = 0; formDraft.payments = [];
    formDraft.kyc = []; formDraft.archived = false; formDraft.deleted = false; formDraft.isDraft = false;
    state.editingId = null;
    renderModal(rentalFormHTML());
    bindRentalFormEvents();
    pushModalHistory();
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
  const tc = s.themeConfig;
  const accent = tc.accentColor || '#f59e0b';
  const bandC1 = shadeHex(accent, -0.72);
  const bandC2 = shadeHex(accent, -0.6);
  const tintBg = shadeHex(accent, 0.92);
  const tintBorder = shadeHex(accent, 0.65);
  const w = window.open('', '_blank');
  const rows = r.items.map((it, i) => `<tr style="background:${i % 2 ? tintBg : '#ffffff'}"><td>${escapeHtml(it.name)}</td><td style="text-align:center;">${it.qty}</td><td style="text-align:right;">${fmtMoney(it.rentPerDay)}</td><td style="text-align:right;">${fmtMoney(itemTotal(it, r))}</td></tr>`).join('');
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
      .band{background:linear-gradient(135deg,${bandC1},${bandC2});color:#fff;padding:26px 32px 20px;position:relative;overflow:hidden;}
      .band::after{content:'';position:absolute;right:-40px;top:-40px;width:160px;height:160px;background:${accent}40;border-radius:50%;}
      .band-top{display:flex;align-items:center;gap:14px;}
      .band-top img{height:52px;width:52px;object-fit:contain;border-radius:12px;background:#fff;padding:4px;}
      .band h1{margin:0;font-size:21px;letter-spacing:.3px;}
      .band .tagline{opacity:.9;font-size:11.5px;margin-top:3px;font-style:italic;}
      .band .sub{opacity:.85;font-size:12px;margin-top:8px;line-height:1.6;}
      .invoice-tag{display:inline-block;background:${accent};color:${isDarkColor(accent) ? '#fff' : '#2b1400'};font-weight:800;font-size:12px;padding:4px 12px;border-radius:20px;margin-top:10px;}
      .body{padding:24px 32px 8px;}
      .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;background:${tintBg};border:1px solid ${tintBorder};border-radius:10px;padding:14px 16px;margin-bottom:18px;font-size:13px;}
      .meta-grid div span{display:block;color:${shadeHex(accent, -0.4)};font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;font-weight:700;}
      table{width:100%;border-collapse:collapse;margin-top:4px;border-radius:10px;overflow:hidden;}
      th{background:${bandC1};color:#fff;padding:10px 8px;font-size:12px;text-align:left;}
      th:nth-child(2){text-align:center;} th:nth-child(3),th:nth-child(4){text-align:right;}
      td{padding:9px 8px;font-size:13px;border-bottom:1px solid #eee;}
      .totals{margin-top:16px;width:100%;max-width:320px;margin-left:auto;background:${tintBg};border:1px solid ${tintBorder};border-radius:10px;padding:14px 16px;}
      .totals div{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;}
      .totals .grand{font-weight:800;font-size:16px;border-top:2px solid ${accent};padding-top:8px;margin-top:6px;color:${bandC1};}
      .terms{margin-top:22px;background:#f7f8fa;border:1px solid #e4e6f2;border-radius:10px;padding:14px 16px;}
      .terms h3{margin:0 0 8px;font-size:13px;color:${bandC1};}
      .terms ol{margin:0;padding-left:18px;}
      .terms li{font-size:11.5px;color:#444;line-height:1.6;margin-bottom:3px;}
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
          <div><span>Customer</span>${escapeHtml(r.customerInvoiceName || r.customerName)}</div>
          <div><span>Mobile</span>${escapeHtml(r.customerMobile || '—')}</div>
          <div><span>Address</span>${escapeHtml(r.customerAddress || '—')}</div>
          <div><span>Delivery Address</span>${escapeHtml(r.deliveryAddress || '—')}</div>
          ${r.vehicleNumber ? `<div><span>Vehicle Number</span>${escapeHtml(r.vehicleNumber)}</div>` : ''}
          <div><span>Invoice Date</span>${fmtDate(r.invoiceDate || r.date)}</div>
          <div><span>Rental Date</span>${fmtDate(r.date)}</div>
          <div><span>Return Date</span>${r.actualReturnDate ? fmtDate(r.actualReturnDate) : 'Ongoing'}</div>
          <div><span>Total Days</span>${rentalDays(r)}</div>
        </div>
        <table><thead><tr><th>Item</th><th>Qty</th><th>Rate/Day</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="totals">
          <div><span>Items Total</span><span>${fmtMoney(rentalItemsTotal(r))}</span></div>
          ${transportBilledTotal(r) > 0 ? `<div><span>Transportation</span><span>${fmtMoney(transportBilledTotal(r))}</span></div>` : ''}
          ${Number(r.discount) > 0 ? `<div><span>Discount</span><span>-${fmtMoney(r.discount)}</span></div>` : ''}
          <div><span>Advance Paid</span><span>-${fmtMoney(rentalPaid(r))}</span></div>
          <div class="grand"><span>Balance Due</span><span>${fmtMoney(due)}</span></div>
        </div>
        ${(s.invoiceTerms && s.invoiceTerms.length) ? `
        <div class="terms">
          <h3>Terms &amp; Conditions</h3>
          <ol>${s.invoiceTerms.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ol>
        </div>` : ''}
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
    ${state.settings.fingerprintEnabled ? `<button class="btn btn-outline" id="fpUnlockBtn" style="margin-top:20px;width:220px;">👆 Unlock with Fingerprint</button>` : ''}
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
  const fpBtn = document.getElementById('fpUnlockBtn');
  if (fpBtn) {
    fpBtn.onclick = async () => {
      fpBtn.textContent = 'Waiting for fingerprint…';
      const ok = await verifyFingerprint();
      if (ok) document.getElementById('lockscreen').style.display = 'none';
      else { toast('Fingerprint not recognized.'); fpBtn.textContent = '👆 Unlock with Fingerprint'; }
    };
    // offer fingerprint immediately so the person doesn't have to tap first
    setTimeout(() => fpBtn.click(), 300);
  }
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

/* Fingerprint/Face unlock via the device's platform authenticator (WebAuthn).
   Since this app has no server, a successful local biometric assertion is treated
   as proof of unlock — there's no remote signature verification, which is fine for
   gating access to an app already installed on your own phone. */
async function registerFingerprint() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    toast('Fingerprint unlock is not supported on this browser/device.');
    return false;
  }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) { toast('No fingerprint/face unlock found on this device.'); return false; }
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge, rp: { name: state.settings.businessName || 'Roop Rental' },
        user: { id: userId, name: 'owner', displayName: state.settings.ownerName || 'Owner' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000
      }
    });
    if (!cred) return false;
    state.settings.fingerprintCredentialId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
    return true;
  } catch (e) {
    toast('Could not set up fingerprint unlock.');
    return false;
  }
}
async function verifyFingerprint() {
  if (!window.PublicKeyCredential || !navigator.credentials || !state.settings.fingerprintCredentialId) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credIdBytes = Uint8Array.from(atob(state.settings.fingerprintCredentialId), c => c.charCodeAt(0));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge, allowCredentials: [{ id: credIdBytes, type: 'public-key' }],
        userVerification: 'required', timeout: 60000
      }
    });
    return !!assertion;
  } catch (e) {
    return false;
  }
}

/* ---------- Settings events (bound after render) ---------- */
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
async function saveThemeConfig() {
  await dbPut('settings', { key: 'main', value: state.settings });
}

function bindSettingsMenuEvents() {
  document.querySelectorAll('[data-settings-page]').forEach(card => {
    card.onclick = () => { state.settingsPage = card.dataset.settingsPage; route(); };
  });
}

function bindSettingsBusinessEvents() {
  document.getElementById('saveSettingsBtn').onclick = async () => {
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
}

function bindSettingsLogoEvents() {
  document.getElementById('uploadLogoBtn').onclick = () => document.getElementById('logoFile').click();
  document.getElementById('logoFile').addEventListener('change', (e) => { if (e.target.files[0]) readImageToSettings(e.target.files[0], 'logoImg'); });
}

function bindSettingsSignatureEvents() {
  document.getElementById('uploadSigBtn').onclick = () => document.getElementById('sigFile').click();
  document.getElementById('sigFile').addEventListener('change', (e) => { if (e.target.files[0]) readImageToSettings(e.target.files[0], 'signatureImg'); });
  document.getElementById('uploadStampBtn').onclick = () => document.getElementById('stampFile').click();
  document.getElementById('stampFile').addEventListener('change', (e) => { if (e.target.files[0]) readImageToSettings(e.target.files[0], 'stampImg'); });
}

function bindSettingsInvoicingEvents() {
  document.getElementById('saveInvoiceNumBtn').onclick = async () => {
    state.settings.invoicePrefix = document.getElementById('setInvoicePrefix').value.trim() || 'RR';
    state.settings.invoiceCounter = Math.max(1, Number(document.getElementById('setInvoiceCounter').value) || 1);
    await dbPut('settings', { key: 'main', value: state.settings });
    toast('Invoice numbering updated.');
    route();
  };
}

function bindSettingsItemsEvents() {
  let catalogDraft = JSON.parse(JSON.stringify(getItemCatalog()));
  function rerenderCatalogList() {
    document.getElementById('itemCatalogList').innerHTML = itemCatalogRowsHTML(catalogDraft);
    bindCatalogRows();
  }
  function bindCatalogRows() {
    document.querySelectorAll('.cat-name').forEach(inp => {
      inp.addEventListener('input', () => { catalogDraft[Number(inp.dataset.idx)].name = inp.value; });
    });
    document.querySelectorAll('.cat-rate').forEach(inp => {
      inp.addEventListener('input', () => { catalogDraft[Number(inp.dataset.idx)].rate = Number(inp.value) || 0; });
    });
    document.querySelectorAll('.cat-stock').forEach(inp => {
      inp.addEventListener('input', () => { catalogDraft[Number(inp.dataset.idx)].stock = Number(inp.value) || 0; });
    });
    document.querySelectorAll('.cat-del').forEach(btn => {
      btn.onclick = () => { catalogDraft.splice(Number(btn.dataset.idx), 1); rerenderCatalogList(); };
    });
    document.querySelectorAll('.cat-up').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        if (idx > 0) { [catalogDraft[idx - 1], catalogDraft[idx]] = [catalogDraft[idx], catalogDraft[idx - 1]]; rerenderCatalogList(); }
      };
    });
    document.querySelectorAll('.cat-down').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        if (idx < catalogDraft.length - 1) { [catalogDraft[idx + 1], catalogDraft[idx]] = [catalogDraft[idx], catalogDraft[idx + 1]]; rerenderCatalogList(); }
      };
    });
  }
  bindCatalogRows();
  document.getElementById('addCatalogItemBtn').onclick = () => {
    catalogDraft.push({ name: '', rate: 0, stock: 0 });
    rerenderCatalogList();
  };
  document.getElementById('saveCatalogBtn').onclick = async () => {
    const cleaned = catalogDraft.filter(it => it.name && it.name.trim());
    if (!cleaned.length) { toast('Add at least one item.'); return; }
    state.settings.itemCatalog = cleaned;
    await dbPut('settings', { key: 'main', value: state.settings });
    toast('Item catalog saved.');
    route();
  };
}

function bindSettingsAppLockEvents() {
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
  const fpToggle = document.getElementById('fingerprintToggle');
  fpToggle.onchange = async (e) => {
    if (e.target.checked) {
      const ok = await registerFingerprint();
      if (!ok) { e.target.checked = false; return; }
      state.settings.fingerprintEnabled = true;
      toast('Fingerprint unlock enabled.');
    } else {
      state.settings.fingerprintEnabled = false;
      state.settings.fingerprintCredentialId = '';
    }
    await dbPut('settings', { key: 'main', value: state.settings });
  };
}

function bindSettingsBackupEvents() {
  document.getElementById('exportBtn').onclick = exportBackup;
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
  });
}

function bindSettingsThemeEvents() {
  document.querySelectorAll('[data-tc]').forEach(chip => {
    chip.onclick = async () => {
      const key = chip.dataset.tc;
      const val = chip.dataset.val;
      state.settings.themeConfig[key] = val;
      applyThemeConfig();
      await saveThemeConfig();
      route();
    };
  });

  document.querySelectorAll('[data-accent-preset]').forEach(sw => {
    sw.onclick = async () => {
      state.settings.themeConfig.accentPreset = sw.dataset.accentPreset;
      state.settings.themeConfig.accentColor = sw.dataset.accentHex;
      applyThemeConfig();
      await saveThemeConfig();
      route();
    };
  });
  const accentCustomPicker = document.getElementById('accentCustomPicker');
  if (accentCustomPicker) accentCustomPicker.addEventListener('input', async (e) => {
    state.settings.themeConfig.accentPreset = 'custom';
    state.settings.themeConfig.accentColor = e.target.value;
    applyThemeConfig();
    await saveThemeConfig();
  });
  if (accentCustomPicker) accentCustomPicker.addEventListener('change', () => route());

  const applyAccentCodeBtn = document.getElementById('applyAccentCodeBtn');
  if (applyAccentCodeBtn) applyAccentCodeBtn.onclick = async () => {
    const raw = document.getElementById('accentCodeInput').value;
    const hex = parseColorToHex(raw);
    const errEl = document.getElementById('accentCodeError');
    if (!hex) { errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';
    state.settings.themeConfig.accentPreset = 'custom';
    state.settings.themeConfig.accentColor = hex;
    applyThemeConfig();
    await saveThemeConfig();
    route();
  };

  const screenBgPicker = document.getElementById('screenBgPicker');
  const cardBgPicker = document.getElementById('cardBgPicker');
  if (screenBgPicker) screenBgPicker.addEventListener('input', async (e) => { state.settings.themeConfig.screenBg = e.target.value; applyThemeConfig(); await saveThemeConfig(); });
  if (cardBgPicker) cardBgPicker.addEventListener('input', async (e) => { state.settings.themeConfig.cardBg = e.target.value; applyThemeConfig(); await saveThemeConfig(); });
  const clearBgBtn = document.getElementById('clearBgBtn');
  if (clearBgBtn) clearBgBtn.onclick = async () => {
    state.settings.themeConfig.screenBg = ''; state.settings.themeConfig.cardBg = '';
    applyThemeConfig(); await saveThemeConfig(); route();
  };

  const radiusSlider = document.getElementById('cardRadiusSlider');
  if (radiusSlider) radiusSlider.addEventListener('input', async (e) => {
    state.settings.themeConfig.cardRadius = Number(e.target.value);
    applyThemeConfig();
    e.target.previousElementSibling.querySelector('span').textContent = e.target.value + 'px';
    await saveThemeConfig();
  });

  const cardBorderToggle = document.getElementById('cardBorderToggle');
  if (cardBorderToggle) cardBorderToggle.onchange = async (e) => {
    state.settings.themeConfig.cardBorder = e.target.checked;
    applyThemeConfig();
    await saveThemeConfig();
  };

  const animEnabledToggle = document.getElementById('animEnabledToggle');
  if (animEnabledToggle) animEnabledToggle.onchange = async (e) => {
    state.settings.themeConfig.animationsEnabled = e.target.checked;
    applyThemeConfig();
    await saveThemeConfig();
  };

  const resetThemeBtn = document.getElementById('resetThemeBtn');
  if (resetThemeBtn) resetThemeBtn.onclick = async () => {
    if (!confirm('Reset all theme customization to default?')) return;
    state.settings.themeConfig = defaultThemeConfig();
    applyThemeConfig();
    await saveThemeConfig();
    route();
  };
  const exportThemeBtn = document.getElementById('exportThemeBtn');
  if (exportThemeBtn) exportThemeBtn.onclick = () => {
    const blob = new Blob([JSON.stringify(state.settings.themeConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `roop-rental-theme-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('Theme exported.');
  };
  const importThemeBtn = document.getElementById('importThemeBtn');
  if (importThemeBtn) importThemeBtn.onclick = () => document.getElementById('importThemeFile').click();
  const importThemeFile = document.getElementById('importThemeFile');
  if (importThemeFile) importThemeFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported = JSON.parse(reader.result);
        state.settings.themeConfig = { ...defaultThemeConfig(), ...imported };
        applyThemeConfig();
        await saveThemeConfig();
        toast('Theme imported.');
        route();
      } catch (err) { toast('Invalid theme file.'); }
    };
    reader.readAsText(file);
  });
}

function bindSettingsTermsEvents() {
  let termsDraft = [...(state.settings.invoiceTerms || [])];
  function rerenderTerms() {
    document.getElementById('termsList').innerHTML = termsRowsHTML(termsDraft);
    bindTermRows();
  }
  function bindTermRows() {
    document.querySelectorAll('.term-text').forEach(ta => {
      ta.addEventListener('input', () => { termsDraft[Number(ta.dataset.idx)] = ta.value; });
    });
    document.querySelectorAll('.term-del').forEach(btn => {
      btn.onclick = () => { termsDraft.splice(Number(btn.dataset.idx), 1); rerenderTerms(); };
    });
  }
  bindTermRows();
  document.getElementById('addTermBtn').onclick = () => { termsDraft.push(''); rerenderTerms(); };
  document.getElementById('saveTermsBtn').onclick = async () => {
    state.settings.invoiceTerms = termsDraft.filter(t => t && t.trim());
    await dbPut('settings', { key: 'main', value: state.settings });
    toast('Terms & Conditions saved.');
    route();
  };
}

function bindSettingsWhatsAppEvents() {
  document.getElementById('resetReceiptTplBtn').onclick = () => {
    document.getElementById('waReceiptTemplate').value = defaultReceiptTemplate();
  };
  document.getElementById('resetInvoiceTplBtn').onclick = () => {
    document.getElementById('waInvoiceTemplate').value = defaultInvoiceTemplate();
  };
  document.getElementById('saveWaTemplatesBtn').onclick = async () => {
    state.settings.whatsappReceiptTemplate = document.getElementById('waReceiptTemplate').value;
    state.settings.whatsappInvoiceTemplate = document.getElementById('waInvoiceTemplate').value;
    await dbPut('settings', { key: 'main', value: state.settings });
    toast('WhatsApp templates saved.');
  };
}

function bindSettingsEvents() {
  const backBtn = document.getElementById('settingsBackBtn');
  if (backBtn) backBtn.onclick = () => { state.settingsPage = null; route(); };
  switch (state.settingsPage) {
    case 'business': bindSettingsBusinessEvents(); break;
    case 'logo': bindSettingsLogoEvents(); break;
    case 'signature': bindSettingsSignatureEvents(); break;
    case 'invoicing': bindSettingsInvoicingEvents(); break;
    case 'items': bindSettingsItemsEvents(); break;
    case 'applock': bindSettingsAppLockEvents(); break;
    case 'backup': bindSettingsBackupEvents(); break;
    case 'theme': bindSettingsThemeEvents(); break;
    case 'terms': bindSettingsTermsEvents(); break;
    case 'whatsapp': bindSettingsWhatsAppEvents(); break;
    default: bindSettingsMenuEvents(); break;
  }
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
  if (state.view === 'dashboard' && detailStack.view !== 'customerDetail') bindStockRows();
  if (state.view === 'settings' && detailStack.view !== 'customerDetail') bindSettingsEvents();
  if (detailStack.view === 'customerDetail') {
    const editBtn = document.getElementById('editCustomerBtn');
    if (editBtn) editBtn.onclick = () => openCustomerForm(detailStack.id);
  }
  document.querySelectorAll('nav.bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
}

function bindMainEvents() {
  document.querySelectorAll('[data-open-rental]').forEach(el => {
    el.addEventListener('click', () => openRentalDetail(el.dataset.openRental));
  });
  document.querySelectorAll('[data-open-customer]').forEach(el => {
    el.addEventListener('click', () => { detailStack = { view: 'customerDetail', id: el.dataset.openCustomer }; route(); });
  });
  const newCustomerBtn = document.getElementById('newCustomerBtn');
  if (newCustomerBtn) newCustomerBtn.onclick = () => openCustomerForm(null);
  document.querySelectorAll('[data-back]').forEach(el => {
    el.addEventListener('click', () => { detailStack = { view: null, id: null }; state.view = el.dataset.back; route(); });
  });
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => { detailStack = { view: null, id: null }; state.view = el.dataset.nav; route(); });
  });
  document.querySelectorAll('[data-filter]').forEach(el => {
    el.addEventListener('click', () => { state.filter = el.dataset.filter; route(); });
  });
  document.querySelectorAll('[data-invoice-filter]').forEach(el => {
    el.addEventListener('click', () => { state.invoiceFilter = el.dataset.invoiceFilter; route(); });
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
  if (!state.settings.themeConfig) {
    const tc = defaultThemeConfig();
    // migrate old simple theme field (light/dark/gray) if it was set previously
    if (state.settings.theme === 'dark') tc.mode = 'dark';
    else if (state.settings.theme === 'light') tc.mode = 'light';
    state.settings.themeConfig = tc;
  } else {
    // fill in any new keys added since the user's last save, without losing their choices
    state.settings.themeConfig = { ...defaultThemeConfig(), ...state.settings.themeConfig };
  }
  if (!state.settings.itemCatalog || !state.settings.itemCatalog.length) {
    state.settings.itemCatalog = JSON.parse(JSON.stringify(DEFAULT_ITEM_CATALOG));
  }
}

async function init() {
  await openDB();
  await loadAllData();
  applyThemeConfig();
  bindSystemThemeListener();
  document.getElementById('headerTitle').textContent = state.settings.businessName;
  document.getElementById('headerSub').textContent = state.settings.address + ' · ' + state.settings.ownerName;
  updateHeaderLogo();

  if (state.settings.pinEnabled && state.settings.pin) showLockScreen();
  else document.getElementById('lockscreen').style.display = 'none';

  document.querySelectorAll('nav.bottomnav button').forEach(btn => {
    btn.addEventListener('click', () => {
      detailStack = { view: null, id: null };
      state.view = btn.dataset.view;
      state.filter = 'active';
      state.settingsPage = null;
      route();
    });
  });
  document.getElementById('themeToggle').addEventListener('click', () => {
    const order = ['light', 'dark', 'gray', 'system'];
    const idx = order.indexOf(state.settings.themeConfig.mode);
    state.settings.themeConfig.mode = order[(idx + 1) % order.length];
    applyThemeConfig();
    dbPut('settings', { key: 'main', value: state.settings });
  });
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (state.view === 'dashboard') { state.view = 'rentals'; state.filter = 'active'; }
    route();
  });

  // header collapse toggle (more room to work with)
  const headerEl = document.querySelector('header.topbar');
  const collapseBtn = document.getElementById('headerCollapseBtn');
  function applyHeaderCollapse() {
    headerEl.classList.toggle('collapsed', !!state.settings.headerCollapsed);
    collapseBtn.textContent = state.settings.headerCollapsed ? '⌄' : '⌃';
  }
  applyHeaderCollapse();
  collapseBtn.addEventListener('click', () => {
    state.settings.headerCollapsed = !state.settings.headerCollapsed;
    applyHeaderCollapse();
    dbPut('settings', { key: 'main', value: state.settings });
  });

  // FAB: draggable + semi-transparent so it never permanently blocks content
  const fab = document.getElementById('fabAdd');
  if (state.settings.fabPosition) {
    fab.style.left = state.settings.fabPosition.x + 'px';
    fab.style.top = state.settings.fabPosition.y + 'px';
    fab.style.right = 'auto'; fab.style.bottom = 'auto';
  }
  let dragging = false, moved = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
  fab.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false;
    const rect = fab.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY; startLeft = rect.left; startTop = rect.top;
    fab.setPointerCapture(e.pointerId);
  });
  fab.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      moved = true;
      fab.classList.add('dragging');
      let newLeft = Math.min(Math.max(startLeft + dx, 4), window.innerWidth - fab.offsetWidth - 4);
      let newTop = Math.min(Math.max(startTop + dy, 4), window.innerHeight - fab.offsetHeight - 4);
      fab.style.left = newLeft + 'px'; fab.style.top = newTop + 'px';
      fab.style.right = 'auto'; fab.style.bottom = 'auto';
    }
  });
  fab.addEventListener('pointerup', (e) => {
    dragging = false;
    fab.classList.remove('dragging');
    if (moved) {
      state.settings.fabPosition = { x: parseFloat(fab.style.left), y: parseFloat(fab.style.top) };
      dbPut('settings', { key: 'main', value: state.settings });
    }
  });
  fab.addEventListener('click', (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
    openRentalForm(null);
  });

  // Hardware/browser back button: auto-save draft instead of losing data
  window.addEventListener('popstate', async () => {
    modalHistoryActive = false;
    const draftToSave = formDraft;
    formDraft = null;
    document.getElementById('modalRoot').innerHTML = '';
    document.querySelectorAll('.modal-overlay').forEach(el => { if (el.parentElement === document.body) el.remove(); });
    route();
    if (draftToSave) await saveDraftSilently(draftToSave);
  });

  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
