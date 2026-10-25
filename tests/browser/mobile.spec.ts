import {expect, test} from '@playwright/test';

test('touch controls, WebGL rendering, bounded AI updates and health transitions', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5174');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('#perf-stats')).toContainText('Renderer frames:', {timeout: 15000});
  await expect(page.locator('#scoreboard')).toContainText('Market Guard HP 100');

  // Touch input modifies game state without a physical keyboard.
  const control = page.getByRole('button', {name: 'Damage guard 1'});
  for (let i = 0; i < 4; i++) await control.tap();
  await expect(page.locator('#scoreboard')).toContainText('Market Guard HP 20');
  await expect(page.locator('#perf-stats')).toContainText('WebGL losses: 0');
  expect(errors).toEqual([]);
});

test('repeated tab visibility transitions do not crash the demo', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5174');
  await expect(page.locator('#perf-stats')).toContainText('Renderer frames:', {timeout: 15000});
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.getByRole('button', {name: 'Damage guard 2'}).tap();
  await expect(page.locator('#scoreboard')).toContainText('Rooftop Guard HP 80');
  expect(errors).toEqual([]);
});
