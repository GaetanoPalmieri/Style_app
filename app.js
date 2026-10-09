const APP_VERSION = '1.16.0';
const DB_NAME = 'style-wishlist-db';
const DB_VERSION = 1;
const BACKUP_REMINDER_DAYS = 30;
const BACKUP_PROMPT_COOLDOWN_DAYS = 7;
const TABS = ['wishlist', 'purchased', 'wardrobe', 'more'];
const TAB_TITLES = { wishlist: 'Wishlist', purchased: 'Acquistati', wardrobe: 'Guardaroba', more: 'Altro' };
const SEASONS = ['Primavera', 'Estate', 'Autunno', 'Inverno'];
const CATEGORIES = [
  'T-shirt',
  'Felpa',
  'Maglione',
  'Camicia',
  'Pantalone',
  'Jeans',
  'Giacca',
  'Cappotto',
  'Abito',
  'Scarpe',
  'Borsa',
  'Accessorio',
  'Altro',
];
const state = {
  tab: 'wishlist',
  season: defaultSeason(),
  year: defaultYear(),
  filter: 'Tutti',
  search: '',
  sort: 'recent',
  items: [],
  budgets: {},
  photoUrls: new Map(),
  draftPhotos: [],
  draftPhotosNew: new Set(),
  formSaved: false,
  activeForm: null,
  editingId: null,
  lastBackupAt: null,
};
const main = document.getElementById('main');
const sheet = document.getElementById('sheet');
const quickAdd = document.getElementById('quick-add');
const galleryInput = document.getElementById('gallery-input');
const cameraInput = document.getElementById('camera-input');
const backupInput = document.getElementById('backup-input');

function defaultSeason() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return 'Primavera';
  if (m >= 6 && m <= 8) return 'Estate';
  if (m >= 9 && m <= 11) return 'Autunno';
  return 'Inverno';
}
function defaultYear() {
  const d = new Date();
  if (defaultSeason() === 'Inverno' && d.getMonth() + 1 >= 10)
    return `${d.getFullYear()}/${String(d.getFullYear() + 1).slice(-2)}`;
  return String(d.getFullYear());
}
function esc(s) {
  return String(s ?? '').replace(
    /[&<>'"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c],
  );
}
function money(n) {
  if (window.SuiteFmt) return SuiteFmt.money(n); // formato unico della suite: 1.234,56 €
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
}
function id() {
  return 'i_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function toast(msg, opts = {}) {
  document.querySelector('.toast')?.remove();
  const d = document.createElement('div');
  d.className = 'toast';
  if (document.querySelector('.updatebanner')) d.classList.add('stacked');
  const span = document.createElement('span');
  span.textContent = msg;
  d.appendChild(span);
  let timer = null;
  if (opts.actionLabel && opts.onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toastaction';
    btn.textContent = opts.actionLabel;
    btn.onclick = () => {
      clearTimeout(timer);
      d.remove();
      opts.onAction();
    };
    d.appendChild(btn);
  }
  document.body.appendChild(d);
  timer = setTimeout(() => {
    d.remove();
    opts.onExpire?.();
  }, opts.duration || 2600);
  return d;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(s) {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('it-IT');
}
function budgetKey() {
  return `${state.season}|${state.year}`;
}

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    r.onerror = () => {
      dbPromise = null;
      reject(r.error);
    };
  });
  return dbPromise;
}
async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}
async function put(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite'),
      r = t.objectStore(store).put(value);
    r.onsuccess = () => {
      resolve(value);
      if (store === 'items' || (store === 'settings' && value?.key === 'budgets')) styleChanged();
    };
    r.onerror = () => reject(r.error);
  });
}
async function del(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite'),
      r = t.objectStore(store).delete(key);
    r.onsuccess = () => {
      resolve();
      if (store === 'items') styleChanged();
    };
    r.onerror = () => reject(r.error);
  });
}
async function getOne(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function loadData() {
  state.items = await getAll('items');
  const settings = await getAll('settings');
  for (const s of settings) {
    if (s.key === 'budgets') state.budgets = s.value || {};
    if (s.key === 'lastBackupAt') state.lastBackupAt = s.value;
    if (s.key === 'lastSelection' && s.value) {
      state.season = s.value.season || state.season;
      state.year = s.value.year || state.year;
    }
  }
  render();
  setTimeout(() => maybeShowBackupReminder().catch(console.error), 2000);
  setTimeout(() => priceWatch().catch(() => {}), 4000);
}
/* v1.13.0 — Avviso prezzo sceso: una volta al giorno controlla il prezzo dal link degli articoli
   in wishlist (al massimo 8 per volta, uno ogni 2 secondi). Se il prezzo è più basso di quello
   previsto (o dell'ultimo controllo) l'articolo mostra "📉" e arriva un avviso. */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
async function checkItemPrice(item, { quiet = false } = {}) {
  if (!window.SuiteLink || !/^https?:\/\//i.test(item.url || '')) return null;
  const p = await SuiteLink.preview(item.url);
  if (!p || !p.price) return null;
  const ref = Number(item.priceCheck?.price) || Number(item.expectedPrice) || 0;
  item.priceCheck = { price: p.price, at: todayStr() };
  let dropped = false;
  if (ref > 0 && p.price < ref - 0.009) {
    const from = item.priceDrop?.from && item.priceDrop.from > p.price ? item.priceDrop.from : ref;
    item.priceDrop = { from, to: p.price, at: todayStr() };
    dropped = true;
  } else if (item.priceDrop && p.price >= item.priceDrop.from) item.priceDrop = null;
  else if (item.priceDrop) item.priceDrop.to = p.price;
  await put('items', item);
  if (dropped && !quiet) toast(`📉 Prezzo sceso: ${item.name} da ${money(item.priceDrop.from)} a ${money(p.price)}`);
  return p.price;
}
async function priceWatch() {
  if (navigator.onLine === false) return;
  const today = todayStr();
  const todo = state.items
    .filter((i) => ['wishlist', 'ordered'].includes(i.status || 'wishlist') && /^https?:\/\//i.test(i.url || '') && i.priceCheck?.at !== today)
    .slice(0, 8);
  let changed = false;
  for (const item of todo) {
    const before = JSON.stringify(item.priceDrop || null);
    await checkItemPrice(item);
    if (JSON.stringify(item.priceDrop || null) !== before) changed = true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (changed && !document.querySelector('dialog[open]')) render();
}
function costPerWear(item) {
  const price = Number(item.paidPrice ?? item.expectedPrice) || 0;
  return item.wears > 0 && price > 0 ? price / item.wears : null;
}
async function maybeShowBackupReminder() {
  if (!state.items.length) return;
  const now = Date.now();
  const last = state.lastBackupAt ? new Date(state.lastBackupAt).getTime() : 0;
  const daysSince = (now - last) / 86400000;
  if (daysSince < BACKUP_REMINDER_DAYS) return;
  const settings = await getAll('settings');
  const lastPrompt = settings.find((s) => s.key === 'lastBackupPromptAt')?.value;
  const daysSincePrompt = lastPrompt ? (now - new Date(lastPrompt).getTime()) / 86400000 : Infinity;
  if (daysSincePrompt < BACKUP_PROMPT_COOLDOWN_DAYS) return;
  await put('settings', { key: 'lastBackupPromptAt', value: new Date().toISOString() });
  // 1.9.0: stesso promemoria delle altre app.
  if (window.SuiteBackup) SuiteBackup.show({ app: 'Style', days: last ? Math.floor(daysSince) : Infinity, onExport: () => exportBackup() });
  else toast('Non fai un backup da un po’. Vuoi esportarlo ora?', { actionLabel: 'Esporta', duration: 7000, onAction: () => exportBackup() });
}
async function saveSelection() {
  await put('settings', { key: 'lastSelection', value: { season: state.season, year: state.year } });
}
async function saveBudgets() {
  await put('settings', { key: 'budgets', value: state.budgets });
}

function revokePhotoUrls() {
  for (const url of state.photoUrls.values()) URL.revokeObjectURL(url);
  state.photoUrls.clear();
}
async function photoSrc(ref) {
  if (!ref) return null;
  if (ref.type === 'web') return ref.url;
  if (state.photoUrls.has(ref.id)) return state.photoUrls.get(ref.id);
  let rec = await getOne('photos', ref.id);
  if (!rec?.blob && window.syncStyle && SuiteSync.signedIn) {
    // 1.10.0: foto aggiunta da un altro dispositivo: si scarica dal database online.
    try {
      const blob = await syncStyle.downloadPhoto(`${SuiteSync.userId}/style/${ref.id}`);
      rec = { id: ref.id, blob, createdAt: new Date().toISOString() };
      await put('photos', rec);
      markStylePhotoUploaded(ref.id);
    } catch (e) {
      rec = null;
    }
  }
  if (!rec?.blob) return null;
  const u = URL.createObjectURL(rec.blob);
  state.photoUrls.set(ref.id, u);
  return u;
}
async function firstPhotoSrc(item) {
  return photoSrc(item.photos?.[0]);
}

function navRender() {
  document.getElementById('screen-title').textContent = TAB_TITLES[state.tab];
  document.querySelectorAll('#page-tabs button').forEach((b) => {
    const active = b.dataset.tab === state.tab;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  quickAdd.hidden = !['wishlist', 'wardrobe'].includes(state.tab);
  quickAdd.setAttribute(
    'aria-label',
    state.tab === 'wardrobe' ? 'Aggiungi al guardaroba' : 'Aggiungi articolo',
  );
}
function yearOptions() {
  const y = new Date().getFullYear();
  const arr = [];
  for (let d = -1; d <= 2; d++) {
    const yr = y + d;
    arr.push(String(yr));
    arr.push(`${yr}/${String(yr + 1).slice(-2)}`);
  }
  return [...new Set(arr)];
}
function yearDatalist(listId) {
  return `<datalist id="${listId}">${yearOptions()
    .map((y) => `<option value="${esc(y)}"></option>`)
    .join('')}</datalist>`;
}
function seasonToolbar() {
  return `<div class="toolbar"><select id="season-select" class="grow">${SEASONS.map((s) => `<option ${s === state.season ? 'selected' : ''}>${s}</option>`).join('')}</select><input id="year-input" list="year-toolbar-options" value="${esc(state.year)}" inputmode="text" aria-label="Anno o stagione" style="width:108px"></div>${yearDatalist('year-toolbar-options')}`;
}
function matchingSeason(item) {
  return item.season === state.season && item.year === state.year;
}
function wishlistItems() {
  return state.items.filter((i) => matchingSeason(i) && ['wishlist', 'ordered'].includes(i.status));
}
function purchasedItems() {
  return state.items
    .filter((i) => i.status === 'purchased')
    .sort((a, b) => (b.purchasedAt || '').localeCompare(a.purchasedAt || ''));
}
function wardrobeItems() {
  return state.items
    .filter((i) => ['purchased', 'owned'].includes(i.status) && i.inWardrobe !== false)
    .sort((a, b) =>
      (b.updatedAt || b.purchasedAt || b.createdAt || '').localeCompare(
        a.updatedAt || a.purchasedAt || a.createdAt || '',
      ),
    );
}
function filtered(items) {
  if (state.filter === 'Tutti') return items;
  if (state.filter === 'Vestiti')
    return items.filter((i) => !['Scarpe', 'Borsa', 'Accessorio'].includes(i.category));
  if (state.filter === 'Scarpe') return items.filter((i) => i.category === 'Scarpe');
  if (state.filter === 'Accessori') return items.filter((i) => ['Borsa', 'Accessorio'].includes(i.category));
  if (state.filter === 'Alta priorità') return items.filter((i) => i.priority === 'Alta');
  if (state.filter === 'Ordinati') return items.filter((i) => i.status === 'ordered');
  return items;
}
function filterBar() {
  const arr = ['Tutti', 'Vestiti', 'Scarpe', 'Accessori', 'Alta priorità', 'Ordinati'];
  return `<div class="filters">${arr.map((f) => `<button data-filter="${f}" class="${state.filter === f ? 'active' : ''}">${f}</button>`).join('')}</div>`;
}
function applySearch(items) {
  if (!state.search.trim()) return items;
  const q = state.search.trim().toLowerCase();
  return items.filter((i) =>
    [i.name, i.brand, i.shop, i.notes].some((v) =>
      String(v || '')
        .toLowerCase()
        .includes(q),
    ),
  );
}
function priceOf(item) {
  if (item.status === 'owned') return 0;
  return (
    Number(item.status === 'purchased' ? (item.paidPrice ?? item.expectedPrice) : item.expectedPrice) || 0
  );
}
function sortItems(items) {
  const arr = [...items];
  if (state.sort === 'price-asc') arr.sort((a, b) => priceOf(a) - priceOf(b));
  else if (state.sort === 'price-desc') arr.sort((a, b) => priceOf(b) - priceOf(a));
  else if (state.sort === 'priority') {
    const order = { Alta: 0, Media: 1, Bassa: 2 };
    arr.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
  } else
    arr.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  return arr;
}
function searchSortBar() {
  return `<div class="searchbar"><input id="search-input" type="search" placeholder="Cerca…" value="${esc(state.search)}" aria-label="Cerca articoli"><select id="sort-select" class="sortselect" aria-label="Ordina"><option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>Più recenti</option><option value="price-asc" ${state.sort === 'price-asc' ? 'selected' : ''}>Prezzo ↑</option><option value="price-desc" ${state.sort === 'price-desc' ? 'selected' : ''}>Prezzo ↓</option><option value="priority" ${state.sort === 'priority' ? 'selected' : ''}>Priorità</option></select></div>`;
}
function bindSearchSort(onchange) {
  onchange = onchange || render;
  const s = main.querySelector('#search-input');
  if (s)
    s.oninput = async (e) => {
      state.search = e.target.value;
      const pos = e.target.selectionStart;
      await onchange();
      const el = main.querySelector('#search-input');
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    };
  const sel = main.querySelector('#sort-select');
  if (sel)
    sel.onchange = () => {
      state.sort = sel.value;
      onchange();
    };
}
function placeholderFor(item) {
  return item.category === 'Scarpe'
    ? '👟'
    : item.category === 'Borsa'
      ? '👜'
      : item.category === 'Accessorio'
        ? '🕶️'
        : '👕';
}
function priorityClass(p) {
  return p === 'Alta' ? 'priority-high' : p === 'Media' ? 'priority-medium' : 'priority-low';
}
function cardHtml(item) {
  const owned = item.status === 'owned';
  return `<article class="itemcard" data-item="${item.id}"><div class="thumb" data-thumb="${item.id}"><span class="placeholder">${placeholderFor(item)}</span></div>${owned ? '' : `<span class="badge ${priorityClass(item.priority)}">${esc(item.priority || 'Media')}</span>`}${item.status === 'ordered' ? '<span class="statusbadge">Ordinato</span>' : ''}${item.priceDrop && ['wishlist', 'ordered'].includes(item.status || 'wishlist') ? `<span class="dropbadge">📉 −${money(item.priceDrop.from - item.priceDrop.to)}</span>` : ''}<div class="cardbody"><div class="itemtitle">${esc(item.name)}</div><div class="meta">${esc(item.brand || item.category || '')}</div>${owned ? '<div class="ownedlabel">Nel guardaroba</div>' : `<div class="price">${money(item.status === 'purchased' ? (item.paidPrice ?? item.expectedPrice) : item.priceDrop ? item.priceDrop.to : item.expectedPrice)}</div>`}${costPerWear(item) ? `<div class="cpw">${money(costPerWear(item))} per uso · ${item.wears}×</div>` : ''}</div></article>`;
}
async function hydrateThumbs(root, items) {
  await Promise.all(
    items.map(async (item) => {
      const box = root.querySelector(`[data-thumb="${CSS.escape(item.id)}"]`);
      if (!box) return;
      const src = await firstPhotoSrc(item);
      if (src) box.innerHTML = `<img alt="${esc(item.name)}" src="${esc(src)}">`;
    }),
  );
}

async function renderWishlist() {
  const items = sortItems(applySearch(filtered(wishlistItems())));
  const total = wishlistItems().reduce((s, i) => s + (Number(i.expectedPrice) || 0), 0);
  const purchasedSeason = state.items
    .filter((i) => matchingSeason(i) && i.status === 'purchased')
    .reduce((s, i) => s + (Number(i.paidPrice) || Number(i.expectedPrice) || 0), 0);
  const budget = Number(state.budgets[budgetKey()] || 0);
  main.innerHTML = `${seasonToolbar()}<div class="summary"><div class="metric"><small>Articoli</small><b>${wishlistItems().length}</b></div><div class="metric accent"><small>Wishlist</small><b>${money(total)}</b></div><div class="metric"><small>Acquistato</small><b>${money(purchasedSeason)}</b></div></div><div class="budgetcard"><div class="budgetrow"><div class="budgetinfo"><span class="muted">Budget ${esc(state.season)} ${esc(state.year)}</span><b class="${budget ? '' : 'unset'}">${budget ? money(budget) : 'Non impostato'}</b></div><button class="ghostbtn small" id="edit-budget">Modifica</button></div>${budget ? `<div class="progress${purchasedSeason > budget ? ' over' : ''}"><span style="width:${Math.min(100, (purchasedSeason / budget) * 100)}%"></span></div><div class="${purchasedSeason > budget ? 'overtext' : 'muted'}" style="font-size:11px;margin-top:7px">${purchasedSeason > budget ? `Superato di ${money(purchasedSeason - budget)}` : `${money(purchasedSeason)} di ${money(budget)} utilizzati`}</div>` : ''}</div>${filterBar()}${searchSortBar()}${items.length ? `<div class="grid">${items.map(cardHtml).join('')}</div>` : `<div class="empty"><div class="big">🛍️</div><b>Nessun articolo</b><div style="margin-top:6px">Aggiungi il primo capo, scarpa o accessorio per questa stagione.</div><button class="solidbtn" id="empty-add" style="margin-top:14px">Aggiungi articolo</button></div>`}`;
  bindCommonToolbar();
  bindSearchSort();
  main.querySelectorAll('[data-filter]').forEach(
    (b) =>
      (b.onclick = () => {
        state.filter = b.dataset.filter;
        render();
      }),
  );
  // v1.13.0 — la sfumatura sparisce quando la riga dei filtri è a fine corsa; il filtro attivo resta visibile
  const fbar = main.querySelector('.filters');
  if (fbar) {
    const edge = () => fbar.classList.toggle('at-end', fbar.scrollLeft + fbar.clientWidth >= fbar.scrollWidth - 4);
    fbar.addEventListener('scroll', edge, { passive: true });
    fbar.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    edge();
  }
  main.querySelector('#edit-budget')?.addEventListener('click', editBudget);
  main.querySelector('#empty-add')?.addEventListener('click', () => openItemForm());
  main.querySelectorAll('[data-item]').forEach((c) => (c.onclick = () => openDetails(c.dataset.item)));
  await hydrateThumbs(main, items);
}
async function renderPurchased() {
  const allItems = purchasedItems();
  const total = allItems.reduce((s, i) => s + (Number(i.paidPrice) || Number(i.expectedPrice) || 0), 0);
  const shown = sortItems(applySearch(allItems));
  // v1.13.0 — le statistiche stanno qui (prima erano in Altro)
  main.innerHTML = `<div class="summary"><div class="metric"><small>Acquisti</small><b>${allItems.length}</b></div><div class="metric accent"><small>Speso</small><b>${money(total)}</b></div><div class="metric"><small>Guardaroba</small><b>${wardrobeItems().length}</b></div></div>${allItems.length ? `<details class="morecard st-stats"><summary><h3>Statistiche</h3><span class="muted">speso e categorie</span></summary>${statsHtml()}</details>` : ''}${searchSortBar()}${shown.length ? `<div class="grid">${shown.map(cardHtml).join('')}</div>` : '<div class="empty"><div class="big">✓</div><b>Nessun acquisto registrato</b><div style="margin-top:6px">Gli articoli acquistati dalla wishlist compariranno qui.</div></div>'}`;
  bindSearchSort();
  main.querySelectorAll('[data-item]').forEach((c) => (c.onclick = () => openDetails(c.dataset.item)));
  await hydrateThumbs(main, shown);
}
async function renderWardrobe() {
  const allItems = wardrobeItems();
  main.innerHTML = `<div class="wardrobe-intro"><div><b>Il tuo guardaroba</b><span>Qui trovi gli acquisti e i capi che possiedi già.</span></div></div><div class="toolbar"><select id="wardrobe-cat" class="grow"><option>Tutte le categorie</option>${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select></div>${searchSortBar()}<div id="wardrobe-list"></div>`;
  const listEl = main.querySelector('#wardrobe-list');

  async function paint() {
    const sel = main.querySelector('#wardrobe-cat');
    const cat = sel ? sel.value : 'Tutte le categorie';
    const base = cat === 'Tutte le categorie' ? allItems : allItems.filter((i) => i.category === cat);
    const shown = sortItems(applySearch(base));
    listEl.innerHTML = shown.length
      ? `<div class="grid">${shown.map(cardHtml).join('')}</div>`
      : '<div class="empty">Nessun articolo in questa categoria.</div>';
    listEl.querySelectorAll('[data-item]').forEach((c) => (c.onclick = () => openDetails(c.dataset.item)));
    await hydrateThumbs(listEl, shown);
  }
  main.querySelector('#wardrobe-cat').onchange = paint;
  bindSearchSort(paint);
  if (!allItems.length) {
    listEl.innerHTML =
      '<div class="empty"><div class="big">👔</div><b>Guardaroba vuoto</b><div style="margin-top:6px">Gli acquisti compariranno qui automaticamente. Puoi anche registrare i capi che possiedi già.</div><button class="solidbtn" id="empty-wardrobe-add" style="margin-top:14px">Aggiungi un capo già mio</button></div>';
    main.querySelector('#empty-wardrobe-add').onclick = () => openWardrobeForm();
    return;
  }
  await paint();
}
function statsHtml() {
  const purchased = state.items.filter((i) => i.status === 'purchased');
  if (!purchased.length)
    return '<p class="muted" style="font-size:13px">Nessun acquisto registrato ancora.</p>';
  const totalAll = purchased.reduce((s, i) => s + (Number(i.paidPrice) || Number(i.expectedPrice) || 0), 0);
  const thisYear = String(new Date().getFullYear());
  const totalYear = purchased
    .filter((i) => (i.purchasedAt || '').startsWith(thisYear))
    .reduce((s, i) => s + (Number(i.paidPrice) || Number(i.expectedPrice) || 0), 0);
  const byCat = new Map();
  for (const i of purchased) {
    const c = i.category || 'Altro';
    byCat.set(c, (byCat.get(c) || 0) + (Number(i.paidPrice) || Number(i.expectedPrice) || 0));
  }
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxTop = Math.max(1, ...top.map(([, v]) => v));
  return `<div class="statrow"><span>Speso totale</span><b>${money(totalAll)}</b></div><div class="statrow"><span>Speso nel ${thisYear}</span><b>${money(totalYear)}</b></div>${top.map(([c, v]) => `<div class="statbar" style="--pct:${Math.max(4, Math.round((v / maxTop) * 100))}%"><div class="statbarfill"></div><span>${esc(c)}</span><b>${money(v)}</b></div>`).join('')}`;
}
function renderMore() {
  const lastBackupTxt = state.lastBackupAt
    ? `Ultimo backup: ${fmtDate(state.lastBackupAt.slice(0, 10))}`
    : 'Nessun backup effettuato finora.';
  main.innerHTML = `${window.SuiteTheme ? SuiteTheme.card({ cls: 'morecard', h: 'h3' }) : ''}${window.SuiteSync ? SuiteSync.cardHtml('style', { cls: 'morecard', h: 'h3' }) : ''}<div class="morecard"><h3>Backup dati</h3><p>Esporta tutti gli articoli, impostazioni e foto in un file JSON. Puoi poi ripristinarlo su un altro dispositivo.</p><p class="muted" style="font-size:11px;margin-top:-4px">${esc(lastBackupTxt)}</p><div class="inline"><button class="solidbtn" id="export-backup">Esporta backup</button><button class="ghostbtn" id="import-backup">Importa</button></div></div><div class="morecard"><h3>Dati locali</h3><p>Style Wishlist salva i dati sul dispositivo tramite IndexedDB. Con la sincronizzazione (qui sopra) ne tiene anche una copia online.</p><button class="dangerbtn" id="clear-data">Cancella tutti i dati</button></div><div class="morecard"><h3>App</h3><p>Style Wishlist v${APP_VERSION}<br>Installabile da Safari tramite “Aggiungi a Home”.</p></div>`;
  main.querySelector('#export-backup').onclick = exportBackup;
  main.querySelector('#import-backup').onclick = () => backupInput.click();
  main.querySelector('#clear-data').onclick = clearAllData;
}

async function render() {
  navRender();
  if (state.tab === 'wishlist') await renderWishlist();
  if (state.tab === 'purchased') await renderPurchased();
  if (state.tab === 'wardrobe') await renderWardrobe();
  if (state.tab === 'more') renderMore();
}
function bindCommonToolbar() {
  main.querySelector('#season-select')?.addEventListener('change', async (e) => {
    state.season = e.target.value;
    state.filter = 'Tutti';
    await saveSelection();
    render();
  });
  main.querySelector('#year-input')?.addEventListener('change', async (e) => {
    state.year = e.target.value.trim() || defaultYear();
    state.filter = 'Tutti';
    await saveSelection();
    render();
  });
}

function sheetOpen(html) {
  if (sheet.open) sheet.close();
  sheet.innerHTML = `<div class="sheetinner"><div class="sheetgrab" aria-hidden="true"></div>${html}</div>`;
  sheet.showModal();
}
function sheetHead(title) {
  return `<div class="sheethead"><h2>${esc(title)}</h2><button class="closebtn" data-close aria-label="Chiudi">✕</button></div>`;
}
function formSheetHead(title, formId) {
  return `<div class="sheetformhead"><h2>${esc(title)}</h2><div class="sheetformactions"><button type="button" class="ghostbtn" data-close>Annulla</button><button type="submit" class="solidbtn" form="${esc(formId)}">Salva</button></div></div>`;
}
function itemFormValues(item = {}) {
  return {
    name: item.name || '',
    category: item.category || '',
    season: item.season || state.season,
    year: item.year || state.year,
    brand: item.brand || '',
    color: item.color || '',
    size: item.size || '',
    expectedPrice: item.expectedPrice ?? '',
    priority: item.priority || 'Media',
    shop: item.shop || '',
    url: item.url || '',
    notes: item.notes || '',
    status: item.status || 'wishlist',
  };
}
async function openItemForm(item = null) {
  state.editingId = item?.id || null;
  const draftPhotosSnapshot = (item?.photos || []).map((x) => ({ ...x }));
  const v = itemFormValues(item || {});
  sheetOpen(
    `${formSheetHead(item ? 'Modifica articolo' : 'Nuovo articolo', 'item-form')}<form id="item-form"><div class="field full"><label>Foto</label><div class="photoactions two"><button type="button" class="ghostbtn" id="take-photo">📷 Fotocamera</button><button type="button" class="ghostbtn" id="pick-photo">🖼️ Galleria</button></div><div class="photopreview" id="photo-preview"></div></div><div class="formgrid"><div class="field full"><label>Link del negozio <small>(facoltativo: compila nome, foto e prezzo)</small></label><div class="st-linkrow"><input name="url" type="url" value="${esc(v.url)}" placeholder="Incolla il link del negozio"><button type="button" class="ghostbtn st-linkbtn" id="link-fetch" aria-label="Prendi nome, foto e prezzo dal link">⬇︎ Dati</button></div><small class="st-linkhint" id="link-hint">Incolla il link: nome, foto e prezzo arrivano dal sito.</small></div><div class="field full"><label>Nome *</label><input name="name" value="${esc(v.name)}" required placeholder="Es. Cappotto lana"></div><div class="field"><label>Categoria *</label><select name="category" required>${v.category ? '' : '<option value="" selected disabled>Scegli categoria…</option>'}${CATEGORIES.map((c) => `<option ${c === v.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label>Priorità</label><select name="priority">${['Alta', 'Media', 'Bassa'].map((p) => `<option ${p === v.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></div><div class="field"><label>Stagione</label><select name="season">${SEASONS.map((s) => `<option ${s === v.season ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="field"><label>Anno</label><input name="year" list="year-form-options" value="${esc(v.year)}">${yearDatalist('year-form-options')}</div><div class="field full"><label>Prezzo previsto €</label><input name="expectedPrice" type="number" step="0.01" inputmode="decimal" value="${esc(v.expectedPrice)}"></div><details class="field full moredetails" ${v.brand || v.color || v.size || v.shop ? 'open' : ''}><summary>Dettagli <small>marca, colore, taglia, negozio</small></summary><div class="formgrid"><div class="field"><label>Marca</label><input name="brand" value="${esc(v.brand)}"></div><div class="field"><label>Colore</label><input name="color" value="${esc(v.color)}"></div><div class="field"><label>Taglia</label><input name="size" value="${esc(v.size)}"></div><div class="field"><label>Negozio</label><input name="shop" value="${esc(v.shop)}"></div></div></details><div class="field full"><label>Note</label><textarea name="notes" placeholder="Es. Aspettare i saldi">${esc(v.notes)}</textarea></div></div></form>`,
  );
  state.draftPhotos = draftPhotosSnapshot;
  state.draftPhotosNew = new Set();
  state.formSaved = false;
  state.activeForm = 'item';
  bindPhotoForm();
  sheet.querySelector('#item-form').onsubmit = saveItemFromForm;
  await renderPhotoPreview();
}
async function openWardrobeForm(item = null) {
  state.editingId = item?.id || null;
  const draftPhotosSnapshot = (item?.photos || []).map((x) => ({ ...x }));
  const v = itemFormValues(item || {});
  sheetOpen(
    `${formSheetHead(item ? 'Modifica capo' : 'Aggiungi al guardaroba', 'wardrobe-form')}<form id="wardrobe-form"><div class="field full"><label>Foto</label><div class="photoactions"><button type="button" class="ghostbtn" id="take-photo">📷 Fotocamera</button><button type="button" class="ghostbtn" id="pick-photo">🖼️ Galleria</button><button type="button" class="ghostbtn" id="web-photo">🌐 Da web</button></div><div id="web-import" class="webrow" hidden><input id="web-url" type="url" placeholder="Incolla URL immagine https://..."><button type="button" class="solidbtn" id="add-web-url">Aggiungi</button></div><div class="photopreview" id="photo-preview"></div></div><div class="formgrid"><div class="field full"><label>Nome *</label><input name="name" value="${esc(v.name)}" required placeholder="Es. Giacca di jeans"></div><div class="field"><label>Categoria *</label><select name="category" required>${v.category ? '' : '<option value="" selected disabled>Scegli categoria…</option>'}${CATEGORIES.map((c) => `<option ${c === v.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label>Stagione</label><select name="season">${SEASONS.map((s) => `<option ${s === v.season ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="field"><label>Anno</label><input name="year" list="wardrobe-year-options" value="${esc(v.year)}">${yearDatalist('wardrobe-year-options')}</div><details class="field full moredetails" ${v.brand || v.color || v.size ? 'open' : ''}><summary>Dettagli <small>marca, colore, taglia</small></summary><div class="formgrid"><div class="field"><label>Marca</label><input name="brand" value="${esc(v.brand)}"></div><div class="field"><label>Colore</label><input name="color" value="${esc(v.color)}"></div><div class="field full"><label>Taglia</label><input name="size" value="${esc(v.size)}"></div></div></details><div class="field full"><label>Note</label><textarea name="notes" placeholder="Dettagli sul capo, abbinamenti, condizioni...">${esc(v.notes)}</textarea></div></div></form>`,
  );
  state.draftPhotos = draftPhotosSnapshot;
  state.draftPhotosNew = new Set();
  state.formSaved = false;
  state.activeForm = 'wardrobe';
  bindPhotoForm();
  sheet.querySelector('#wardrobe-form').onsubmit = saveWardrobeItemFromForm;
  await renderPhotoPreview();
}
async function saveWardrobeItemFromForm(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget),
    old = state.items.find((i) => i.id === state.editingId);
  const obj = {
    id: old?.id || id(),
    name: String(fd.get('name') || '').trim(),
    category: String(fd.get('category') || 'Altro'),
    season: String(fd.get('season') || state.season),
    year: String(fd.get('year') || '').trim() || defaultYear(),
    brand: String(fd.get('brand') || '').trim(),
    color: String(fd.get('color') || '').trim(),
    size: String(fd.get('size') || '').trim(),
    expectedPrice: old?.expectedPrice || 0,
    priority: old?.priority || 'Media',
    shop: old?.shop || '',
    url: old?.url || '',
    notes: String(fd.get('notes') || '').trim(),
    status: 'owned',
    paidPrice: null,
    purchasedAt: null,
    inWardrobe: true,
    photos: state.draftPhotos.map((x) => ({ ...x })),
    createdAt: old?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // v1.13.0 — controllo del prezzo e utilizzi (restano anche modificando l'articolo)
    priceCheck: old?.priceCheck || null,
    priceDrop: old?.priceDrop || null,
    wears: old?.wears || 0,
    lastWorn: old?.lastWorn || null,
  };
  if (!obj.name) {
    toast('Inserisci il nome');
    return;
  }
  await put('items', obj);
  state.items = state.items.filter((i) => i.id !== obj.id).concat(obj);
  state.formSaved = true;
  sheet.close();
  toast(old ? 'Capo aggiornato' : 'Aggiunto al guardaroba');
  render();
}

function bindPhotoForm() {
  sheet.querySelector('#take-photo')?.addEventListener('click', () => cameraInput.click());
  sheet.querySelector('#pick-photo')?.addEventListener('click', () => galleryInput.click());
  sheet.querySelector('#web-photo')?.addEventListener('click', () => {
    const r = sheet.querySelector('#web-import');
    if (r) r.hidden = !r.hidden;
  });
  sheet.querySelector('#add-web-url')?.addEventListener('click', () => {
    const input = sheet.querySelector('#web-url');
    const url = input?.value.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      toast('URL immagine non valido');
      return;
    }
    state.draftPhotos.push({ type: 'web', url });
    input.value = '';
    renderPhotoPreview();
  });
  // v1.13.0 — dal link del negozio: nome, foto e prezzo
  const urlInput = sheet.querySelector('input[name="url"]'), fetchBtn = sheet.querySelector('#link-fetch'), hint = sheet.querySelector('#link-hint');
  async function fillFromLink() {
    const url = (urlInput?.value || '').trim();
    if (!/^https?:\/\//i.test(url)) { if (hint) hint.textContent = 'Incolla un link che inizi con https://'; return; }
    if (!window.SuiteLink) return;
    if (hint) hint.textContent = 'Leggo il sito…';
    if (fetchBtn) fetchBtn.disabled = true;
    const p = await SuiteLink.preview(url);
    if (fetchBtn) fetchBtn.disabled = false;
    if (!sheet.open) return;
    if (!p) { if (hint) hint.textContent = 'Non riesco a leggere questo sito: il link resta salvato, completa tu i dati.'; return; }
    const f = sheet.querySelector('form');
    const setIfEmpty = (name, val) => { const el = f?.elements?.[name]; if (el && val && !String(el.value || '').trim()) el.value = val; };
    setIfEmpty('name', p.title);
    setIfEmpty('shop', p.publisher);
    if (p.price) setIfEmpty('expectedPrice', String(p.price));
    if (p.image && !state.draftPhotos.length) { state.draftPhotos.push({ type: 'web', url: p.image }); renderPhotoPreview(); }
    if (p.url && urlInput) urlInput.value = p.url;
    if (hint) hint.textContent = `Dati presi da ${p.publisher || 'sito'}${p.price ? '' : ' (il sito non indica il prezzo)'}.`;
  }
  fetchBtn?.addEventListener('click', fillFromLink);
  urlInput?.addEventListener('paste', () => setTimeout(fillFromLink, 60));
}
async function compressImage(file, maxSize = 1200, quality = 0.78) {
  try {
    if (!('createImageBitmap' in window)) return file;
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (Math.max(width, height) <= maxSize) {
      bitmap.close?.();
      return file;
    }
    const scale = maxSize / Math.max(width, height);
    const w = Math.max(1, Math.round(width * scale)),
      h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return blob || file;
  } catch (e) {
    console.warn('Compressione foto non riuscita, salvo originale', e);
    return file;
  }
}
async function addFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const pid = 'p_' + id();
    const blob = await compressImage(file);
    await put('photos', { id: pid, blob, createdAt: new Date().toISOString() });
    state.draftPhotos.push({ type: 'local', id: pid });
    state.draftPhotosNew.add(pid);
    /* v1.16.0 — Capo dalla foto: alla prima foto, se il nome è ancora vuoto,
       il modello guarda lo scatto e compila nome, categoria, colore e stagione.
       Non tocca niente di già scritto: quello che c'è resta. */
    leggiCapoDallaFoto(file);
  }
  await renderPhotoPreview();
}
async function leggiCapoDallaFoto(file) {
  if (!(window.SuiteAI && SuiteAI.disponibile())) return;
  const form = sheet.querySelector('#item-form, #wardrobe-form');
  const nameInput = form?.querySelector('input[name="name"]');
  if (!nameInput || nameInput.value.trim()) return;
  const hint = sheet.querySelector('#link-hint');
  if (hint) hint.textContent = 'Sto guardando la foto…';
  const d = await SuiteAI.daFoto('capo', file, {
    opzioni: CATEGORIES.map((c) => ({ chiave: c, nome: c })),
    contesto: { stagioni: SEASONS },
  });
  if (!d || !d.nome || !form.isConnected || nameInput.value.trim()) {
    if (hint) hint.textContent = 'Incolla il link: nome, foto e prezzo arrivano dal sito.';
    return;
  }
  const set = (sel, val) => { const el = form.querySelector(sel); if (el && !el.value.trim() && val) el.value = val; };
  nameInput.value = String(d.nome).slice(0, 80);
  set('input[name="color"]', d.colore);
  const cat = form.querySelector('select[name="category"]');
  if (cat && !cat.value) {
    const scelta = CATEGORIES.find((c) => c.toLowerCase() === String(d.tipo || '').toLowerCase())
      || CATEGORIES.find((c) => String(d.tipo || '').toLowerCase().includes(c.toLowerCase()));
    if (scelta) cat.value = scelta;
  }
  const sea = form.querySelector('select[name="season"]');
  if (sea) {
    const st = SEASONS.find((x) => x.toLowerCase() === String(d.stagione || '').toLowerCase());
    if (st) sea.value = st;
  }
  const note = form.querySelector('textarea[name="notes"]');
  if (note && !note.value.trim() && Array.isArray(d.tag) && d.tag.length) note.value = d.tag.slice(0, 5).join(', ');
  if (hint) hint.textContent = 'Nome e dettagli presi dalla foto: controlla e correggi.';
  toast('Capo letto dalla foto');
}
galleryInput.onchange = async () => {
  await addFiles([...galleryInput.files]);
  galleryInput.value = '';
};
cameraInput.onchange = async () => {
  await addFiles([...cameraInput.files]);
  cameraInput.value = '';
};
async function renderPhotoPreview() {
  const root = sheet.querySelector('#photo-preview');
  if (!root) return;
  root.innerHTML = '';
  for (let i = 0; i < state.draftPhotos.length; i++) {
    const ref = state.draftPhotos[i],
      src = await photoSrc(ref);
    const div = document.createElement('div');
    div.className = 'previewtile';
    div.innerHTML = src
      ? `<img src="${esc(src)}" alt="Foto articolo"><button type="button" data-remove-photo="${i}" aria-label="Rimuovi foto">✕</button>`
      : `<span>Foto</span>`;
    root.appendChild(div);
  }
  root.querySelectorAll('[data-remove-photo]').forEach(
    (b) =>
      (b.onclick = async () => {
        const idx = Number(b.dataset.removePhoto),
          ref = state.draftPhotos[idx];
        state.draftPhotos.splice(idx, 1);
        if (ref?.type === 'local') {
          state.draftPhotosNew.delete(ref.id);
          if (!state.items.some((i) => i.photos?.some((p) => p.id === ref.id))) await del('photos', ref.id);
        }
        renderPhotoPreview();
      }),
  );
}
async function saveItemFromForm(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget),
    old = state.items.find((i) => i.id === state.editingId);
  const obj = {
    id: old?.id || id(),
    name: String(fd.get('name')).trim(),
    category: String(fd.get('category')),
    season: String(fd.get('season')),
    year: String(fd.get('year')).trim() || defaultYear(),
    brand: String(fd.get('brand')).trim(),
    color: String(fd.get('color')).trim(),
    size: String(fd.get('size')).trim(),
    expectedPrice: Number(String(fd.get('expectedPrice')).replace(',', '.')) || 0,
    priority: String(fd.get('priority')),
    shop: String(fd.get('shop')).trim(),
    url: String(fd.get('url')).trim(),
    notes: String(fd.get('notes')).trim(),
    status: old?.status || 'wishlist',
    paidPrice: old?.paidPrice ?? null,
    purchasedAt: old?.purchasedAt ?? null,
    inWardrobe: old?.inWardrobe ?? true,
    photos: state.draftPhotos.map((x) => ({ ...x })),
    createdAt: old?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // v1.13.0 — controllo del prezzo e utilizzi (restano anche modificando l'articolo)
    priceCheck: old?.priceCheck || null,
    priceDrop: old?.priceDrop || null,
    wears: old?.wears || 0,
    lastWorn: old?.lastWorn || null,
  };
  if (!obj.name) {
    toast('Inserisci il nome');
    return;
  }
  await put('items', obj);
  state.items = state.items.filter((i) => i.id !== obj.id).concat(obj);
  state.formSaved = true;
  sheet.close();
  toast(old ? 'Articolo aggiornato' : 'Articolo aggiunto');
  render();
}

async function openDetails(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;
  const src = await firstPhotoSrc(item);
  const owned = item.status === 'owned';
  const lastBox = owned
    ? '<div class="detailbox"><small>Tipo</small><b>Articolo personale</b></div>'
    : `<div class="detailbox"><small>${item.status === 'purchased' ? 'Pagato' : 'Prezzo previsto'}</small><b>${money(item.status === 'purchased' ? (item.paidPrice ?? item.expectedPrice) : item.expectedPrice)}</b></div>`;
  const actions = `<button class="ghostbtn${owned ? ' full' : ''}" id="edit-item">Modifica</button>${owned ? '' : '<button class="ghostbtn" id="duplicate-item">Duplica</button>'}${!['purchased', 'owned'].includes(item.status) ? '<button class="solidbtn full" id="mark-purchased">Acquista</button>' : ''}${item.status === 'purchased' ? `<button class="ghostbtn full" id="toggle-wardrobe">${item.inWardrobe === false ? 'Aggiungi al guardaroba' : 'Rimuovi dal guardaroba'}</button>` : ''}<button class="dangerbtn full" id="delete-item">Elimina</button>`;
  sheetOpen(
    `${sheetHead(item.name)}${src ? `<img class="detailsphoto" src="${esc(src)}" alt="${esc(item.name)}">` : ''}<div class="detailgrid"><div class="detailbox"><small>Categoria</small><b>${esc(item.category)}</b></div><div class="detailbox"><small>Stagione</small><b>${esc(item.season)} ${esc(item.year)}</b></div><div class="detailbox"><small>Marca</small><b>${esc(item.brand || '—')}</b></div><div class="detailbox"><small>Taglia</small><b>${esc(item.size || '—')}</b></div><div class="detailbox"><small>Colore</small><b>${esc(item.color || '—')}</b></div>${lastBox}</div>${item.purchasedAt ? `<div class="muted" style="font-size:13px;margin-bottom:10px">Acquistato il ${fmtDate(item.purchasedAt)}</div>` : ''}${owned ? '<div class="ownednote">Aggiunto manualmente al tuo guardaroba.</div>' : ''}${item.notes ? `<div class="notes">${esc(item.notes)}</div>` : ''}${item.url && !owned ? `<a class="solidbtn" style="display:block;text-align:center;text-decoration:none;margin-top:10px" href="${esc(item.url)}" target="_blank" rel="noopener">Apri prodotto</a>` : ''}<div class="detailactions">${actions}</div>`,
  );
  // v1.13.0 — prezzo controllato dal link e utilizzi (costo per utilizzo) per ciò che è nel guardaroba
  const inWardrobe = owned || (item.status === 'purchased' && item.inWardrobe !== false);
  let extra = '';
  if (!inWardrobe && /^https?:\/\//i.test(item.url || '')) {
    extra += `<div class="pricewatch">${item.priceDrop ? `<p class="drop">📉 Prezzo sceso da <s>${money(item.priceDrop.from)}</s> a <b>${money(item.priceDrop.to)}</b></p>` : item.priceCheck ? `<p>Prezzo sul sito: <b>${money(item.priceCheck.price)}</b></p>` : '<p>Il prezzo sul sito viene controllato una volta al giorno.</p>'}<small>${item.priceCheck ? `Ultimo controllo: ${esc(item.priceCheck.at.split('-').reverse().join('/'))}` : ''}</small><button type="button" class="ghostbtn" id="check-price">Controlla ora</button></div>`;
  }
  if (inWardrobe) {
    const cpw = costPerWear(item);
    extra += `<div class="wears"><div><b>👕 Indossato ${item.wears || 0} ${item.wears === 1 ? 'volta' : 'volte'}</b><small>${cpw ? `Costo per utilizzo: ${money(cpw)}` : 'Segna ogni volta che lo metti: vedrai quanto ti costa ogni utilizzo.'}${item.lastWorn ? ` · ultima volta ${esc(item.lastWorn.split('-').reverse().join('/'))}` : ''}</small></div><div class="wearbtns"><button type="button" class="ghostbtn" id="wear-minus" aria-label="Togli un utilizzo"${item.wears ? '' : ' disabled'}>−</button><button type="button" class="solidbtn" id="wear-plus">＋1 oggi</button></div></div>`;
  }
  if (extra) sheet.querySelector('.detailgrid')?.insertAdjacentHTML('afterend', extra);
  sheet.querySelector('#check-price')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true; ev.currentTarget.textContent = 'Controllo…';
    const price = await checkItemPrice(item, { quiet: true });
    toast(price ? (item.priceDrop ? `📉 Prezzo sceso a ${money(price)}` : `Prezzo sul sito: ${money(price)}`) : 'Il sito non indica il prezzo');
    openDetails(item.id);
    render();
  });
  const wear = async (d) => {
    item.wears = Math.max(0, (item.wears || 0) + d);
    if (d > 0) item.lastWorn = todayStr();
    item.updatedAt = new Date().toISOString();
    await put('items', item);
    openDetails(item.id);
    render();
  };
  sheet.querySelector('#wear-plus')?.addEventListener('click', () => wear(1));
  sheet.querySelector('#wear-minus')?.addEventListener('click', () => wear(-1));
  sheet.querySelector('#edit-item').onclick = () => (owned ? openWardrobeForm(item) : openItemForm(item));
  sheet.querySelector('#duplicate-item')?.addEventListener('click', () => duplicateItem(item));
  sheet.querySelector('#mark-purchased')?.addEventListener('click', () => purchaseDialog(item));
  sheet.querySelector('#toggle-wardrobe')?.addEventListener('click', async () => {
    item.inWardrobe = item.inWardrobe === false;
    await put('items', item);
    sheet.close();
    render();
  });
  sheet.querySelector('#delete-item').onclick = () => deleteItem(item);
}
async function duplicateItem(item) {
  const copy = {
    ...item,
    id: id(),
    status: 'wishlist',
    paidPrice: null,
    purchasedAt: null,
    inWardrobe: true,
    name: item.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await put('items', copy);
  state.items.push(copy);
  sheet.close();
  toast('Articolo duplicato');
  render();
}
function purchaseDialog(item) {
  sheetOpen(
    `${sheetHead('Acquista articolo')}<form id="purchase-form"><div class="formgrid"><div class="field full"><label>Articolo</label><input value="${esc(item.name)}" disabled></div><div class="field"><label>Prezzo pagato €</label><input name="paid" type="number" step="0.01" inputmode="decimal" value="${esc(item.expectedPrice || '')}"></div><div class="field"><label>Data acquisto</label><input name="date" type="date" value="${today()}"></div><div class="field full"><div class="purchasehint">Dopo l’acquisto l’articolo verrà aggiunto automaticamente al Guardaroba.</div></div></div><div class="formactions"><button type="button" class="ghostbtn" data-close>Annulla</button><button class="solidbtn" type="submit">Conferma</button></div></form>`,
  );
  sheet.querySelector('#purchase-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    item.status = 'purchased';
    item.paidPrice = Number(String(fd.get('paid')).replace(',', '.')) || item.expectedPrice || 0;
    item.purchasedAt = String(fd.get('date')) || today();
    item.inWardrobe = true;
    item.updatedAt = new Date().toISOString();
    await put('items', item);
    sheet.close();
    toast('Acquisto registrato e aggiunto al guardaroba');
    render();
  };
}
let pendingDelete = null;
async function finalizePendingDelete() {
  if (!pendingDelete) return;
  const item = pendingDelete.item;
  clearTimeout(pendingDelete.timer);
  pendingDelete = null;
  await del('items', item.id);
  for (const ref of item.photos || []) {
    if (ref.type === 'local') {
      const usedElsewhere = state.items.some((i) => i.photos?.some((p) => p.id === ref.id));
      if (!usedElsewhere) await del('photos', ref.id);
    }
  }
}
async function deleteItem(item) {
  await finalizePendingDelete();
  state.items = state.items.filter((i) => i.id !== item.id);
  sheet.close();
  render();
  const timer = setTimeout(finalizePendingDelete, 5000);
  pendingDelete = { item, timer };
  toast(`“${item.name}” eliminato`, {
    actionLabel: 'Annulla',
    duration: 5000,
    onAction: () => {
      if (!pendingDelete) return;
      clearTimeout(pendingDelete.timer);
      pendingDelete = null;
      state.items.push(item);
      render();
    },
  });
}
function editBudget() {
  const current = state.budgets[budgetKey()] || '';
  sheetOpen(
    `${sheetHead('Budget stagione')}<form id="budget-form"><div class="field"><label>Budget ${esc(state.season)} ${esc(state.year)} (€)</label><input name="budget" type="number" step="1" min="0" inputmode="decimal" value="${esc(current)}" placeholder="Es. 1000"></div><div class="formactions"><button type="button" class="ghostbtn" data-close>Annulla</button><button class="solidbtn">Salva</button></div></form>`,
  );
  sheet.querySelector('#budget-form').onsubmit = async (e) => {
    e.preventDefault();
    const n = Number(new FormData(e.currentTarget).get('budget')) || 0;
    if (n > 0) state.budgets[budgetKey()] = n;
    else delete state.budgets[budgetKey()];
    await saveBudgets();
    sheet.close();
    render();
  };
}

async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
async function dataURLToBlob(data) {
  const res = await fetch(data);
  return res.blob();
}
async function exportBackup() {
  const photos = [];
  for (const rec of await getAll('photos'))
    photos.push({ id: rec.id, data: await blobToDataURL(rec.blob), createdAt: rec.createdAt });
  const payload = {
    app: 'Style Wishlist',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    items: state.items,
    budgets: state.budgets,
    photos,
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  a.download = `style-wishlist-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  state.lastBackupAt = new Date().toISOString();
  await put('settings', { key: 'lastBackupAt', value: state.lastBackupAt });
  if (state.tab === 'more') render();
}
/* v1.3.0 — Conferma in-app al posto del confirm() del browser. */
function askConfirm(msg, { ok = 'Conferma', cancel = 'Annulla', danger = false } = {}) {
  return new Promise((res) => {
    let d = document.getElementById('ask-dialog');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'ask-dialog';
      d.className = 'ask-dialog';
      document.body.append(d);
    }
    if (d.open) d.close();
    d.innerHTML = `<p class="ask-msg">${esc(msg)}</p><div class="ask-actions"><button type="button" class="ask-cancel">${esc(cancel)}</button><button type="button" class="ask-ok ${danger ? 'danger' : ''}">${esc(ok)}</button></div>`;
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      d.close();
      res(v);
    };
    d.querySelector('.ask-ok').onclick = () => done(true);
    d.querySelector('.ask-cancel').onclick = () => done(false);
    d.oncancel = (e) => {
      e.preventDefault();
      done(false);
    };
    d.onclick = (e) => {
      if (e.target === d) done(false);
    };
    d.showModal();
    d.querySelector('.ask-cancel').focus();
  });
}
backupInput.onchange = async () => {
  const file = backupInput.files?.[0];
  backupInput.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items)) throw new Error('Formato non valido');
    if (
      !(await askConfirm('Importare il backup? I dati attuali verranno sostituiti.', {
        ok: 'Importa',
        danger: true,
      }))
    )
      return;
    await finalizePendingDelete();
    /* v1.2.1: prima si preparano tutte le foto, poi un'unica transazione: se qualcosa fallisce i dati attuali restano intatti. */ const photoRecs =
      [];
    for (const p of data.photos || [])
      photoRecs.push({ id: p.id, blob: await dataURLToBlob(p.data), createdAt: p.createdAt });
    const budgets = data.budgets || {};
    const db = await openDB();
    await new Promise((res, rej) => {
      const t = db.transaction(['items', 'photos', 'settings'], 'readwrite');
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Import annullato'));
      const items = t.objectStore('items'),
        photos = t.objectStore('photos'),
        settings = t.objectStore('settings');
      items.clear();
      photos.clear();
      settings.clear();
      for (const item of data.items) items.put(item);
      for (const p of photoRecs) photos.put(p);
      settings.put({ key: 'budgets', value: budgets });
    });
    state.budgets = budgets;
    revokePhotoUrls();
    await loadData();
    styleChanged();
    toast('Backup importato');
  } catch (e) {
    console.error(e);
    toast('Backup non valido');
  }
};
async function clearAllData() {
  if (
    !(await askConfirm('Cancellare definitivamente tutti i dati di Style Wishlist?', {
      ok: 'Cancella tutto',
      danger: true,
    }))
  )
    return;
  if (pendingDelete) {
    clearTimeout(pendingDelete.timer);
    pendingDelete = null;
  }
  const db = await openDB();
  for (const store of ['items', 'photos', 'settings'])
    await new Promise((res, rej) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).clear();
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  state.items = [];
  state.budgets = {};
  revokePhotoUrls();
  render();
  toast('Dati cancellati');
}

function resetMainMotion() {
  if (main.getAnimations) main.getAnimations().forEach((a) => a.cancel());
  main.style.transform = 'none';
  main.style.opacity = '1';
}
function switchTab(tab, dir = 0) {
  if (!TABS.includes(tab) || tab === state.tab) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const apply = () => {
    state.tab = tab;
    state.filter = 'Tutti';
    state.search = '';
    window.scrollTo(0, 0);
    render();
  };
  resetMainMotion();
  if (reduce || !main.animate) {
    apply();
    return;
  }
  const sign = dir || Math.sign(TABS.indexOf(tab) - TABS.indexOf(state.tab)) || 1;
  const out = main.animate(
    [
      { transform: 'translate3d(0,0,0)', opacity: 1 },
      { transform: `translate3d(${sign > 0 ? '-7%' : '7%'},0,0)`, opacity: 0.88 },
    ],
    { duration: 120, easing: 'ease-in', fill: 'none' },
  );
  out.finished
    .then(() => {
      out.cancel();
      apply();
      requestAnimationFrame(() => {
        resetMainMotion();
        const incoming = main.animate(
          [
            { transform: `translate3d(${sign > 0 ? '7%' : '-7%'},0,0)`, opacity: 0.88 },
            { transform: 'translate3d(0,0,0)', opacity: 1 },
          ],
          { duration: 180, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'none' },
        );
        incoming.finished.catch(() => {}).finally(() => resetMainMotion());
      });
    })
    .catch(() => {
      resetMainMotion();
      apply();
    });
}
let touch = null;
main.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length !== 1 || e.target.closest('button,input,select,textarea,a')) {
      touch = null;
      return;
    }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  },
  { passive: true },
);
main.addEventListener(
  'touchend',
  (e) => {
    if (!touch || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - touch.x,
      dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    const idx = TABS.indexOf(state.tab),
      next = (idx + (dx < 0 ? 1 : -1) + TABS.length) % TABS.length;
    switchTab(TABS[next], dx < 0 ? 1 : -1);
  },
  { passive: true },
);
document.querySelectorAll('#page-tabs button').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
quickAdd.onclick = () => (state.tab === 'wardrobe' ? openWardrobeForm() : openItemForm());
sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest?.('[data-close]')) sheet.close();
});
async function cleanupOrphanDraftPhotos() {
  for (const pid of state.draftPhotosNew) {
    const usedElsewhere = state.items.some((i) => i.photos?.some((p) => p.id === pid));
    if (!usedElsewhere) await del('photos', pid);
  }
  state.draftPhotosNew = new Set();
}
sheet.addEventListener('close', () => {
  const wasUnsavedItemForm = ['item', 'wardrobe'].includes(state.activeForm) && !state.formSaved;
  state.activeForm = null;
  if (wasUnsavedItemForm) cleanupOrphanDraftPhotos().catch(console.error);
});

function showUpdateBanner(reg) {
  // 1.8.0: stesso popup centrale di Bilancio e Noi Due.
  const apply = () => (reg?.waiting ? reg.waiting.postMessage('skip-waiting') : location.reload());
  if (window.SuiteUpdate) SuiteUpdate.show('Style', apply);
  else apply();
}
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      if (!reg) return;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(reg);
        });
      });
    } catch (e) {
      console.error(e);
    }
  });
}
loadData().catch((e) => {
  console.error(e);
  main.innerHTML = '<div class="empty">Errore durante il caricamento dei dati locali.</div>';
});

/* Pannelli (dialog): si chiudono con uno swipe verso il basso o verso destra.
   Il pannello segue il dito; sotto la soglia torna al suo posto. */
(function () {
  let g = null;
  const SKIP = 'input,textarea,select,[contenteditable="true"],canvas,svg,.no-swipe';
  function scroller(d, t) {
    for (let n = t; n && n !== d.parentElement; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 2) {
        const oy = getComputedStyle(n).overflowY;
        if (oy === 'auto' || oy === 'scroll') return n;
      }
    }
    return null;
  }
  function canScrollLeft(d, t) {
    for (let n = t; n && n !== d.parentElement; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 2 && n.scrollLeft > 0) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
    }
    return false;
  }
  document.addEventListener('touchstart', (e) => {
    g = null;
    const d = e.target.closest && e.target.closest('dialog[open]');
    if (!d || e.touches.length !== 1) return;
    const t = e.touches[0];
    const sc = scroller(d, e.target);
    g = { d, x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY, lt: performance.now(), v: 0, axis: null, dead: false,
      top: !sc || sc.scrollTop <= 1, canX: !e.target.closest(SKIP) && !canScrollLeft(d, e.target) };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!g || g.dead) return;
    const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (!g.axis) {
      if (g.canX && dx > 12 && dx > Math.abs(dy) * 1.3) g.axis = 'x';
      else if (g.top && dy > 10 && dy > Math.abs(dx) * 1.2) g.axis = 'y';
      else if (Math.abs(dx) > 12 || Math.abs(dy) > 12) { g.dead = true; return; }
      else return;
      g.d.style.transition = 'none';
    }
    e.preventDefault();
    const now = performance.now();
    g.v = (g.axis === 'x' ? t.clientX - g.lx : t.clientY - g.ly) / Math.max(1, now - g.lt);
    g.lx = t.clientX; g.ly = t.clientY; g.lt = now;
    const d = Math.max(0, g.axis === 'x' ? dx : dy);
    g.d.style.transform = g.axis === 'x' ? `translateX(${d}px)` : `translateY(${d}px)`;
    g.d.style.opacity = String(1 - Math.min(d, 400) / 900);
  }, { passive: false });
  function end(e) {
    if (!g) return;
    const s = g; g = null;
    if (!s.axis) return;
    const t = e.changedTouches && e.changedTouches[0];
    const d = t ? (s.axis === 'x' ? t.clientX - s.x : t.clientY - s.y) : 0;
    s.d.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1), opacity .2s ease';
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', stop, true);
    setTimeout(() => document.removeEventListener('click', stop, true), 350);
    if (d > 90 || (s.v > 0.5 && d > 36)) {
      s.d.style.transform = s.axis === 'x' ? 'translateX(110%)' : 'translateY(110%)';
      s.d.style.opacity = '0';
      setTimeout(() => {
        document.removeEventListener('click', stop, true);
        // Usa lo stesso percorso di chiusura del pulsante ✕, se c'è.
        const btn = s.d.querySelector('[data-close], .ask-cancel');
        if (btn) btn.click(); else s.d.close();
        if (s.d.open) s.d.close();
        s.d.style.transition = ''; s.d.style.transform = ''; s.d.style.opacity = '';
      }, 190);
    } else {
      s.d.style.transform = ''; s.d.style.opacity = '';
      setTimeout(() => { s.d.style.transition = ''; }, 220);
    }
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
})();

/* La copertura della barra di stato appare solo quando si scorre (niente stacco in cima). */
(function () {
  // Lo scorrimento può avvenire sulla finestra o sul body (html/body con overflow-x nascosto).
  const upd = () => {
    const y = Math.max(window.scrollY || 0, document.body ? document.body.scrollTop : 0, document.documentElement.scrollTop || 0);
    document.documentElement.classList.toggle('is-scrolled', y > 4);
  };
  document.addEventListener('scroll', upd, { passive: true, capture: true });
  upd();
})();

/* 1.10.0 — Sincronizzazione online (Supabase), tabella app_data, app "style".
   Articoli e budget nel database; le foto nello spazio file "foto" (cartella dell'utente). */
function styleChanged() {
  try { localStorage.setItem('style_updated_at', new Date().toISOString()); } catch (e) {}
  if (window.syncStyle) syncStyle.changed();
}
function stylePhotoUploaded() {
  try { return new Set(JSON.parse(localStorage.getItem('style_uploaded_photos') || '[]')); } catch (e) { return new Set(); }
}
function markStylePhotoUploaded(id) {
  const s = stylePhotoUploaded();
  s.add(id);
  try { localStorage.setItem('style_uploaded_photos', JSON.stringify([...s].slice(-3000))); } catch (e) {}
}
var syncStyle = window.SuiteSync
  ? SuiteSync.register({
      app: 'style',
      name: 'Style',
      scope: 'personal',
      getLocal: async () => ({ items: await getAll('items'), budgets: state.budgets || {} }),
      hasLocalData: () => state.items.length > 0,
      localUpdatedAt: () => localStorage.getItem('style_updated_at'),
      setLocal: async (data) => {
        const items = Array.isArray(data?.items) ? data.items : [];
        const db = await openDB();
        await new Promise((res, rej) => {
          const t = db.transaction(['items', 'settings'], 'readwrite');
          t.oncomplete = res;
          t.onerror = () => rej(t.error);
          const st = t.objectStore('items');
          st.clear();
          items.forEach((it) => st.put(it));
          t.objectStore('settings').put({ key: 'budgets', value: data?.budgets || {} });
        });
        state.items = items;
        state.budgets = data?.budgets || {};
        if (!document.getElementById('sheet')?.open) render();
      },
      afterPush: async (S) => {
        const done = stylePhotoUploaded();
        const ids = new Set();
        state.items.forEach((it) => (it.photos || []).forEach((p) => p && p.type !== 'web' && p.id && ids.add(p.id)));
        for (const id of ids) {
          if (done.has(id)) continue;
          const rec = await getOne('photos', id);
          if (!rec?.blob) continue;
          await S.uploadPhoto(`${SuiteSync.userId}/style/${id}`, rec.blob);
          markStylePhotoUploaded(id);
        }
      },
    })
  : null;
