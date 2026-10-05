/* Parti comuni a RecompApp e Style, uguali a Bilancio e Noi Due:
   - tema Sistema / Chiaro / Scuro;
   - popup centrale "Nuova versione disponibile".
   Caricato nel <head> prima dei fogli di stile: imposta data-theme sull'html senza lampeggi. */
(function () {
  var root = document.documentElement;
  // Bilancio e Noi Due gestiscono il tema da sole: qui il tema si attiva solo se la pagina ha data-theme-key.
  var THEMED = root.hasAttribute('data-theme-key');
  var KEY = root.getAttribute('data-theme-key') || 'app_theme';
  var mode = 'system';
  try { mode = localStorage.getItem(KEY) || 'system'; } catch (e) {}
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function effective() { return mode === 'system' ? (mq && mq.matches ? 'dark' : 'light') : mode; }
  function apply() {
    if (!THEMED) return;
    var t = effective();
    root.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#12181f' : '#f1f2ed');
    var btns = document.querySelectorAll('[data-suite-theme]');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-suite-theme') === mode;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  apply();
  if (mq) (mq.addEventListener ? mq.addEventListener('change', function () { if (mode === 'system') apply(); }) : mq.addListener(function () { if (mode === 'system') apply(); }));
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('click', function (e) {
    var b = THEMED && e.target.closest && e.target.closest('[data-suite-theme]');
    if (!b) return;
    mode = b.getAttribute('data-suite-theme');
    try { localStorage.setItem(KEY, mode); } catch (err) {}
    apply();
  });
  var ICONS = {
    system: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    light: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'
  };
  window.SuiteTheme = {
    mode: function () { return mode; },
    card: function (opts) {
      opts = opts || {};
      var seg = ['system', 'light', 'dark'].map(function (m) {
        var label = m === 'system' ? 'Sistema' : m === 'light' ? 'Chiaro' : 'Scuro';
        return '<button type="button" class="suite-seg-opt' + (m === mode ? ' active' : '') + '" data-suite-theme="' + m + '" aria-pressed="' + (m === mode) + '">' + ICONS[m] + '<span>' + label + '</span></button>';
      }).join('');
      return '<div class="' + (opts.cls || 'card') + ' suite-theme-card"><' + (opts.h || 'h2') + '>Aspetto</' + (opts.h || 'h2') + '><div class="suite-seg" role="group" aria-label="Tema">' + seg + '</div><p class="muted suite-theme-hint">Sistema segue il tema chiaro o scuro del telefono.</p></div>';
    }
  };
  window.SuiteUpdate = {
    show: function (appName, onUpdate) {
      var panel = document.getElementById('appUpdatePrompt');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'appUpdatePrompt';
        panel.className = 'app-update-modal';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'appUpdateTitle');
        panel.innerHTML = '<div class="app-update-card"><div class="app-update-icon" aria-hidden="true">↻</div><h3 id="appUpdateTitle">Nuova versione disponibile</h3><p>Vuoi aggiornare ' + appName + ' adesso? I tuoi dati restano salvati sul telefono.</p><div class="app-update-actions"><button type="button" class="app-update-later">Più tardi</button><button type="button" class="app-update-now">Aggiorna</button></div></div>';
        document.body.appendChild(panel);
      }
      requestAnimationFrame(function () { panel.classList.add('show'); });
      var later = panel.querySelector('.app-update-later'), now = panel.querySelector('.app-update-now');
      later.onclick = function () { panel.classList.remove('show'); };
      now.disabled = false; now.textContent = 'Aggiorna';
      now.onclick = function () {
        now.disabled = true; now.textContent = 'Aggiorno…';
        try { onUpdate(); } catch (e) { location.reload(); }
        setTimeout(function () { location.reload(); }, 4000);
      };
    }
  };
  /* Promemoria backup uguale nelle 4 app: dopo 30 giorni senza backup, al massimo una volta a settimana. */
  window.SuiteBackup = {
    show: function (o) {
      var panel = document.getElementById('appBackupPrompt');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'appBackupPrompt';
        panel.className = 'app-update-modal suite-backup-modal';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.innerHTML = '<div class="app-update-card"><div class="app-update-icon" aria-hidden="true">⤓</div><h3>Backup consigliato</h3><p class="suite-backup-text"></p><div class="app-update-actions"><button type="button" class="app-update-later">Più tardi</button><button type="button" class="app-update-now">Esporta</button></div></div>';
        document.body.appendChild(panel);
      }
      var days = o.days;
      panel.querySelector('.suite-backup-text').textContent = (isFinite(days) ? 'L’ultimo backup di ' + o.app + ' è di ' + days + ' giorni fa.' : 'Non hai ancora esportato un backup di ' + o.app + '.') + ' I dati sono salvati solo su questo telefono.';
      requestAnimationFrame(function () { panel.classList.add('show'); });
      panel.querySelector('.app-update-later').onclick = function () { panel.classList.remove('show'); };
      panel.querySelector('.app-update-now').onclick = function () { panel.classList.remove('show'); try { o.onExport(); } catch (e) {} };
    },
    maybe: function (o) {
      try {
        if (!o.hasData) return;
        var last = o.last ? new Date(o.last).getTime() : NaN;
        var days = isFinite(last) ? Math.floor((Date.now() - last) / 86400000) : Infinity;
        if (days < 30) return;
        var k = 'suite_backup_prompt_' + o.key, prev = Number(localStorage.getItem(k) || 0);
        if (Date.now() - prev < 7 * 86400000) return;
        localStorage.setItem(k, String(Date.now()));
        o.days = days;
        this.show(o);
      } catch (e) {}
    }
  };
})();

/* ===================== Sincronizzazione online (Supabase) =====================
   Ogni app continua a salvare sul telefono (funziona anche offline) e in più tiene una copia
   nel database online. Accesso con email e password, una volta per app.
   - Bilancio, RecompApp, Style: tabella app_data (una riga per persona e per app).
   - Noi Due: tabella noidue_data (una riga per coppia, condivisa dai due telefoni).
   Regole: all'apertura, al ritorno nell'app, quando torna la rete e poco dopo ogni modifica.
   Se nel frattempo l'altro telefono ha cambiato qualcosa, i dati vengono uniti, non sovrascritti. */
(function () {
  var SB_URL = 'https://thdlzqhqdktbkpnplxdm.supabase.co';
  var SB_KEY = 'sb_publishable_47TpIhmNLOgojOKddeH1ZQ_b4PZamyG';
  try { var t = localStorage.getItem('suite_sb_url_test'); if (t) SB_URL = t; } catch (e) {}
  var SKEY = 'suite_sb_session';
  function now() { return new Date().toISOString(); }
  function readJSON(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var session = readJSON(SKEY, null);
  function saveSession(j) {
    session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user && j.user.id, email: j.user && j.user.email } };
    writeJSON(SKEY, session);
  }
  async function authCall(grant, body) {
    var r = await fetch(SB_URL + '/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(j.error_description || j.msg || j.message || ('Errore ' + r.status)); e.status = r.status; e.code = j.error_code; throw e; }
    saveSession(j);
    return session;
  }
  var refreshing = null;
  async function token() {
    if (!session) return null;
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    if (!refreshing) refreshing = authCall('refresh_token', { refresh_token: session.refresh_token }).catch(function (e) {
      if (e.status === 400 || e.status === 401) { session = null; try { localStorage.removeItem(SKEY); } catch (x) {} }
      throw e;
    }).finally(function () { refreshing = null; });
    await refreshing;
    return session && session.access_token;
  }
  async function api(path, opts) {
    opts = opts || {};
    var tk = await token();
    if (!tk) { var e = new Error('Non hai fatto l’accesso'); e.auth = true; throw e; }
    var h = { apikey: SB_KEY, Authorization: 'Bearer ' + tk };
    for (var k in (opts.headers || {})) h[k] = opts.headers[k];
    if (opts.json !== undefined) { h['Content-Type'] = 'application/json'; }
    var r = await fetch(SB_URL + path, { method: opts.method || 'GET', headers: h, body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body });
    if (r.status === 401) { session && (session.expires_at = 0); }
    if (!r.ok) { var t2 = await r.text().catch(function () { return ''; }); var er = new Error('Errore ' + r.status + (t2 ? ': ' + t2.slice(0, 160) : '')); er.status = r.status; throw er; }
    var ct = r.headers.get('content-type') || '';
    if (opts.raw) return r;
    return ct.indexOf('json') >= 0 ? r.json() : r.text();
  }

  /* Unione generica: le liste con "id" vengono unite elemento per elemento (vince la copia più recente),
     il resto viene dalla copia più recente. */
  function mergeById(newer, older) {
    if (Array.isArray(newer) && Array.isArray(older)) {
      var withId = newer.concat(older).every(function (x) { return x && typeof x === 'object' && x.id != null; });
      if (!withId) return newer;
      var seen = {}, out = [];
      newer.forEach(function (x) { seen[x.id] = 1; out.push(x); });
      older.forEach(function (x) { if (!seen[x.id]) out.push(x); });
      return out;
    }
    if (newer && older && typeof newer === 'object' && typeof older === 'object' && !Array.isArray(newer) && !Array.isArray(older)) {
      var o = {};
      Object.keys(older).forEach(function (k) { o[k] = older[k]; });
      Object.keys(newer).forEach(function (k) { o[k] = k in older ? mergeById(newer[k], older[k]) : newer[k]; });
      return o;
    }
    return newer;
  }

  var apps = {};
  /* opts: { app, name, scope:'personal'|'couple', getLocal(), setLocal(data, info), merge(local, remote, remoteIsNewer),
             hasLocalData(), localUpdatedAt(), afterPush(ctx), onStatus() } */
  function register(opts) {
    var A = {
      o: opts, rev: 0, metaKey: 'suite_sync_meta_' + opts.app, timer: null, busy: null, status: 'idle', error: '', coupleId: null,
      meta: function () { return readJSON(this.metaKey, { remoteAt: null, dirty: false, lastSync: null, linked: false }); },
      setMeta: function (m) { writeJSON(this.metaKey, m); },
    };
    apps[opts.app] = A;
    function setStatus(s, err) { A.status = s; A.error = err || ''; refreshCards(); if (opts.onStatus) try { opts.onStatus(s, err); } catch (e) {} }
    async function rowRef() {
      if (opts.scope === 'couple') {
        if (!A.coupleId) {
          var rows = await api('/rest/v1/couple_members?select=couple_id&user_id=eq.' + encodeURIComponent(session.user.id));
          if (!rows.length) { var e = new Error('Questo account non è collegato a una coppia (vedi la guida, passo 5).'); e.nocouple = true; throw e; }
          A.coupleId = rows[0].couple_id;
        }
        return { table: 'noidue_data', filter: 'couple_id=eq.' + encodeURIComponent(A.coupleId), insert: { couple_id: A.coupleId } };
      }
      return { table: 'app_data', filter: 'app=eq.' + encodeURIComponent(opts.app) + '&user_id=eq.' + encodeURIComponent(session.user.id), insert: { app: opts.app } };
    }
    async function syncOnce() {
      var ref = await rowRef();
      var m = A.meta();
      var rows = await api('/rest/v1/' + ref.table + '?select=data,updated_at&' + ref.filter);
      var row = rows[0] || null;
      if (row && row.updated_at !== m.remoteAt) {
        var first = !m.linked;
        if ((m.dirty || first) && opts.hasLocalData()) {
          var localAt = opts.localUpdatedAt ? opts.localUpdatedAt() : null;
          var remoteNewer = !localAt || String(row.updated_at) > String(localAt);
          var loc = await opts.getLocal();
          await opts.setLocal(opts.merge ? opts.merge(loc, row.data, remoteNewer) : (remoteNewer ? mergeById(row.data, loc) : mergeById(loc, row.data)), { merged: true });
          m.dirty = true; A.setMeta(m);
        } else {
          await opts.setLocal(row.data, { merged: false });
          m.remoteAt = row.updated_at; m.dirty = false; m.linked = true; m.lastSync = now();
          A.setMeta(m);
          return 'pulled';
        }
      }
      if (!row || m.dirty || !m.linked) {
        if (!row && !opts.hasLocalData()) { m.linked = true; m.dirty = false; m.lastSync = now(); A.setMeta(m); return 'empty'; }
        var rev0 = A.rev;
        var body = { data: await opts.getLocal(), updated_at: now() };
        var res;
        if (row) {
          res = await api('/rest/v1/' + ref.table + '?' + ref.filter + '&updated_at=eq.' + encodeURIComponent(row.updated_at), { method: 'PATCH', json: body, headers: { Prefer: 'return=representation' } });
          if (!res.length) return 'conflict';
        } else {
          var ins = {}; for (var k in ref.insert) ins[k] = ref.insert[k]; ins.data = body.data; ins.updated_at = body.updated_at;
          try { res = await api('/rest/v1/' + ref.table, { method: 'POST', json: ins, headers: { Prefer: 'return=representation' } }); }
          catch (e) { if (e.status === 409) return 'conflict'; throw e; }
        }
        m.remoteAt = res[0].updated_at; m.dirty = A.rev !== rev0; m.linked = true; m.lastSync = now();
        A.setMeta(m);
        if (m.dirty) A.again = true;
        if (opts.afterPush) try { await opts.afterPush(A); } catch (e) { console.warn('foto', e); }
        return 'pushed';
      }
      m.lastSync = now(); A.setMeta(m);
      if (opts.afterPush && !A._photosChecked) { A._photosChecked = true; try { await opts.afterPush(A); } catch (e) {} }
      return 'same';
    }
    A.sync = function (why) {
      if (!session) { setStatus('off'); return Promise.resolve('off'); }
      if (!navigator.onLine) { setStatus('offline'); return Promise.resolve('offline'); }
      if (A.busy) { A.again = true; return A.busy; }
      setStatus('syncing');
      A.busy = (async function () {
        try {
          var r;
          for (var i = 0; i < 4; i++) { r = await syncOnce(); if (r !== 'conflict') break; }
          setStatus('ok');
          return r;
        } catch (e) {
          console.warn('sync', e);
          setStatus(e.auth ? 'off' : 'error', e.message);
          return 'error';
        } finally {
          A.busy = null;
          if (A.again) { A.again = false; setTimeout(function () { A.sync('again'); }, 300); }
        }
      })();
      return A.busy;
    };
    A.changed = function () {
      A.rev++;
      var m = A.meta(); if (!m.dirty) { m.dirty = true; A.setMeta(m); }
      clearTimeout(A.timer);
      if (session) A.timer = setTimeout(function () { A.sync('change'); }, 2500);
    };
    A.uploadPhoto = async function (path, blob) {
      await api('/storage/v1/object/foto/' + path, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' } });
    };
    A.downloadPhoto = async function (path) {
      var r = await api('/storage/v1/object/authenticated/foto/' + path, { raw: true });
      return r.blob();
    };
    // avvio e richiami automatici
    setTimeout(function () { A.sync('start'); }, 1200);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') A.sync('visible'); });
    window.addEventListener('online', function () { A.sync('online'); });
    setInterval(function () { if (document.visibilityState === 'visible' && session) A.sync('timer'); }, opts.scope === 'couple' ? 45000 : 120000);
    return A;
  }

  function statusText(A) {
    if (!session) return 'Non collegato: i dati restano solo su questo telefono.';
    var m = A.meta();
    var last = m.lastSync ? new Date(m.lastSync).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'mai';
    if (A.status === 'syncing') return 'Sincronizzo…';
    if (A.status === 'offline') return 'Offline: sincronizzo appena torna la rete. Ultima: ' + last + '.';
    if (A.status === 'error') return 'Non riuscita: ' + A.error;
    return 'Collegato come ' + session.user.email + '. Ultima sincronizzazione: ' + last + (m.dirty ? ' (modifiche da inviare)' : '') + '.';
  }
  function cardHtml(appKey, o) {
    o = o || {};
    var A = apps[appKey]; if (!A) return '';
    var H = o.h || 'h2', cls = o.cls || 'card';
    var inner;
    if (!session) {
      inner = '<form class="suite-sync-form" data-suite-sync-login="' + appKey + '" autocomplete="on">' +
        '<input type="email" name="email" placeholder="Email" autocomplete="username" required inputmode="email">' +
        '<input type="password" name="password" placeholder="Password" autocomplete="current-password" required>' +
        '<button type="submit" class="suite-sync-primary primary">Accedi e sincronizza</button></form>';
    } else {
      inner = '<div class="suite-sync-actions"><button type="button" class="suite-sync-primary primary" data-suite-sync-now="' + appKey + '">↻ Sincronizza ora</button><button type="button" data-suite-sync-out="' + appKey + '">Esci</button></div>';
    }
    var dot = !session ? 'off' : A.status === 'error' ? 'err' : A.status === 'syncing' ? 'busy' : 'on';
    return '<div class="' + cls + ' suite-sync-card" data-suite-sync-card="' + appKey + '" data-h="' + H + '" data-cls="' + esc(cls) + '"><' + H + '>Sincronizzazione</' + H + '>' +
      '<p class="suite-sync-status"><span class="suite-sync-dot ' + dot + '" aria-hidden="true"></span>' + esc(statusText(A)) + '</p>' + inner + '</div>';
  }
  function refreshCards() {
    var cards = document.querySelectorAll('[data-suite-sync-card]');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], key = c.getAttribute('data-suite-sync-card');
      var focusInside = c.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
      if (focusInside) continue;
      var tmp = document.createElement('div'); tmp.innerHTML = cardHtml(key, { h: c.getAttribute('data-h'), cls: c.getAttribute('data-cls') });
      c.replaceWith(tmp.firstChild);
    }
  }
  document.addEventListener('submit', async function (e) {
    var f = e.target.closest && e.target.closest('[data-suite-sync-login]'); if (!f) return;
    e.preventDefault();
    var key = f.getAttribute('data-suite-sync-login'), btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = 'Accesso…';
    try {
      await authCall('password', { email: f.email.value.trim(), password: f.password.value });
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      var A = apps[key]; refreshCards(); A.sync('login');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Accedi e sincronizza';
      var p = f.parentNode.querySelector('.suite-sync-status');
      if (p) p.textContent = err.code === 'invalid_credentials' || err.status === 400 ? 'Email o password non corrette.' : 'Accesso non riuscito: ' + err.message;
    }
  });
  document.addEventListener('click', function (e) {
    var n = e.target.closest && e.target.closest('[data-suite-sync-now]');
    if (n) { apps[n.getAttribute('data-suite-sync-now')].sync('button'); return; }
    var o = e.target.closest && e.target.closest('[data-suite-sync-out]');
    if (o) {
      var key = o.getAttribute('data-suite-sync-out');
      session = null; try { localStorage.removeItem(SKEY); } catch (x) {}
      var A = apps[key]; var m = A.meta(); m.linked = false; m.remoteAt = null; A.setMeta(m); A.coupleId = null;
      refreshCards();
    }
  });
  window.SuiteSync = {
    register: register,
    cardHtml: cardHtml,
    refreshCards: refreshCards,
    mergeById: mergeById,
    get signedIn() { return !!session; },
    get userId() { return session && session.user.id; },
    app: function (k) { return apps[k]; },
  };
})();
