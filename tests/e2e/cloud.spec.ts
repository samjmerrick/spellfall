import { expect, test } from '@playwright/test';
import { openMenu, watchErrors } from './helpers';

// Cloud sync is optional: the Cloud save section only exists when a PocketBase answers on the same origin.
// (Real Google sign-in cannot be driven headlessly; the sync logic is covered by tests/unit/cloud.test.ts.)

test('Settings has no Cloud save section when there is no server, and the game is unaffected', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('persist-status')).not.toHaveText('Checking…');
  await expect(page.getByRole('heading', { name: 'Cloud save' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Settings offers Sign in with Google when the server answers', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { code: 200, message: 'API is healthy.', data: {} } }),
  );
  await openMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Cloud save' })).toBeVisible();
  await expect(page.getByTestId('cloud-sign-in')).toHaveText('Sign in with Google');
  await expect(page.getByTestId('cloud-hint')).toContainText('works the same without it');
});
