// Helpers for Spellfall matches (src/ui/duel): play by tapping a source, then a highlighted target.
import { expect, type Locator, type Page } from '@playwright/test';

const mainButton = (page: Page) => page.locator('.end-turn');

/** The main button's label, or null once the match is over (the button is gone). */
async function label(page: Page): Promise<string | null> {
  if (await page.getByRole('dialog', { name: 'Match result' }).isVisible()) return null;
  const b = mainButton(page);
  if ((await b.count()) === 0) return null;
  return b.textContent({ timeout: 5_000 }).catch(() => null);
}

/**
 * Taps a hand card at a point no neighbouring card covers (a full hand fans out and overlaps), as a player
 * would tap the visible strip of a card.
 */
export async function tapHandCard(page: Page, slot: Locator) {
  const handle = await slot.elementHandle();
  const point = await page.evaluate((el) => {
    const r = el!.getBoundingClientRect();
    for (let fy = 0.2; fy < 0.9; fy += 0.1)
      for (let fx = 0.05; fx < 0.95; fx += 0.05) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        if (document.elementFromPoint(x, y)?.closest('.hand__slot') === el) return { x, y };
      }
    return null;
  }, handle);
  if (!point) throw new Error('no visible point on the hand card');
  await page.mouse.click(point.x, point.y);
}

/** Waits until the player can act (or the match is over). */
export async function waitForPlayer(page: Page) {
  const result = page.getByRole('dialog', { name: 'Match result' });
  await expect(page.locator('.end-turn:enabled').or(result)).toBeVisible({ timeout: 60_000 });
}

async function settle(page: Page) {
  await page.waitForFunction(
    () => {
      const b = document.querySelector('.end-turn');
      return !b || b.textContent !== '…';
    },
    null,
    { timeout: 60_000 },
  );
}

/** Taps the first highlighted target, preferring the opponent hero. */
async function tapTarget(page: Page): Promise<boolean> {
  const hero = page.locator('[data-drop="hero:1"].drop--valid');
  if (await hero.count()) {
    await hero.click();
    return true;
  }
  const unit = page.locator('.unit.drop--valid, .hero-slot.drop--valid');
  if (await unit.count()) {
    await unit.first().click();
    return true;
  }
  const area = page.locator('.drop--valid');
  if (await area.count()) {
    await area.first().click({ position: { x: 12, y: 12 } });
    return true;
  }
  return false;
}

/**
 * Plays the first playable hand card matching `filter` by tapping it and then its targets.
 * Returns false if nothing could be played.
 */
export async function playCard(page: Page, filter = '.hand__slot--playable'): Promise<boolean> {
  const card = page.locator(filter).first();
  if ((await card.count()) === 0) return false;
  await tapHandCard(page, card);
  if (!(await tapTarget(page))) {
    await page.locator('.stack-strip').click();
    return false;
  }
  // On Play or second targets.
  for (let i = 0; i < 2; i++) {
    if (!(await page.locator('.stack-strip').innerText()).includes('Choose a target')) break;
    await tapTarget(page);
  }
  await settle(page);
  return true;
}

/** Attacks with the first ready unit, preferring the hero. */
export async function attackOnce(page: Page): Promise<boolean> {
  const unit = page.locator('.unit--ready').first();
  if ((await unit.count()) === 0) return false;
  await unit.click();
  if (!(await tapTarget(page))) return false;
  await settle(page);
  return true;
}

/** Spells that can answer on the opponent's turn: the player keeps them for responses. */
const QUICK = '.hand__slot--playable:has(.card__type--burst), .hand__slot--playable:has(.card__type--fast)';
const NOT_QUICK = '.hand__slot--playable:not(:has(.card__type--burst)):not(:has(.card__type--fast))';

/**
 * Plays a match to the end. On its own turns the player plays everything except Burst and Fast spells,
 * then attacks; when the opponent puts something on the stack, it answers with a kept spell if it can.
 */
export async function playDuel(page: Page, maxSteps = 400) {
  const result = page.getByRole('dialog', { name: 'Match result' });
  const stats = { played: 0, attacks: 0, responses: 0, turns: 0 };
  for (let step = 0; step < maxSteps && !(await result.isVisible()); step++) {
    await waitForPlayer(page);
    if (await result.isVisible()) break;
    if ((await label(page)) === 'Resolve') {
      if (await playCard(page, QUICK)) stats.responses++;
      if ((await label(page)) === 'Resolve' && (await mainButton(page).isEnabled()))
        await mainButton(page).click();
      continue;
    }
    stats.turns++;
    for (let i = 0; i < 8 && (await label(page)) === 'End Turn' && (await playCard(page, NOT_QUICK)); i++)
      stats.played++;
    for (let i = 0; i < 6 && (await label(page)) === 'End Turn'; i++) {
      if (!(await attackOnce(page))) break;
      stats.attacks++;
      // An attack hands priority to the opponent; wait until it comes back.
      await waitForPlayer(page);
    }
    if ((await label(page)) === 'End Turn' && (await mainButton(page).isEnabled()))
      await mainButton(page).click();
  }
  await expect(result).toBeVisible();
  return stats;
}
