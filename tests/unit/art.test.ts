import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import cards from '../../src/content/cards.json';
import heroes from '../../src/content/heroes.json';
import enemies from '../../src/content/enemies.json';
import relics from '../../src/content/relics.json';
import events from '../../src/content/events.json';

/** Flip to true once every card has art, so a missing illustration fails CI. */
const REQUIRE_FULL_COVERAGE = true;

/** Same for run content (heroes, enemies, relics, events). Warns only while false. */
const REQUIRE_RUN_ART = true;

const ART_DIR = join(__dirname, '../../src/content/art');
const MAX_BYTES = 2048;
const ALLOWED = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const SHAPES = new Set([...ALLOWED].filter((n) => n !== 'svg' && n !== 'g'));

/** Line-icon style (docs/art.md): one stroke group in the faction's line colour, no backdrop. */
const PALETTE: Record<string, { line: string }> = {
  ember: { line: '#ff9a3c' },
  tide: { line: '#8fd0ff' },
  grove: { line: '#a6d96a' },
  bastion: { line: '#e8e2cf' },
  dusk: { line: '#c9a3f0' },
  // The Spark and any other neutral token: gold, like relics.
  neutral: { line: '#f0c75e' },
};
const GROUP = [
  ['fill', 'none'],
  ['stroke-width', '4'],
  ['stroke-linecap', 'round'],
  ['stroke-linejoin', 'round'],
] as const;

function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(attrs)?.[1];
}

const NEUTRAL = '#d6d9e0';
const GOLD = '#f0c75e';
const cardIds = new Set((cards as { id: string }[]).map((c) => c.id));
const cardFaction = new Map((cards as { id: string; faction: string }[]).map((c) => [c.id, c.faction]));

/** Expected LINE colours per art id (a set: an enemy may mix factions). */
const runLines = new Map<string, string[]>();
for (const h of heroes as { id: string; faction: string }[]) runLines.set(h.id, [PALETTE[h.faction]!.line]);
for (const e of enemies as { id: string; deck: string[] }[]) {
  const fs = new Set(e.deck.map((c) => cardFaction.get(c.replace(/\+$/, ''))));
  runLines.set(
    e.id,
    [...fs].filter((f): f is string => !!f && f in PALETTE).map((f) => PALETTE[f]!.line),
  );
}
for (const r of relics as { id: string }[]) runLines.set(r.id, [GOLD]);
for (const v of events as { id: string }[]) runLines.set(v.id, [NEUTRAL]);

const ids = new Set([...cardIds, ...runLines.keys()]);
const files = readdirSync(ART_DIR).filter((f) => f.endsWith('.svg'));

/** Tiny tag scanner: returns each opening tag's name and raw attribute text. */
function tags(src: string): { name: string; attrs: string }[] {
  const stripped = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  return [...stripped.matchAll(/<\s*([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)].map((m) => ({
    name: m[1] ?? '',
    attrs: m[2] ?? '',
  }));
}

function attrNames(attrs: string): string[] {
  return [...attrs.matchAll(/([^\s=/"']+)\s*=\s*(?:"[^"]*"|'[^']*')/g)].map((m) => m[1] ?? '');
}

describe('card art', () => {
  it('only contains SVG files named after base card or run content ids', () => {
    for (const f of readdirSync(ART_DIR)) {
      if (f === '.gitkeep') continue;
      expect(f.endsWith('.svg'), `${f} is not an .svg file`).toBe(true);
      expect(ids.has(f.slice(0, -4)), `${f} does not match a card or run content id`).toBe(true);
    }
  });

  for (const f of files) {
    describe(f, () => {
      const src = readFileSync(join(ART_DIR, f), 'utf8');
      const all = tags(src);

      it('is small enough', () => {
        expect(statSync(join(ART_DIR, f)).size).toBeLessThanOrEqual(MAX_BYTES);
      });

      it('has a well-formed root', () => {
        expect(all[0]?.name).toBe('svg');
        const root = all[0]?.attrs ?? '';
        expect(root).toMatch(/xmlns\s*=\s*"http:\/\/www\.w3\.org\/2000\/svg"/);
        expect(root).toMatch(/viewBox\s*=\s*"0 0 100 100"/);
        const names = attrNames(root);
        expect(names).not.toContain('width');
        expect(names).not.toContain('height');
      });

      it('uses only allowed elements and attributes', () => {
        for (const t of all) {
          expect(ALLOWED.has(t.name), `<${t.name}> is not allowed`).toBe(true);
          for (const a of attrNames(t.attrs)) {
            expect(/^on/i.test(a), `${a} event handler`).toBe(false);
            expect(/(^|:)href$/i.test(a), `${a} is not allowed`).toBe(false);
            expect(
              a.toLowerCase(),
              'style attributes are not allowed (use presentation attributes)',
            ).not.toBe('style');
          }
        }
        expect(src).not.toMatch(/<!(?!--)/); // DOCTYPE, CDATA
        expect(src).not.toMatch(/url\(/);
      });

      it('follows the line-icon style', () => {
        const id = f.slice(0, -4);
        const allowed = cardIds.has(id) ? [PALETTE[f.split('-')[0] ?? '']?.line] : runLines.get(id);
        expect(allowed?.[0], 'unknown faction prefix or run id').toBeDefined();
        const [, group, ...shapes] = all;
        expect(group?.name, 'second element must be the stroke <g> (no backdrop shape)').toBe('g');
        for (const [k, v] of GROUP) expect(attr(group!.attrs, k), `<g ${k}>`).toBe(v);
        expect(allowed, '<g stroke> must be the expected line colour').toContain(
          attr(group!.attrs, 'stroke'),
        );
        expect(shapes.length, 'no drawing').toBeGreaterThan(0);
        for (const t of shapes) {
          expect(SHAPES.has(t.name), `<${t.name}> inside the group`).toBe(true);
          for (const a of attrNames(t.attrs)) {
            expect(
              ['fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
              `${a} on <${t.name}>`,
            ).not.toContain(a);
          }
        }
      });
    });
  }

  it('reports cards without art', () => {
    const have = new Set(files.map((f) => f.slice(0, -4)));
    const missing = [...cardIds].filter((id) => !have.has(id));
    if (REQUIRE_FULL_COVERAGE) {
      expect(missing, `cards missing art:\n${missing.join('\n')}`).toEqual([]);
    } else if (missing.length > 0) {
      console.warn(`card art: ${missing.length} of ${cardIds.size} cards have no art yet`);
    }
  });

  it('reports run content without art', () => {
    const have = new Set(files.map((f) => f.slice(0, -4)));
    const missing = [...runLines.keys()].filter((id) => !have.has(id));
    if (REQUIRE_RUN_ART) {
      expect(missing, `run content missing art:\n${missing.join('\n')}`).toEqual([]);
    } else if (missing.length > 0) {
      console.warn(
        `run art: ${missing.length} of ${runLines.size} heroes, enemies, relics and events have no art yet`,
      );
    }
  });
});
