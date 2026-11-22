import { expect, test } from '@playwright/test';
import { openMenu, savedJson, watchErrors } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('build a deck, reload the page, and the deck is still there', async ({ page }) => {
  const errors = watchErrors(page);
  await openMenu(page);
  await page.getByRole('button', { name: 'Decks', exact: true }).click();
  await page.getByRole('button', { name: 'New deck' }).click();
  await expect(page.getByRole('main', { name: 'Deck builder' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Deck name' }).fill('Test Deck');
  await page.getByRole('group', { name: 'Faction' }).getByRole('button', { name: /Ember/ }).click();
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await expect(page.locator('.deck-strip__problem')).toHaveText(/exactly 30/);

  // Tap each unlocked Ember card three times until the deck has 30 cards.
  const cards = page.locator('.grid-card:not(.grid-card--locked)');
  const count = await cards.count();
  for (let i = 0; i < count && !(await save.isEnabled()); i++) {
    for (let k = 0; k < 3; k++) await cards.nth(i).click();
  }
  await expect(page.locator('.deck-strip__count')).toHaveText('30/30');
  await expect(save).toBeEnabled();

  // A 31st card is refused with a reason.
  await cards.nth(count - 1).click();
  await expect(page.locator('.deck-strip__message')).toHaveText(/already has 30|At most 3/);

  await save.click();
  await expect(page.getByRole('main', { name: 'Decks' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Test Deck' })).toBeVisible();
  await expect.poll(() => savedJson(page)).toContain('Test Deck');

  await page.reload();
  await expect(page.getByRole('main', { name: 'Main menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Decks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Test Deck' })).toBeVisible();
  // Saved decks return to Quick Play when the deck builder moves to Spellfall's cards (V3).
  expect(errors).toEqual([]);
});

test('deck codes: copy a deck code and import it as a new deck', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Decks', exact: true }).click();
  await page.getByRole('button', { name: 'Copy Grave Wardens' }).click();
  await page.getByRole('button', { name: /Show deck list/ }).click();
  await page.getByRole('button', { name: 'Copy deck code' }).click();
  const code = await page.getByRole('textbox', { name: 'Deck code', exact: true }).inputValue();
  expect(code).toMatch(/^SD1-/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('textbox', { name: 'Deck code to import' }).fill(code);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.deck-strip__count')).toHaveText('30/30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Edit Imported deck' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Deck code to import' }).fill('nonsense');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/not a Spellfall deck code/);
});

test('save code: export, then restore into a fresh browser profile', async ({ page, browser }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Decks', exact: true }).click();
  await page.getByRole('button', { name: 'Copy Steam Raiders' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('persist-status')).not.toHaveText('Checking…');
  await page.getByRole('button', { name: 'Copy save code' }).click();
  const code = await page.getByRole('textbox', { name: 'Your save code' }).inputValue();
  expect(code).toMatch(/^SS1\./);

  const fresh = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openMenu(fresh);
  await fresh.getByRole('button', { name: 'Settings' }).click();
  await fresh.getByRole('textbox', { name: 'Paste save code' }).fill(code);
  await fresh.getByRole('button', { name: 'Paste save code' }).click();
  await fresh.getByRole('button', { name: 'Replace my save with this code' }).click();
  await expect(fresh.getByRole('main', { name: 'Main menu' })).toBeVisible();
  await fresh.getByRole('button', { name: 'Decks', exact: true }).click();
  await expect(fresh.getByRole('button', { name: 'Edit Steam Raiders copy' })).toBeVisible();
  await fresh.close();
});
