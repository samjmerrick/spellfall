import { expect, test } from '@playwright/test';
import { attackOnce, playCard, playDuel, waitForPlayer } from './duel';
import { keepHand, startMatch, watchErrors } from './helpers';
import { VIEWPORTS } from './viewports';

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });

    test('plays a full match against Normal AI, answering the stack, and reaches the result', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      await startMatch(page, { seed: 11, difficulty: 'Normal', speed: 0.02 });
      await keepHand(page);
      const stats = await playDuel(page);
      const result = page.getByRole('dialog', { name: 'Match result' });
      await expect(result.getByRole('heading')).toHaveText(/Victory|Defeat|Draw/);
      expect(stats.played).toBeGreaterThan(0);
      expect(stats.attacks).toBeGreaterThan(0);
      expect(stats.responses).toBeGreaterThan(0);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/screens/duel-result-${vp.width}x${vp.height}.png` });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('interaction', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a unit card can be dragged onto the board, and a unit dragged onto the enemy hero', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await startMatch(page, { seed: 11, speed: 0.02 });
    await keepHand(page);
    await waitForPlayer(page);
    // Drag the first playable unit card (no speed label) onto your board.
    for (let turn = 0; turn < 4; turn++) {
      const unitCard = page.locator('.hand__slot--playable:not(:has(.card__type))').first();
      if (await unitCard.count()) {
        const before = await page.locator('[data-row="0"] .unit').count();
        const box = (await unitCard.boundingBox())!;
        const row = (await page.locator('[data-row="0"]').boundingBox())!;
        await page.mouse.move(box.x + 12, box.y + 40);
        await page.mouse.down();
        await page.mouse.move(box.x + 12, box.y - 40, { steps: 4 });
        await expect(page.locator('[data-row="0"].drop--valid')).toBeVisible();
        await page.mouse.move(row.x + row.width - 10, row.y + row.height / 2, { steps: 8 });
        await page.mouse.up();
        if ((await page.locator('.stack-strip').innerText()).includes('Choose a target')) {
          await page.locator('.drop--valid').first().click();
        }
        await expect(page.locator('[data-row="0"] .unit')).toHaveCount(before + 1);
        break;
      }
      await page.locator('.end-turn').click();
      await waitForPlayer(page);
    }
    // Next turns: drag a ready unit onto the enemy hero (or any legal target).
    for (let turn = 0; turn < 4; turn++) {
      await page.locator('.end-turn').click();
      await waitForPlayer(page);
      if (await page.getByRole('dialog', { name: 'Match result' }).isVisible()) break;
      const ready = page.locator('.unit--ready').first();
      if (!(await ready.count())) continue;
      const a = (await ready.boundingBox())!;
      const target = page.locator('.drop--valid');
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2, a.y - 30, { steps: 4 });
      await expect(page.locator('.drag-arrow')).toBeVisible();
      const t = (await target.first().boundingBox())!;
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 });
      await page.mouse.up();
      await expect(page.locator('.stack-item, .end-turn:enabled').first()).toBeVisible();
      break;
    }
    expect(errors).toEqual([]);
  });

  test('holding a hand card reads it without playing it; releasing closes it; dragging does not read', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await startMatch(page, { seed: 11, speed: 0.02 });
    await keepHand(page);
    await waitForPlayer(page);
    const card = page.locator('.hand__slot--playable').first();
    const handBefore = await page.locator('.hand__slot').count();
    const box = (await card.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height * 0.3;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const reader = page.locator('.overlay--hold');
    await expect(reader).toBeVisible();
    await expect(reader.locator('.card--large')).toBeVisible();
    await page.mouse.up();
    await expect(reader).toBeHidden();
    await expect(page.locator('.hand__slot')).toHaveCount(handBefore);
    await expect(page.locator('.hand__slot--picked')).toHaveCount(0);
    // A drag never opens the reader.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 60, { steps: 5 });
    await page.waitForTimeout(500);
    await expect(reader).toBeHidden();
    await page.mouse.up();
    expect(errors).toEqual([]);
  });

  test('a card that cannot be played opens its rules text; a picked card can be dropped by tapping away', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await startMatch(page, { seed: 3, speed: 0.02 });
    await keepHand(page);
    await waitForPlayer(page);
    const unplayable = page.locator('.hand__slot:not(.hand__slot--playable)').first();
    await unplayable.click();
    const detail = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Close' }) });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Close' }).click();
    await expect(detail).toBeHidden();
    if (await playCard(page)) await expect(page.locator('.hand__slot--picked')).toHaveCount(0);
    await attackOnce(page);
    expect(errors).toEqual([]);
  });
});
