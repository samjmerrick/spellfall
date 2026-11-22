// Turns dist-preview/index.html into dist-preview/spellfall.html: the page body an artifact wraps in its own
// document skeleton (no doctype, charset, viewport, manifest or service worker; artifacts cannot use those).
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const dir = 'dist-preview';
const html = readFileSync(`${dir}/index.html`, 'utf8');
const head = /<head>([\s\S]*)<\/head>/.exec(html)?.[1] ?? '';
const kept = head
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/charset|name="viewport"|rel="manifest"|apple-/.test(l))
  .join('\n');
writeFileSync(`${dir}/spellfall.html`, `${kept}\n<div id="root"></div>\n`);
const unused = ['index.html', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
for (const f of readdirSync(dir))
  if (unused.includes(f) || /^workbox-.*\.js$/.test(f)) rmSync(`${dir}/${f}`, { force: true });
console.log(`Wrote ${dir}/spellfall.html`);
