(() => {
  const $ = (id) => document.getElementById(id);
  // ---------- Язык ----------
  const cfgOf = (l) => LANG_CFG[l] || LANG_CFG.en;
  let lang = 'ru';
  try { lang = localStorage.getItem('geofoto.lang') || ''; } catch (e) {}
  if (!I18N[lang]) { const nl = (navigator.language || 'ru').slice(0, 2).toLowerCase(); lang = I18N[nl] ? nl : 'en'; }
  const t = (k, v) => { let x = (I18N[lang][k] ?? I18N.ru[k] ?? k); if (v) for (const n in v) x = String(x).split('{' + n + '}').join(v[n]); return x; };
  const loc = () => cfgOf(lang).locale;
  let appName = 'PhotoGeoFinder';
  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    const nm = (window.APP_NAMES && APP_NAMES[lang]) || ['PhotoGeo', 'Finder'];
    appName = nm.join('');
    document.querySelectorAll('.wm1').forEach(e => e.textContent = nm[0]);
    document.querySelectorAll('.wm2').forEach(e => e.textContent = nm[1]);
    document.title = appName;
    document.querySelectorAll('[data-app]').forEach(e => e.textContent = appName);
    document.querySelectorAll('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n, { app: appName }));
    document.querySelectorAll('[data-i18n-html]').forEach(e => e.innerHTML = t(e.dataset.i18nHtml));
    document.querySelectorAll('[data-i18n-ph]').forEach(e => e.placeholder = t(e.dataset.i18nPh));
    document.querySelectorAll('[data-i18n-aria]').forEach(e => e.setAttribute('aria-label', t(e.dataset.i18nAria)));
    document.querySelectorAll('[data-i18n-title]').forEach(e => e.title = t(e.dataset.i18nTitle));
    document.querySelectorAll('#radius button').forEach(b => b.textContent = (+b.dataset.r >= 1000 ? (+b.dataset.r / 1000) + ' ' + t('km') : b.dataset.r + ' ' + t('m')));
    $('pmClose').textContent = t('start');
    $('w_title_fix')?.remove();
    document.querySelector('[data-i18n="w_title"]').textContent = t('w_title', { app: appName });
  }
  const sel = $('lang');
  Object.entries(LANGS).forEach(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v; sel.appendChild(o); });
  sel.value = lang;
  sel.onchange = () => { lang = sel.value; try { localStorage.setItem('geofoto.lang', lang); } catch (e) {} applyLang(); renderMap(); if (state.index >= 0) showInfo(); };
  const state = { items: [], index: -1, map: 'google', radius: 1000, place: null, reqId: 0, dir: 1, route: false };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  state.map = store.get('geofoto.map') || 'google';

  // ---------- Тема: фирменная по умолчанию ----------
  const root = document.documentElement;
  const THEME_BG = { brand: '#0b1418', light: '#eef2f4', dark: '#111214' };
  function setTheme(th) {
    if (!THEME_BG[th]) th = 'brand';
    if (th === 'brand') delete root.dataset.theme; else root.dataset.theme = th;
    $('themeSel').value = th;
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = THEME_BG[th];
    if (routeLine) drawRoute();
  }
  $('themeSel').onchange = () => { setTheme($('themeSel').value); store.set('geofoto.theme2', $('themeSel').value); };

  // ---------- Заставка ----------
  const splash = $('splash');
  let seenSplash = false; try { seenSplash = sessionStorage.getItem('pgf.splash') === '1'; sessionStorage.setItem('pgf.splash', '1'); } catch (e) {}
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const splashMs = (seenSplash || reduce) ? 0 : 2100;
  setTimeout(() => { splash.classList.add('out'); setTimeout(() => splash.remove(), 650); }, splashMs);

  // ---------- Установка и офлайн ----------
  // ---------- Обновления ----------
  const toast = $('toast');
  $('toastClose').onclick = () => { toast.hidden = true; };
  function showToast(text, opts) {
    $('toastText').textContent = text;
    $('toastNotes').hidden = !opts.notes; if (opts.notes) { $('toastNotes').href = opts.notes; $('toastNotes').textContent = t('upd_notes'); }
    $('toastGo').hidden = !opts.go; if (opts.go) { $('toastGo').href = opts.go; $('toastGo').textContent = t('upd_download'); }
    $('toastRestart').hidden = !opts.restart; if (opts.restart) { $('toastRestart').textContent = t('upd_restart'); $('toastRestart').onclick = opts.restart; }
    toast.hidden = false;
  }
  // 1) Установленная программа с сайта (GitHub Pages): новая версия скачивается сама, остаётся перезапустить
  // Desktop app: open web links in the system browser instead of the app window
  if (window.__TAURI__?.opener) document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="http"]'); if (!a) return;
    e.preventDefault(); window.__TAURI__.opener.openUrl(a.href);
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.__TAURI__) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      const offer = (w) => showToast(t('upd_ready'), { restart: () => w.postMessage('skipWaiting') });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
      setInterval(() => reg.update().catch(() => {}), 6 * 3600 * 1000);
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
  // 2) Копия с компьютера: раз в день спрашиваем GitHub о последнем выпуске
  const newer = (a, b) => { const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  async function checkGithub() {
    if (!window.GITHUB_REPO || /^https:$/.test(location.protocol) && location.host.endsWith('github.io')) return;
    const last = +store.get('pgf.updCheck') || 0;
    if (Date.now() - last < 864e5) return;
    store.set('pgf.updCheck', String(Date.now()));
    try {
      const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return;
      const rel = await r.json();
      if (!newer(rel.tag_name, APP_VERSION)) return;
      const asset = (rel.assets || []).find(a => /\.zip$/i.test(a.name));
      showToast(t('upd_avail', { v: String(rel.tag_name).replace(/^v/, '') }), { notes: rel.html_url, go: asset ? asset.browser_download_url : rel.zipball_url });
    } catch (e) {}
  }
  setTimeout(checkGithub, 4000);
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('btnInstall').classList.add('show'); });
  const pm = $('privacyModal');
  const closePm = () => { pm.hidden = true; $('pmClose').textContent = t('start'); };
  $('pmClose').onclick = closePm;
  pm.onclick = (e) => { if (e.target === pm) closePm(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePm(); });
  // Перед установкой сначала говорим о приватности
  $('btnInstall').onclick = () => { $('pmInstall').hidden = !installEvt; $('pmClose').textContent = t('later'); pm.hidden = false; $('pmInstall').focus(); };
  $('pmInstall').onclick = async () => { closePm(); if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('btnInstall').classList.remove('show'); };
  if (!store.get('geofoto.privacySeen')) { setTimeout(() => { pm.hidden = false; $('pmClose').focus(); store.set('geofoto.privacySeen', '1'); }, splashMs + 500); }
  window.addEventListener('appinstalled', () => $('btnInstall').classList.remove('show'));

  // ---------- Открытие файлов ----------
  $('btnOpen').onclick = () => $('fileInput').click();
  $('btnFolder').onclick = () => $('folderInput').click();
  $('fileInput').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
  $('folderInput').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
  const stage = $('stage');
  ['dragenter', 'dragover'].forEach(t => document.addEventListener(t, (e) => { e.preventDefault(); stage.classList.add('dragging'); }));
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) stage.classList.remove('dragging'); });
  document.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('dragging'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
  const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|tiff?|gif|avif)$/i.test(f.name);

  async function addFiles(fileList) {
    const files = [...fileList].filter(isImage).sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
    if (!files.length) return;
    const start = state.items.length;
    files.forEach(file => state.items.push({ file, url: URL.createObjectURL(file), exif: null, gps: null, manual: null }));
    renderStrip();
    show(start, 1);
    for (let i = start; i < state.items.length; i++) {
      await readExif(state.items[i]);
      markThumb(i); syncMarker(i);
      if (i === state.index) showInfo();
    }
  }

  async function readExif(item) {
    if (item.exif !== null) return;
    item.exif = {};
    if (!window.exifr) return;
    try {
      const data = await exifr.parse(item.file, { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false });
      item.exif = data || {};
      if (data && Number.isFinite(data.latitude) && Number.isFinite(data.longitude) && !(data.latitude === 0 && data.longitude === 0)) {
        item.gps = { lat: data.latitude, lon: data.longitude, alt: data.GPSAltitude };
      }
    } catch (e) { item.exif = {}; }
  }
  const posOf = (it) => it.gps || it.manual;
  const dateOf = (it) => { const d = it.exif?.DateTimeOriginal || it.exif?.CreateDate; const t = d ? new Date(d).getTime() : NaN; return isNaN(t) ? null : t; };

  // ---------- Просмотр ----------
  function renderStrip() {
    const strip = $('strip'); strip.innerHTML = '';
    state.items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'thumb'; b.title = it.file.name; b.id = 'thumb' + i; b.style.animationDelay = Math.min(i, 20) * 25 + 'ms';
      b.innerHTML = '<img alt="" loading="lazy"><span class="dot no"></span>';
      b.querySelector('img').src = it.url;
      b.onclick = () => show(i);
      strip.appendChild(b); markThumb(i);
    });
    strip.hidden = state.items.length < 2;
    $('exportBlock').hidden = !state.items.length;
  }
  function markThumb(i) {
    const dot = document.querySelector('#thumb' + i + ' .dot');
    if (dot) dot.className = 'dot' + (state.items[i].gps ? '' : ' no');
  }

  async function show(i, dir) {
    if (i < 0 || i >= state.items.length) return;
    state.dir = dir || (i >= state.index ? 1 : -1);
    state.index = i;
    const it = state.items[i];
    $('dropHint').hidden = true;
    stage.classList.remove('zoomed');
    const img = $('photo');
    img.hidden = false; img.alt = it.file.name;
    img.classList.remove('enter-next', 'enter-prev'); void img.offsetWidth;
    img.src = it.url;
    img.classList.add(state.dir > 0 ? 'enter-next' : 'enter-prev');
    $('prev').hidden = $('next').hidden = state.items.length < 2;
    document.querySelectorAll('.thumb').forEach((t, k) => t.classList.toggle('active', k === i));
    document.getElementById('thumb' + i)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    await readExif(it);
    markThumb(i); syncMarker(i);
    if (state.index === i) showInfo();
  }
  $('prev').onclick = () => show((state.index - 1 + state.items.length) % state.items.length, -1);
  $('next').onclick = () => show((state.index + 1) % state.items.length, 1);
  $('photo').onclick = () => stage.classList.toggle('zoomed');
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') $('prev').click();
    if (e.key === 'ArrowRight') $('next').click();
    if (e.key === 'Escape') stage.classList.remove('zoomed');
  });

  let slide = null;
  function toggleSlideshow() {
    if (slide) { clearInterval(slide); slide = null; } else if (state.items.length > 1) slide = setInterval(() => $('next').click(), 4000);
    const b = document.getElementById('btnSlide'); if (b) { b.setAttribute('aria-pressed', String(!!slide)); b.textContent = slide ? t('stop') : t('slideshow'); }
  }

  const fmtDate = (d) => { if (!d) return null; const dt = d instanceof Date ? d : new Date(d); return isNaN(dt) ? String(d) : dt.toLocaleString(loc(), { dateStyle: 'long', timeStyle: 'short' }); };

  function showInfo() {
    const it = state.items[state.index]; if (!it) return;
    $('info').classList.remove('empty');
    const x = it.exif || {};
    const date = fmtDate(x.DateTimeOriginal || x.CreateDate);
    const cam = [x.Make, x.Model].filter(Boolean).join(' ');
    const cap = $('caption'); cap.hidden = false; cap.innerHTML = '';
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = it.file.name; cap.appendChild(nm);
    const pos = document.createElement('span'); pos.textContent = t('n_of', { i: state.index + 1, n: state.items.length }); cap.appendChild(pos);
    if (date) { const s = document.createElement('span'); s.textContent = date; cap.appendChild(s); }
    const tools = document.createElement('span'); tools.className = 'tools';
    tools.innerHTML = `<button id="btnSlide" aria-pressed="${!!slide}">${slide ? t('stop') : t('slideshow')}</button>`;
    cap.appendChild(tools); $('btnSlide').onclick = toggleSlideshow;

    const badge = $('badge'); badge.innerHTML = '';
    const dt0 = x.DateTimeOriginal || x.CreateDate; const dd0 = dt0 ? new Date(dt0) : null;
    if (dd0 && !isNaN(dd0)) {
      const t = document.createElement('div'); t.className = 't';
      t.textContent = dd0.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
      const sm = document.createElement('small'); sm.textContent = dd0.toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' }); t.appendChild(sm); badge.appendChild(t);
    }
    if (cam || x.LensModel) { const c = document.createElement('div'); c.className = 'c'; c.textContent = [cam, x.LensModel].filter(Boolean).join(' · '); badge.appendChild(c); }
    const ex = [x.FNumber && 'f/' + x.FNumber, x.ExposureTime && (x.ExposureTime < 1 ? '1/' + Math.round(1 / x.ExposureTime) : x.ExposureTime) + ' ' + t('sec'), x.ISO && 'ISO ' + x.ISO, Number.isFinite(+x.FocalLength) && x.FocalLength > 0 && Math.round(x.FocalLength) + ' ' + t('mm')].filter(Boolean).join(' · ');
    if (ex) { const e = document.createElement('div'); e.className = 'e'; e.textContent = ex; badge.appendChild(e); }
    badge.hidden = !badge.childNodes.length;

    const rows = [[t('f_file'), it.file.name], [t('f_size'), (it.file.size / 1048576).toFixed(1) + ' ' + t('mb')]];
    if (date) rows.push([t('f_taken'), date]);
    if (cam) rows.push([t('f_camera'), cam]);
    if (x.LensModel) rows.push([t('f_lens'), x.LensModel]);
    if (x.FNumber || x.ExposureTime || x.ISO) rows.push([t('f_exposure'), [x.FNumber && 'f/' + x.FNumber, x.ExposureTime && (x.ExposureTime < 1 ? '1/' + Math.round(1 / x.ExposureTime) : x.ExposureTime) + ' ' + t('sec'), x.ISO && 'ISO ' + x.ISO].filter(Boolean).join(' · ')]);
    if (it.gps && Number.isFinite(it.gps.alt)) rows.push([t('f_alt'), Math.round(it.gps.alt) + ' ' + t('m')]);
    const meta = $('meta'); meta.innerHTML = '';
    rows.forEach(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; meta.append(dt, dd); });

    if (it.gps) setPlace({ lat: it.gps.lat, lon: it.gps.lon, source: 'exif' });
    else if (it.manual) setPlace(it.manual);
    else setPlace(null, t('no_gps'));
  }

  // ---------- Место ----------
  function setPlace(place, emptyText) {
    state.place = place;
    const req = ++state.reqId;
    renderMap();
    highlightMarker();
    if (!place) {
      $('addr').textContent = emptyText || '—'; $('coords').textContent = '—';
      $('linksBlock').hidden = true; $('gallery').innerHTML = ''; return;
    }
    const { lat, lon } = place;
    const c = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    $('coords').innerHTML = '';
    const code = document.createElement('span'); code.textContent = c; $('coords').appendChild(code);
    const copy = document.createElement('button'); copy.className = 'chip'; copy.textContent = t('copy');
    copy.onclick = () => navigator.clipboard?.writeText(c).then(() => { copy.textContent = t('copied'); setTimeout(() => copy.textContent = t('copy'), 1500); }).catch(() => {});
    $('coords').appendChild(copy);
    if (place.source !== 'exif') { const n = document.createElement('span'); n.className = 'note'; n.textContent = t('by_search'); $('coords').appendChild(n); }
    renderLinks(lat, lon);
    if (place.label) $('addr').textContent = place.label;
    else { $('addr').textContent = t('resolving'); reverseGeocode(lat, lon, req); }
    loadNearbyPhotos(lat, lon, req);
    loadWiki(lat, lon, req);
  }

  function mapUrl(kind, lat, lon) {
    switch (kind) {
      case 'google': return `https://maps.google.com/maps?q=${lat},${lon}&z=16&hl=${lang}&output=embed`;
      case 'sat': return `https://maps.google.com/maps?q=${lat},${lon}&z=18&t=k&hl=${lang}&output=embed`;
      case 'yandex': return `https://yandex.ru/map-widget/v1/?ll=${lon},${lat}&z=16&pt=${lon},${lat},pm2rdm&lang=${cfgOf(lang).yandex}`;
      case 'osm': { const d = 0.006; return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d / 2},${lon + d},${lat + d / 2}&layer=mapnik&marker=${lat},${lon}`; }
    }
  }

  function renderMap() {
    const tabs = [...document.querySelectorAll('.tab')];
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.map === state.map)));
    moveIndicator();
    const box = $('mapbox');
    box.querySelector('iframe')?.remove();
    const all = state.map === 'all';
    $('overview').hidden = !all; $('mapTools').hidden = !all;
    if (all) { $('mapEmpty').hidden = true; ensureOverview(); return; }
    $('mapEmpty').hidden = !!state.place;
    if (!state.place) return;
    const f = document.createElement('iframe');
    f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade'; f.allowFullscreen = true; f.title = t('map_title');
    f.src = mapUrl(state.map, state.place.lat, state.place.lon);
    box.appendChild(f);
  }
  function moveIndicator() {
    const t = document.querySelector('.tab[aria-selected="true"]'), ind = $('tabInd');
    if (!t) return; ind.style.left = t.offsetLeft + 'px'; ind.style.width = t.offsetWidth + 'px';
  }
  window.addEventListener('resize', moveIndicator);
  if (document.fonts?.ready) document.fonts.ready.then(moveIndicator);
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { state.map = t.dataset.map; store.set('geofoto.map', state.map); renderMap(); });

  // ---------- Обзорная карта со всеми фото ----------
  let lmap = null, markers = new Map(), routeLine = null;
  function ensureOverview() {
    if (!window.L) { $('overview').innerHTML = '<div class="empty">' + t('map_fail') + '</div>'; return; }
    if (!lmap) {
      lmap = L.map('overview', { zoomControl: true, worldCopyJump: true }).setView([55.75, 37.62], 4);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(lmap);
    }
    setTimeout(() => { lmap.invalidateSize(); state.items.forEach((_, i) => syncMarker(i, true)); drawRoute(); fitAll(); highlightMarker(true); }, 60);
  }
  function syncMarker(i, force) {
    if (!lmap || (state.map !== 'all' && !force)) return;
    const it = state.items[i], p = it && posOf(it); if (!p) return;
    let m = markers.get(i);
    if (!m) {
      const icon = L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="pin" id="pin${i}" style="animation-delay:${Math.min(i, 30) * 40}ms"><i><img alt="" src="${it.url}"></i></div>` });
      m = L.marker([p.lat, p.lon], { icon, title: it.file.name }).addTo(lmap);
      m.on('click', () => show(i));
      markers.set(i, m);
    } else m.setLatLng([p.lat, p.lon]);
    drawRoute();
  }
  function highlightMarker(fly) {
    document.querySelectorAll('.pin').forEach(p => p.classList.remove('sel'));
    document.getElementById('pin' + state.index)?.classList.add('sel');
    const m = markers.get(state.index);
    if (fly && lmap && m && state.map === 'all' && markers.size === 1) lmap.flyTo(m.getLatLng(), 14, { duration: 1.2 });
    else if (lmap && m && state.map === 'all' && !lmap.getBounds().contains(m.getLatLng())) lmap.flyTo(m.getLatLng(), Math.max(lmap.getZoom(), 12), { duration: 1.2 });
  }
  function fitAll() {
    if (!lmap) return;
    const pts = [...markers.values()].map(m => m.getLatLng());
    if (!pts.length) return;
    if (pts.length === 1) lmap.flyTo(pts[0], 14, { duration: 1.2 });
    else lmap.flyToBounds(L.latLngBounds(pts).pad(0.25), { duration: 1.2, maxZoom: 16 });
  }
  function drawRoute() {
    if (!lmap) return;
    if (routeLine) { routeLine.remove(); routeLine = null; }
    if (!state.route) return;
    const pts = state.items.map((it, i) => ({ t: dateOf(it), p: posOf(it), i })).filter(o => o.p)
      .sort((a, b) => (a.t ?? a.i) - (b.t ?? b.i)).map(o => [o.p.lat, o.p.lon]);
    if (pts.length > 1) routeLine = L.polyline(pts, { color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ffb040', weight: 3, opacity: .9, dashArray: '2 8', lineCap: 'round' }).addTo(lmap);
  }
  $('btnRoute').onclick = () => { state.route = !state.route; $('btnRoute').setAttribute('aria-pressed', String(state.route)); drawRoute(); };
  $('btnFit').onclick = fitAll;

  // ---------- Ссылки, адрес ----------
  function renderLinks(lat, lon) {
    const L2 = [
      [t('link_gmaps'), `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`],
      [t('link_gstreet'), `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`],
      [t('link_ymaps'), `https://yandex.ru/maps/?ll=${lon},${lat}&z=17&pt=${lon},${lat},pm2rdm`],
      [t('link_ypano'), `https://yandex.ru/maps/?ll=${lon},${lat}&z=17&l=stv,sta&panorama%5Bpoint%5D=${lon},${lat}`],
      [t('link_2gis'), `https://2gis.ru/geo/${lon},${lat}`],
      [t('link_flickr'), `https://www.flickr.com/map?fLat=${lat}&fLon=${lon}&zl=16`],
      ['Mapillary', `https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=17`],
      [t('link_commons'), `https://commons.wikimedia.org/wiki/Special:Nearby#/coord/${lat},${lon}`],
    ];
    const box = $('links'); box.innerHTML = '';
    L2.forEach(([t, h]) => { const a = document.createElement('a'); a.className = 'chip'; a.href = h; a.target = '_blank'; a.rel = 'noopener'; a.textContent = t; box.appendChild(a); });
    $('linksBlock').hidden = false;
  }

  const geoCache = new Map();
  async function reverseGeocode(lat, lon, req) {
    const key = lang + ':' + lat.toFixed(5) + ',' + lon.toFixed(5);
    try {
      let label = geoCache.get(key) ?? store.get('geo:' + key);
      if (label == null) {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=${lang}`);
        if (!r.ok) throw new Error(r.status);
        label = prettyAddress(await r.json());
        store.set('geo:' + key, label);
      }
      label = label || t('addr_none');
      geoCache.set(key, label);
      const it = state.items[state.index]; if (it) it.address = label;
      if (req === state.reqId) $('addr').textContent = label;
    } catch (e) {
      if (req === state.reqId) $('addr').innerHTML = '<span class="warn">' + t('addr_fail') + '</span>';
    }
  }
  function prettyAddress(j) {
    const a = j.address || {};
    const street = [a.road || a.pedestrian || a.footway || a.square, a.house_number].filter(Boolean).join(', ');
    const city = a.city || a.town || a.village || a.hamlet || a.municipality;
    const parts = [j.name && j.name !== a.road ? j.name : null, street, a.suburb || a.city_district, city, a.state, a.country].filter(Boolean);
    const uniq = parts.filter((p, i) => parts.indexOf(p) === i);
    return uniq.length ? uniq.join(', ') : j.display_name;
  }

  // ---------- Фото местности от других людей (Викисклад, без ключа) ----------
  async function loadNearbyPhotos(lat, lon, req) {
    const g = $('gallery');
    g.innerHTML = '<div class="skel"></div>'.repeat(4);
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${lat}%7C${lon}&ggsradius=${Math.min(state.radius, 10000)}&ggslimit=40&ggsnamespace=6&prop=imageinfo%7Ccoordinates&iiprop=url&iiurlwidth=330`;
    try {
      const j = await (await fetch(url)).json();
      if (req !== state.reqId) return;
      const pages = Object.values(j.query?.pages || {}).filter(p => p.imageinfo?.[0]?.thumburl && !/\.(svg|pdf|tif|ogg|webm)$/i.test(p.title));
      pages.forEach(p => { const c = p.coordinates?.[0]; p.dist = c ? haversine(lat, lon, c.lat, c.lon) : 1e9; });
      pages.sort((a, b) => a.dist - b.dist);
      g.innerHTML = '';
      if (!pages.length) { g.innerHTML = '<div class="note">' + t('gal_none') + '</div>'; return; }
      pages.slice(0, 24).forEach((p, k) => {
        const a = document.createElement('a');
        a.href = p.imageinfo[0].descriptionurl; a.target = '_blank'; a.rel = 'noopener'; a.title = p.title.replace(/^File:/, ''); a.style.animationDelay = k * 30 + 'ms';
        const im = document.createElement('img'); im.loading = 'lazy'; im.alt = a.title; im.src = p.imageinfo[0].thumburl; a.append(im);
        if (p.dist < 1e9) { const s = document.createElement('span'); s.textContent = fmtDist(p.dist); a.append(s); }
        g.appendChild(a);
      });
    } catch (e) {
      if (req === state.reqId) g.innerHTML = '<div class="note warn">' + t('gal_fail') + '</div>';
    }
  }
  async function loadWiki(lat, lon, req) {
    const box = $('wiki'), blk = $('wikiBlock');
    try {
      const u = `https://${cfgOf(lang).wiki}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${lat}%7C${lon}&ggsradius=${Math.min(Math.max(state.radius, 1000), 10000)}&ggslimit=8&prop=extracts%7Cpageimages%7Ccoordinates&exintro=1&explaintext=1&exchars=170&exlimit=8&piprop=thumbnail&pithumbsize=250&colimit=8`;
      const j = await (await fetch(u)).json();
      if (req !== state.reqId) return;
      const pages = Object.values(j.query?.pages || {});
      pages.forEach(p => { const c = p.coordinates?.[0]; p.dist = c ? haversine(lat, lon, c.lat, c.lon) : 1e9; });
      pages.sort((a, b) => a.dist - b.dist);
      box.innerHTML = '';
      blk.hidden = !pages.length;
      pages.forEach((p, k) => {
        const a = document.createElement('a'); a.target = '_blank'; a.rel = 'noopener'; a.style.animationDelay = k * 50 + 'ms';
        a.href = 'https://' + cfgOf(lang).wiki + '.wikipedia.org/?curid=' + p.pageid;
        const ph = document.createElement('div'); ph.className = 'ph'; if (p.thumbnail?.source) ph.style.backgroundImage = `url("${p.thumbnail.source}")`;
        const t = document.createElement('div');
        const b = document.createElement('b'); b.textContent = p.title;
        const d = document.createElement('span'); d.className = 'd'; d.textContent = p.dist < 1e9 ? fmtDist(p.dist) + ' ' + t('from_point') : '';
        const sm = document.createElement('small'); sm.textContent = (p.extract || '').replace(/\s+/g, ' ');
        t.append(b, d, sm); a.append(ph, t); box.appendChild(a);
      });
    } catch (e) { blk.hidden = true; }
  }
  const fmtDist = (m) => m < 1000 ? Math.round(m) + ' ' + t('m') : (m / 1000).toFixed(1) + ' ' + t('km');
  function haversine(a1, o1, a2, o2) {
    const R = 6371000, r = Math.PI / 180, dA = (a2 - a1) * r, dO = (o2 - o1) * r;
    const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  document.querySelectorAll('#radius button').forEach(b => b.onclick = () => {
    state.radius = +b.dataset.r;
    document.querySelectorAll('#radius button').forEach(x => x.classList.toggle('on', x === b));
    if (state.place) loadNearbyPhotos(state.place.lat, state.place.lon, state.reqId);
  });

  // ---------- Поиск места ----------
  $('searchForm').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('searchInput').value.trim(); if (!q) return;
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    let place = null;
    if (m) place = { lat: +m[1], lon: +m[2], source: 'search' };
    else {
      $('addr').textContent = t('searching', { q });
      try {
        const j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=${lang}&q=${encodeURIComponent(q)}`)).json();
        if (j[0]) place = { lat: +j[0].lat, lon: +j[0].lon, source: 'search' };
      } catch (err) {}
      if (!place) { $('addr').innerHTML = '<span class="warn">' + t('not_found') + '</span>'; return; }
    }
    $('info').classList.remove('empty');
    const it = state.items[state.index];
    if (it && !it.gps) { it.manual = place; syncMarker(state.index, true); }
    setPlace(place);
  };

  // ---------- Экспорт списка мест ----------
  $('btnCsv').onclick = () => {
    const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [t('csv_head')];
    state.items.forEach(it => { const p = posOf(it); const t = dateOf(it); rows.push([it.file.name, t ? new Date(t).toISOString() : '', p?.lat ?? '', p?.lon ?? '', it.address || '']); });
    const blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'geofoto-places.csv'; document.body.appendChild(a); a.click(); a.remove();
  };

  setTheme(store.get('geofoto.theme2') || 'brand');
  applyLang();
  renderMap();
})();
