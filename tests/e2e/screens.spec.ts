// Screenshots of every screen at every supported viewport, each checked for horizontal overflow.
// Run `pnpm screens` to refresh the committed set in docs/screens; otherwise they go to test-results.
import { expect, test, type Page } from '@playwright/test';
import { playCard, playDuel, waitForPlayer } from './duel';
import type { RunChoice } from '../../src/run/schema';
import type { Profile } from '../../src/save';
import fixture from '../fixtures/run-paths.json' with { type: 'json' };
import { keepHand, loadProfile, newProfile, openMenu, savedJson, startMatch, watchErrors } from './helpers';
import { VIEWPORTS } from './viewports';

const OUT_DIR = process.env.UPDATE_SCREENS === '1' ? 'docs/screens' : 'test-results/screens/committed';

const { config } = fixture;
const paths = fixture.paths as Record<keyof typeof fixture.paths, RunChoice[]>;
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

/** A mid-game profile: one Ascension won, some results to show. */
function veteran(): Profile {
  const p = newProfile();
  p.ascension = { best: 2, unlocked: 3 };
  p.stats.runs = { 'hero-pyra': { played: 4, won: 2 }, 'hero-aldric': { played: 1, won: 0 } };
  p.stats.quickPlay = { ember: { played: 6, won: 4 }, d1: { played: 2, won: 0 } };
  return p;
}

/** Loads a saved run (a list of choices for the fixture seed) and opens it from the menu. */
async function loadRun(page: Page, base: Profile, choices: RunChoice[]) {
  await loadProfile(page, { ...base, activeRun: { config, choices, match: null } });
  await page.getByRole('button', { name: /Continue run/ }).click();
  await expect(page.getByRole('main', { name: 'Run' })).toBeVisible();
}

async function abandonRun(page: Page) {
  await page.getByRole('button', { name: 'Abandon run' }).click();
  await page.getByRole('dialog', { name: 'Abandon run?' }).getByRole('button', { name: 'Abandon' }).click();
  await expect(page.getByRole('heading', { name: /^Run (abandoned|lost|won)$/ })).toBeVisible();
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, deviceScaleFactor: 1, hasTouch: true, isMobile: true });

    /** Asserts the page does not scroll sideways, then saves a screenshot named `name`. */
    async function shot(page: Page, name: string) {
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth, `${name}: horizontal overflow`).toBeLessThanOrEqual(innerWidth);
      await page.screenshot({ path: `${OUT_DIR}/${name}-${vp.width}x${vp.height}.png` });
    }

    test('menu and browsing screens', async ({ page }) => {
      const errors = watchErrors(page);
      await openMenu(page, '?seed=7&speed=0.05');
      await loadProfile(page, veteran());
      await shot(page, 'menu');
      for (const [button, region, name] of [
        ['Quick Play', 'Quick Play', 'quickplay'],
        ['Decks', 'Decks', 'decks'],
        ['Collection', 'Collection', 'collection'],
        ['Settings', 'Settings', 'settings'],
        ['Stats', 'Stats', 'stats'],
      ] as const) {
        await page.getByRole('button', { name: button, exact: true }).click();
        await expect(page.getByRole('main', { name: region })).toBeVisible();
        await shot(page, name);
        if (name === 'decks') {
          await page.getByRole('button', { name: 'Copy Steam Raiders' }).click();
          await expect(page.getByRole('main', { name: 'Deck builder' })).toBeVisible();
          await shot(page, 'builder');
          await page.getByRole('button', { name: /Show deck list/ }).click();
          await shot(page, 'builder-list');
          await page.getByRole('button', { name: 'Back', exact: true }).click();
        }
        await page.getByRole('button', { name: 'Back', exact: true }).click();
      }

      await page.getByRole('button', { name: 'New run' }).click();
      await expect(page.getByRole('region', { name: 'Ascension' })).toBeVisible();
      await shot(page, 'run-start');
      expect(errors).toEqual([]);
    });

    test('run screens', async ({ page }) => {
      const errors = watchErrors(page);
      const base = veteran();
      await loadRun(page, base, []);
      await shot(page, 'run-map');

      await loadRun(page, base, paths.reward.slice(0, 1));
      await expect(page.getByRole('region', { name: 'Encounter' })).toBeVisible();
      await shot(page, 'run-match');

      for (const [kind, region, name] of [
        ['reward', 'Reward', 'run-reward'],
        ['eliteReward', 'Reward', 'run-reward-elite'],
        ['shop', 'Shop', 'run-shop'],
        ['rest', 'Rest', 'run-rest'],
        ['treasure', 'Treasure', 'run-treasure'],
        ['event', 'Event', 'run-event'],
        ['actCleared', 'Act cleared', 'run-act-cleared'],
      ] as const) {
        await loadRun(page, base, paths[kind]);
        await expect(page.getByRole('region', { name: region })).toBeVisible();
        await shot(page, name);
      }

      // Run over: abandon from a map with one node cleared.
      await loadRun(page, base, [...paths.reward, { t: 'pick', index: null }]);
      await abandonRun(page);
      await shot(page, 'run-summary');
      expect(errors).toEqual([]);
    });

    test('corrupt save screen', async ({ page }) => {
      await openMenu(page, '?seed=7');
      await expect.poll(() => savedJson(page)).toContain('seq');
      await page.evaluate(
        () =>
          new Promise<void>((resolve, reject) => {
            const open = indexedDB.open('spellfall');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const tx = open.result.transaction('keyval', 'readwrite');
              tx.objectStore('keyval').put('garbage', 'save-slot-a');
              tx.objectStore('keyval').put('garbage', 'save-slot-b');
              tx.oncomplete = () => resolve();
            };
          }),
      );
      await page.goto('./?seed=7');
      await expect(page.getByLabel('Damaged save data')).toBeVisible();
      await shot(page, 'corrupt');
    });

    test('match screens', async ({ page }) => {
      test.setTimeout(55_000);
      const errors = watchErrors(page);
      await startMatch(page, { seed: 7 });
      await expect(page.getByRole('dialog', { name: 'Mulligan' })).toBeVisible();
      await page.waitForTimeout(400);
      await shot(page, 'match-mulligan');
      await keepHand(page);
      // A long press (or right click) opens a card's rules text.
      await page.locator('.hand__slot').first().click({ button: 'right' });
      const detail = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Close' }) });
      await expect(detail).toBeVisible();
      await page.waitForTimeout(400);
      await shot(page, 'card-detail');
      await detail.getByRole('button', { name: 'Close' }).click();
      await expect(detail).toBeHidden();
      await waitForPlayer(page);
      for (let i = 0; i < 2; i++) await playCard(page);
      await shot(page, 'match-planning');

      // Play on to the result.
      const result = page.getByRole('dialog', { name: 'Match result' });
      await playDuel(page);
      await expect(result).toBeVisible();
      await page.waitForTimeout(600);
      await shot(page, 'match-result');
      expect(errors).toEqual([]);
    });

    test.describe('on iOS Safari', () => {
      test.use({ userAgent: IPHONE_UA });

      test('home-screen tip', async ({ page }) => {
        await openMenu(page, '?seed=7');
        await expect(page.getByTestId('ios-tip')).toBeVisible();
        await shot(page, 'menu-ios-tip');
      });
    });
  });
}
