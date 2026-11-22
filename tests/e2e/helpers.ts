import { expect, type Page } from '@playwright/test';
import { deflateRawSync } from 'node:zlib';
import type { Profile } from '../../src/save';

/** Collects console errors and page errors for the test to assert on. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function openMenu(page: Page, query = '') {
  await page.goto(`./${query}`);
  await expect(page.getByRole('main', { name: 'Main menu' })).toBeVisible();
}

export async function startMatch(
  page: Page,
  opts: { seed?: number; speed?: number; difficulty?: 'Easy' | 'Normal'; deck?: string } = {},
) {
  await openMenu(page, `?seed=${opts.seed ?? 7}&speed=${opts.speed ?? 0.05}`);
  await page.getByRole('button', { name: 'Quick Play' }).click();
  if (opts.deck) await page.getByRole('radio', { name: new RegExp(opts.deck) }).click();
  if (opts.difficulty) await page.getByRole('radio', { name: opts.difficulty }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.getByRole('main', { name: 'Match' })).toBeVisible();
}

export async function keepHand(page: Page) {
  await page.getByRole('button', { name: /Keep hand|Replace/ }).click();
  await expect(page.getByRole('dialog', { name: 'Mulligan' })).toBeHidden();
}

const LIFT = 70; // the dragged card is drawn this far above the finger (src/ui/Hand.tsx)

/** Drags the first playable hand card onto its first valid target. Returns false if none could be played. */
export async function playOneCard(page: Page): Promise<boolean> {
  const card = page.locator('.hand__slot--playable').first();
  if ((await card.count()) === 0) return false;
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 30, { steps: 4 });
  const target = page.locator('.drop--valid').first();
  if ((await target.count()) === 0) {
    await page.mouse.up();
    return false;
  }
  const t = (await target.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2 + LIFT, { steps: 6 });
  await page.mouse.up();
  return true;
}

/** Reads both save slots straight from IndexedDB (the 'spellfall' database). */
export async function savedJson(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('spellfall');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('keyval', 'readonly');
          const store = tx.objectStore('keyval');
          const a = store.get('save-slot-a');
          const b = store.get('save-slot-b');
          tx.oncomplete = () => resolve(JSON.stringify([a.result, b.result]));
        };
      }),
  );
}

/** A new-game profile (src/save/profile.ts newProfile; not imported because that module needs a bundler for its JSON). */
export const newProfile = (): Profile => ({
  schemaVersion: 7,
  xp: 0,
  level: 1,
  unlocks: [],
  decks: [],
  nextDeckId: 1,
  settings: { fastAnimations: false, reduceMotion: false, sound: true, haptics: true, autoPass: true },
  stats: { quickPlay: {}, runs: {} },
  ascension: { best: 0, unlocked: 0 },
  activeRun: null,
  tutorialDone: false,
  iosTipSeen: false,
});

/** A save code for `profile` (format in src/save/code.ts; built here because that module needs a bundler). */
export function saveCode(profile: Profile): string {
  const json = JSON.stringify(profile);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) h = Math.imul(h ^ json.charCodeAt(i), 0x01000193);
  const sum = (h >>> 0).toString(16).padStart(8, '0');
  return `SS1.${deflateRawSync(Buffer.from(json)).toString('base64url')}.${sum}`;
}

/** Replaces the saved profile by pasting a save code in Settings (the app's own import path). */
export async function loadProfile(page: Page, profile: Profile, query = '?seed=7&speed=0.05') {
  const code = saveCode(profile);
  await openMenu(page, query);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Paste save code' }).fill(code);
  await page.getByRole('button', { name: 'Paste save code' }).click();
  await page.getByRole('button', { name: 'Replace my save with this code' }).click();
  await expect(page.getByRole('main', { name: 'Main menu' })).toBeVisible();
}
