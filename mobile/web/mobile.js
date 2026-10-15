// Android app glue. Loaded only in the Capacitor build, after config.js and i18n.js and before app.js.
// Photos are picked natively so the original file (with GPS) reaches the app, then handed to the same
// file input the web version uses. Nothing is uploaded anywhere.
(function () {
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
  document.documentElement.classList.add('native-app');

  // Phone wording: no drag and drop, photos come from the gallery or the share menu
  const HINT = {
    ru: 'Нажмите «Открыть фото» или поделитесь снимком из галереи.',
    en: 'Tap “Open photos” or share a picture from your gallery.',
    de: 'Tippen Sie auf „Fotos öffnen“ oder teilen Sie ein Bild aus der Galerie.',
    es: 'Toca «Abrir fotos» o comparte una imagen desde la galería.',
    fr: 'Touchez « Ouvrir des photos » ou partagez une image depuis la galerie.',
    pt: 'Toque em “Abrir fotos” ou compartilhe uma imagem da galeria.',
    tr: '“Fotoğraf aç”a dokunun ya da galeriden bir fotoğraf paylaşın.',
    zh: '点按“打开照片”，或从相册分享图片。',
    ja: '「写真を開く」をタップするか、ギャラリーから写真を共有してください。',
    ko: '“사진 열기”를 누르거나 갤러리에서 사진을 공유하세요.',
    hi: '“फ़ोटो खोलें” पर टैप करें या गैलरी से फ़ोटो शेयर करें।',
    id: 'Ketuk “Buka foto” atau bagikan gambar dari galeri.',
    vi: 'Chạm “Mở ảnh” hoặc chia sẻ ảnh từ thư viện.',
    th: 'แตะ “เปิดรูปภาพ” หรือแชร์รูปจากแกลเลอรี',
    ar: 'اضغط «فتح الصور» أو شارك صورة من المعرض.'
  };
  for (const [l, d] of Object.entries(window.I18N || {})) {
    const hint = HINT[l] || HINT.en;
    Object.assign(d, { drop_text: hint, intro_1s: hint, intro_1: d.open || d.intro_1 });
  }

  // The app checks GitHub releases for the APK itself (below); the web check looks for the zip
  const repo = window.GITHUB_REPO;
  window.GITHUB_REPO = '';

  const Picker = Cap.registerPlugin('PhotoPicker');
  const $ = (id) => document.getElementById(id);

  async function deliver(files) {
    if (!files || !files.length) return;
    const dt = new DataTransfer();
    for (const f of files) {
      try {
        const blob = await (await fetch(Cap.convertFileSrc(f.path))).blob();
        dt.items.add(new File([blob], f.name, { type: f.type || blob.type, lastModified: f.lastModified || Date.now() }));
      } catch (e) { console.error('PhotoPicker: cannot read', f.name, e); }
    }
    if (!dt.files.length) return;
    const input = $('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }

  let picking = false;
  async function pick() {
    if (picking) return;
    picking = true;
    try { const r = await Picker.pick(); await deliver(r.files); } catch (e) { console.error('PhotoPicker', e); }
    finally { picking = false; }
  }

  // Runs before app.js's own handler, which would open the WebView file chooser
  window.addEventListener('click', (e) => {
    if (e.target.closest('#btnOpen, #dropHint')) { e.preventDefault(); e.stopImmediatePropagation(); pick(); }
  }, true);

  // Phone layout: address, coordinates, time and camera go in a card right under the photo, above the map.
  // The blocks are moved, not copied, so app.js keeps filling them by id.
  const info = $('info'), quick = document.createElement('div');
  quick.className = 'quick';
  quick.append($('addr').parentElement, $('coords').parentElement);
  $('tabs').before(quick);
  const syncQuick = () => { quick.hidden = info.classList.contains('empty'); };
  new MutationObserver(syncQuick).observe(info, { attributes: true, attributeFilter: ['class'] });
  syncQuick();

  // Swipe the photo to go to the next or previous one
  const stage = $('stage');
  let x0 = null, y0 = 0;
  stage.addEventListener('touchstart', (e) => { if (e.touches.length === 1 && !stage.classList.contains('zoomed')) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else x0 = null; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const rtl = document.documentElement.dir === 'rtl';
    const btn = $((dx < 0) !== rtl ? 'next' : 'prev');
    if (!btn.hidden) btn.click();
  }, { passive: true });

  // "Share" or "Open with" from the gallery
  Picker.addListener('photosShared', (d) => deliver(d.files));

  // Status bar icons follow the app theme
  const bars = Cap.Plugins && Cap.Plugins.SystemBars;
  const syncBars = () => { try { bars && bars.setStyle({ style: document.documentElement.dataset.theme === 'light' ? 'LIGHT' : 'DARK' }); } catch (e) {} };
  new MutationObserver(syncBars).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('DOMContentLoaded', syncBars);

  // Updates: once a day ask GitHub for the latest release and offer its APK
  const newer = (a, b) => { const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  async function checkUpdate() {
    if (!repo) return;
    try {
      const last = +localStorage.getItem('pgf.updCheck') || 0;
      if (Date.now() - last < 864e5) return;
      localStorage.setItem('pgf.updCheck', String(Date.now()));
      const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return;
      const rel = await r.json();
      const apk = (rel.assets || []).find(a => /\.apk$/i.test(a.name));
      if (!apk || !newer(rel.tag_name, window.APP_VERSION)) return;
      const s = window.I18N[document.documentElement.lang] || window.I18N.en;
      $('toastText').textContent = s.upd_avail.replace('{v}', String(rel.tag_name).replace(/^v/, ''));
      $('toastNotes').href = rel.html_url; $('toastNotes').textContent = s.upd_notes; $('toastNotes').hidden = false;
      $('toastGo').href = apk.browser_download_url; $('toastGo').textContent = s.upd_download; $('toastGo').hidden = false;
      $('toast').hidden = false;
    } catch (e) {}
  }
  setTimeout(checkUpdate, 4000);
})();
