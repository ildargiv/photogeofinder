// Copies the web app into www/ for the Android build and adds the app glue (mobile.js, mobile.css, Capacitor runtime).
// The web app files at the repo root stay the single source; nothing here edits them.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const www = join(here, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www);
// sw.js and the web manifest are left out: the app ships its files inside the APK and updates through releases
for (const f of ['index.html', 'app.js', 'config.js', 'i18n.js', 'icons', 'vendor']) cpSync(join(root, f), join(www, f), { recursive: true });
cpSync(join(here, 'web/mobile.js'), join(www, 'mobile.js'));
cpSync(join(here, 'web/mobile.css'), join(www, 'mobile.css'));
cpSync(join(here, 'node_modules/@capacitor/core/dist/capacitor.js'), join(www, 'vendor/capacitor.js'));

let html = readFileSync(join(www, 'index.html'), 'utf8');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html: cannot find ${from}`);
  html = html.replace(from, to);
};
swap('<link rel="manifest" href="manifest.webmanifest">\n', '');
swap('</head>', '<link rel="stylesheet" href="mobile.css">\n</head>');
swap('<script src="i18n.js"></script>', '<script src="i18n.js"></script>\n<script src="vendor/capacitor.js"></script>\n<script src="mobile.js"></script>');
writeFileSync(join(www, 'index.html'), html);

// Version shown in the app and used for update checks, also passed to Gradle
const version = /APP_VERSION = '([^']+)'/.exec(readFileSync(join(root, 'config.js'), 'utf8'))[1];
console.log(`www/ ready for PhotoGeoFinder ${version}`);
