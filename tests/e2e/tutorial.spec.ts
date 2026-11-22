import { expect, test, type Page } from '@playwright/test';
import { tapHandCard } from './duel';
import { openMenu, savedJson, watchErrors } from './helpers';

const coach = (page: Page) => page.getByTestId('coach');
const next = (page: Page) => page.getByTestId('coach-next');
const mainButton = (page: Page) => page.locator('.end-turn');

/** Waits for the coach to show this step, then taps Next. */
async function readStep(page: Page, text: RegExp) {
  await expect(coach(page)).toContainText(text);
  await expect(next(page)).toBeEnabled();
  await next(page).click();
}

/** Waits for a `do` step, then taps the highlighted hand card or unit and then the target. */
async function doStep(page: Page, text: RegExp, target: string) {
  await expect(coach(page)).toContainText(text);
  await expect(mainButton(page)).toBeEnabled({ timeout: 30_000 });
  const source = page.locator('.coach-target').first();
  if (await source.evaluate((el) => el.classList.contains('hand__slot'))) await tapHandCard(page, source);
  else await source.click();
  await page
    .locator(target)
    .first()
    .click({ position: { x: 8, y: 8 } });
}

/** Waits for a step that asks for End Turn or Resolve, then taps it. */
async function pressMain(page: Page, text: RegExp, label: 'End Turn' | 'Resolve') {
  await expect(coach(page)).toContainText(text);
  await expect(mainButton(page)).toHaveText(label, { timeout: 30_000 });
  await expect(mainButton(page)).toBeEnabled();
  await mainButton(page).click();
}

async function openTutorial(page: Page) {
  await openMenu(page, '?speed=0.05');
  await page.getByTestId('tutorial-prompt').getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('main', { name: 'Match' })).toBeVisible();
}

const enemyHero = '[data-drop="hero:1"]';
const myBoard = '[data-row="0"]';

test.describe('390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('a fresh profile is offered the tutorial, which teaches the stack and can be completed', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await openMenu(page, '?speed=0.05');
    const prompt = page.getByTestId('tutorial-prompt');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('main', { name: 'Match' })).toBeVisible();

    await readStep(page, /Welcome/);
    await expect(coach(page)).toContainText(/Drag Spark Imp/);
    await expect(next(page)).toBeHidden();
    await expect(page.locator('.hand__slot.coach-target')).toHaveCount(1);
    await page.screenshot({ path: 'test-results/screens/tutorial-drag-390x844.png' });
    await doStep(page, /Drag Spark Imp/, myBoard);
    await pressMain(page, /Tap End Turn/, 'End Turn');

    // Turn 3: attack, then keep the mana as spell mana.
    await readStep(page, /mana refills/);
    await doStep(page, /onto the enemy hero to attack/, enemyHero);
    await readStep(page, /wait on the stack/);
    await pressMain(page, /spell mana/, 'End Turn');

    // The opponent attacks: answer with a Burst spell, then let the stack resolve.
    await expect(coach(page)).toContainText(/Answer/, { timeout: 30_000 });
    await expect(page.locator('.stack-item')).toHaveCount(1);
    await page.screenshot({ path: 'test-results/screens/tutorial-respond-390x844.png' });
    await doStep(page, /drag Kindle/, '[data-row="0"] .unit');
    await pressMain(page, /Resolve/, 'Resolve');

    // Turn 5: a Quick unit attacks; the opponent answers with Mend.
    await doStep(page, /Quick/, myBoard);
    await doStep(page, /Attack the enemy hero/, enemyHero);
    await readStep(page, /answered with Mend/);
    await expect(page.locator('.stack-item')).toHaveCount(2);
    await pressMain(page, /Tap Resolve/, 'Resolve');
    await pressMain(page, /End your turn/, 'End Turn');

    // Turn 7: finish it.
    await doStep(page, /Fireball/, enemyHero);
    const result = page.getByRole('dialog', { name: 'Match result' });
    await expect(result.getByRole('heading')).toHaveText('Tutorial complete', { timeout: 30_000 });
    await page.screenshot({ path: 'test-results/screens/tutorial-complete-390x844.png' });
    await result.getByRole('button', { name: 'Back to menu' }).click();
    await expect(page.getByRole('main', { name: 'Main menu' })).toBeVisible();
    await expect(prompt).toBeHidden();

    // It was saved: after a reload the prompt stays away.
    await expect.poll(() => savedJson(page)).toMatch(/tutorialDone\\*":true/);
    await openMenu(page, '?speed=0.05');
    await expect(page.getByTestId('tutorial-prompt')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('wrong plays are refused, leaving early does not finish it, and Skip does', async ({ page }) => {
    const errors = watchErrors(page);
    await openTutorial(page);
    await readStep(page, /Welcome/);
    await expect(coach(page)).toContainText(/Drag Spark Imp/);

    // Ending the turn is refused; Ash Raider cannot be played yet, so tapping it only shows its rules text.
    await mainButton(page).click();
    await expect(page.getByRole('alert')).toHaveText(/Follow the coach/);
    await tapHandCard(
      page,
      page.locator('.hand__slot', { has: page.getByLabel('Ash Raider', { exact: true }) }),
    );
    const detail = page.getByRole('dialog', { name: 'Ash Raider' });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('[data-row="0"] .unit')).toHaveCount(0);
    await expect(coach(page)).toContainText(/Drag Spark Imp/);

    await page.getByRole('button', { name: 'Leave match' }).click();
    await expect(page.getByRole('main', { name: 'Main menu' })).toBeVisible();
    await expect(page.getByTestId('tutorial-prompt')).toBeVisible();

    await page.getByTestId('tutorial-prompt').getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByTestId('tutorial-prompt')).toBeHidden();
    await expect.poll(() => savedJson(page)).toMatch(/tutorialDone\\*":true/);
    // The menu button still replays it.
    await page.getByRole('button', { name: 'Tutorial', exact: true }).click();
    await expect(coach(page)).toContainText(/Welcome/);
    expect(errors).toEqual([]);
  });
});

test.describe('360x740', () => {
  test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });

  test('the coach fits the narrowest screen without covering the hand or the main button', async ({
    page,
  }) => {
    await openTutorial(page);
    await readStep(page, /Welcome/);
    await expect(coach(page)).toContainText(/Drag Spark Imp/);
    const c = (await coach(page).boundingBox())!;
    const turn = (await mainButton(page).boundingBox())!;
    const hand = (await page.locator('[data-zone="hand"]').boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(360);
    expect(c.y + c.height).toBeLessThan(turn.y);
    expect(c.y + c.height).toBeLessThan(hand.y);
    await page.screenshot({ path: 'test-results/screens/tutorial-drag-360x740.png' });
  });
});
