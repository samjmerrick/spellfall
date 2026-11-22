import { expect, test } from '@playwright/test';
import { keepHand, openMenu, startMatch, watchErrors } from './helpers';
import { VIEWPORTS } from './viewports';

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

    test('setup and match screens have no horizontal overflow', async ({ page }) => {
      const errors = watchErrors(page);
      const noOverflow = async () => {
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
      };

      await openMenu(page, '?seed=7');
      await noOverflow();
      await page.screenshot({ path: `test-results/screens/menu-${vp.width}x${vp.height}.png` });
      for (const [button, screen] of [
        ['Quick Play', 'Quick Play'],
        ['Decks', 'Decks'],
        ['Collection', 'Collection'],
        ['Settings', 'Settings'],
      ] as const) {
        await page.getByRole('button', { name: button, exact: true }).click();
        await expect(page.getByRole('main', { name: screen })).toBeVisible();
        await noOverflow();
        await page.screenshot({
          path: `test-results/screens/${screen.toLowerCase().replace(' ', '')}-${vp.width}x${vp.height}.png`,
        });
        if (screen === 'Decks') {
          await page.getByRole('button', { name: 'Copy Steam Raiders' }).click();
          await expect(page.getByRole('main', { name: 'Deck builder' })).toBeVisible();
          await noOverflow();
          await page.screenshot({ path: `test-results/screens/builder-${vp.width}x${vp.height}.png` });
          await page.getByRole('button', { name: /Show deck list/ }).click();
          await noOverflow();
          await page.screenshot({ path: `test-results/screens/builder-list-${vp.width}x${vp.height}.png` });
          await page.getByRole('button', { name: 'Back', exact: true }).click();
        }
        await page.getByRole('button', { name: 'Back', exact: true }).click();
      }

      await startMatch(page, { seed: 7 });
      await page.screenshot({ path: `test-results/screens/mulligan-${vp.width}x${vp.height}.png` });
      await keepHand(page);
      await noOverflow();

      // Every zone, including the whole hand, sits inside the viewport.
      await expect(page.locator('.end-turn:enabled')).toBeVisible({ timeout: 30_000 });
      for (const zone of ['opponent-bar', 'opponent-board', 'stack', 'player-board', 'player-bar', 'hand']) {
        const box = await page.locator(`[data-zone="${zone}"]`).boundingBox();
        expect(box, zone).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
      }
      for (const card of await page.locator('.hand .card').all()) {
        const box = (await card.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      }

      const endTurn = (await page.getByRole('button', { name: 'End Turn' }).boundingBox())!;
      expect(endTurn.height).toBeGreaterThanOrEqual(44);
      expect(endTurn.width).toBeGreaterThanOrEqual(44);

      await page.screenshot({ path: `test-results/screens/match-${vp.width}x${vp.height}.png` });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('shows the rotate notice', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByText('Rotate your phone')).toBeVisible();
    await expect(page.getByRole('main', { name: 'Main menu' })).toBeHidden();
  });
});
