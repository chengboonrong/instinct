import {test, expect, type Browser, type Page} from '@playwright/test';

const TOKEN = 'instinct-local-e2e-test-token-2026';
const STUDIO = 'http://127.0.0.1:5173';
const GAME = 'http://127.0.0.1:5174';

async function connectGame(page: Page): Promise<void> {
  await page.goto(GAME);
  await page.locator('#bridge-token').fill(TOKEN);
  await page.locator('#bridge-connect').click();
  await expect(page.locator('#bridge-status')).toContainText('Connected; publishing two live NPCs');
}

async function connectStudio(page: Page, token = TOKEN): Promise<void> {
  await page.goto(STUDIO);
  await page.getByLabel('Session token (not saved)').fill(token);
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
}

async function openConnectedPair(browser: Browser): Promise<{game: Page; studio: Page}> {
  const game = await browser.newPage();
  const studio = await browser.newPage();
  await connectGame(game);
  await connectStudio(studio);
  await expect(studio.locator('.right-pane [role="status"]')).toHaveText('Connected to local bridge');
  await expect(studio.locator('#remoteAgent option')).toHaveCount(3);
  return {game, studio};
}

test('live two-NPC inspection, trace changes, read-only mode and disconnect', async ({browser}) => {
  const {game, studio} = await openConnectedPair(browser);
  try {
    const chooser = studio.locator('#remoteAgent');
    await chooser.selectOption('guard-one');
    await expect(studio.locator('main h1')).toHaveText('Market Guard');
    await expect(studio.locator('.debug-memory')).toContainText('health');
    await expect(studio.locator('.tree-node.trace-running').first()).toBeVisible();
    await expect(studio.locator('#newKind')).toBeDisabled();
    await expect(studio.locator('#nodeLabel')).toBeDisabled();

    await chooser.selectOption('guard-two');
    await expect(studio.locator('main h1')).toHaveText('Rooftop Guard');
    // The game's real input path controls this health change; Studio never issues commands.
    await game.bringToFront();
    for (let i = 0; i < 4; i++) await game.keyboard.press('2');
    await expect(game.locator('#scoreboard')).toContainText('Rooftop Guard HP 20');
    await expect(studio.locator('.debug-memory')).toContainText('20');
    await expect(studio.locator('.tree-node.trace-running').filter({hasText: 'Retreat'})).toBeVisible();

    await studio.getByRole('button', {name: 'Disconnect', exact: true}).click();
    await expect(studio.locator('#remoteAgent option')).toHaveCount(1);
    await expect(studio.locator('main h1')).toHaveText('Enemy decision tree');
    await expect(studio.locator('#newKind')).toBeEnabled();
  } finally {
    await game.close();
    await studio.close();
  }
});

test('Studio reconnects and receives cached snapshots without game restart', async ({browser}) => {
  const {game, studio} = await openConnectedPair(browser);
  try {
    await studio.locator('#remoteAgent').selectOption('guard-one');
    await expect(studio.locator('main h1')).toHaveText('Market Guard');
    await studio.getByRole('button', {name: 'Disconnect', exact: true}).click();
    await expect(studio.locator('.right-pane [role="status"]')).toHaveText('Not connected');
    // Reconnect is a new authenticated viewer; the game is still running.
    await studio.getByRole('button', {name: 'Connect', exact: true}).click();
    await expect(studio.locator('.right-pane [role="status"]')).toHaveText('Connected to local bridge');
    await expect(studio.locator('#remoteAgent option')).toHaveCount(3);
    await studio.locator('#remoteAgent').selectOption('guard-one');
    await expect(studio.locator('main h1')).toHaveText('Market Guard');
    await expect(studio.locator('.debug-history .debug-entry').first()).toBeVisible();
  } finally {
    await game.close();
    await studio.close();
  }
});

test('invalid token cannot list NPCs; reconnect works with correct token', async ({browser}) => {
  const game = await browser.newPage();
  const studio = await browser.newPage();
  try {
    await connectGame(game);
    await connectStudio(studio, 'wrong-session-token-123456789');
    await expect(studio.locator('.right-pane [role="status"]')).toHaveText(/Disconnected|Error:/);
    await expect(studio.locator('#remoteAgent option')).toHaveCount(1);
    await studio.getByLabel('Session token (not saved)').fill(TOKEN);
    await studio.getByRole('button', {name: 'Connect', exact: true}).click();
    await expect(studio.locator('.right-pane [role="status"]')).toHaveText('Connected to local bridge');
    await expect(studio.locator('#remoteAgent option')).toHaveCount(3);
  } finally {
    await game.close();
    await studio.close();
  }
});

test('a node id naming an Object.prototype member cannot blank Studio', async ({page}) => {
  await page.goto(STUDIO);
  const leaf = (id: string, task: string) => ({id, kind: 'action', label: id, task, children: [], position: {x: 300, y: 0}});
  await page.getByLabel('Graph JSON').fill(JSON.stringify({version: 1, rootId: 'top', nodes: [
    {id: 'top', kind: 'selector', label: 'top', children: ['patrol', '__proto__'], position: {x: 0, y: 0}},
    leaf('patrol', 'patrol'), leaf('__proto__', 'attack'),
  ]}));
  await page.getByRole('button', {name: 'Import & validate JSON'}).click();
  await page.getByRole('button', {name: /Step/}).click();
  await expect(page.locator('.preview-output')).toContainText('running');
  await expect(page.locator('.tree-node.trace-running').first()).toBeVisible();
});

test('local authoring preview still runs when no remote agent is selected', async ({page}) => {
  await page.goto(STUDIO);
  await expect(page.locator('main h1')).toHaveText('Enemy decision tree');
  await page.getByRole('button', {name: /Step/}).click();
  await expect(page.locator('.preview-output')).toContainText('running');
  await expect(page.locator('.tree-node.trace-running').first()).toBeVisible();
  await expect(page.locator('.debug-history .debug-entry').first()).toBeVisible();
});
