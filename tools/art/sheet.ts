// Contact sheet of card and run-content art: pnpm art:sheet [faction | id prefix, e.g. hero, enemy, boss, relic, event]  ->  art-sheets/<filter or all>.png
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Item {
  id: string;
  name: string;
  kind: string;
  faction?: string;
  detail: string;
}

const read = <T>(f: string) => JSON.parse(readFileSync(`src/content/${f}.json`, 'utf8')) as T;
const cards =
  read<{ id: string; name: string; faction: string; type: string; cost: number; token?: boolean }[]>('cards');
const heroes = read<{ id: string; name: string; faction: string; title: string }[]>('heroes');
const enemies = read<{ id: string; name: string; kind: string; act: number; deck: string[] }[]>('enemies');
const relics = read<{ id: string; name: string; text: string }[]>('relics');
const events = read<{ id: string; name: string; text: string }[]>('events');
const cardFaction = new Map(cards.map((c) => [c.id, c.faction]));

const items: Item[] = [
  ...cards.map((c) => ({
    id: c.id,
    name: c.name,
    kind: 'card',
    faction: c.faction,
    detail: `${c.type}${c.token ? ' (token)' : ''} · ${c.cost}`,
  })),
  ...heroes.map((h) => ({ id: h.id, name: h.name, kind: 'hero', faction: h.faction, detail: h.title })),
  ...enemies.map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.id.startsWith('boss') ? 'boss' : 'enemy',
    faction: cardFaction.get(e.deck[0]?.replace(/\+$/, '') ?? ''),
    detail: `act ${e.act} ${e.kind}`,
  })),
  ...relics.map((r) => ({ id: r.id, name: r.name, kind: 'relic', detail: r.text })),
  ...events.map((v) => ({ id: v.id, name: v.name, kind: 'event', detail: v.text })),
];

const filter = process.argv[2];
const picked = items.filter((c) => !filter || c.faction === filter || c.id.startsWith(filter));
if (picked.length === 0) {
  console.error(`No cards or run content match "${filter}"`);
  process.exit(1);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cell = (c: Item) => {
  const file = join('src/content/art', `${c.id}.svg`);
  const detail = c.detail.length > 70 ? `${c.detail.slice(0, 67)}...` : c.detail;
  const caption = `<div class="id">${esc(c.id)}</div><div>${esc(c.name)} · ${c.kind}</div><div class="d">${esc(detail)}</div>`;
  if (!existsSync(file)) return `<div class="cell missing"><b>MISSING</b>${caption}</div>`;
  const uri = `data:image/svg+xml;base64,${readFileSync(file).toString('base64')}`;
  const box = (n: number) =>
    `<span class="box" style="width:${n + 8}px;height:${n + 8}px"><img src="${uri}" width="${n}" height="${n}"></span>`;
  // Cards and heroes sit on their faction tint; other run content on a neutral dark tile.
  const tint = (c.kind === 'card' || c.kind === 'hero') && c.faction ? ` faction-${c.faction}` : '';
  return `<div class="cell${tint}"><div class="row">${box(120)}${box(64)}${box(40)}</div>${caption}</div>`;
};

const html = `<html><head><style>
body{margin:0;padding:12px;background:#0f1117;color:#e8e8ee;font:12px system-ui,sans-serif}
.grid{display:grid;grid-template-columns:repeat(6,280px);gap:10px}
.faction-ember{--f:#e5484d}.faction-tide{--f:#3e93f7}.faction-grove{--f:#46a758}.faction-bastion{--f:#e8e2cf}.faction-dusk{--f:#8e4ec6}
.cell{--f:#3a3f50;padding:6px;border-radius:10px;border:2px solid var(--f);background:linear-gradient(160deg,color-mix(in srgb,var(--f) 35%,#1a1d27),#14161e)}
.d{color:#9aa0b4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row{display:flex;gap:8px;align-items:flex-end;margin-bottom:6px}
.box{display:grid;place-items:center;border-radius:6px;}
.id{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.missing{border-color:#e5484d;background:#3a1216;min-height:150px}.missing b{display:block;color:#ff6b6b;font-size:16px;padding:50px 0 40px;text-align:center}
</style></head><body><div class="grid">${picked.map(cell).join('')}</div></body></html>`;

mkdirSync('art-sheets', { recursive: true });
const out = `art-sheets/${filter ?? 'all'}.png`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 800 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`Wrote ${out} (${picked.length} items)`);
