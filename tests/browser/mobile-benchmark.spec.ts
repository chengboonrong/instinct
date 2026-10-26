import {expect, test} from '@playwright/test';

const BENCHMARK = 'http://127.0.0.1:5174/benchmark.html';

test('mobile benchmark produces an exportable 50-NPC performance report', async ({page}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(BENCHMARK);
  await expect(page.getByRole('heading', {name: /Mobile AI Benchmark/})).toBeVisible();
  await expect(page.locator('#viewport canvas')).toHaveCount(1);
  await page.getByLabel('NPC count').selectOption('50');
  await page.getByRole('button', {name: 'Start benchmark'}).click();
  await expect(page.locator('#progress')).toContainText('Running 50 NPCs');
  await expect(page.locator('#metrics')).toContainText('recent frame p95:', {timeout: 15000});
  await page.getByRole('button', {name: 'Stop and generate report'}).click();
  await expect(page.locator('#progress')).toContainText('Stopped');
  const report = JSON.parse(await page.getByLabel('Benchmark JSON report').inputValue()) as {
    schema: number;
    reason: string;
    workload: {npcCount: number; tracedAgents: number};
    metrics: {
      frameInterval: {samples: number; p95Ms: number};
      aiCpu: {p95Ms: number};
      aiUpdates: number;
      webglContextLost: number;
    };
  };
  expect(report.schema).toBe(1);
  expect(report.reason).toBe('manual');
  expect(report.workload.npcCount).toBe(50);
  expect(report.workload.tracedAgents).toBe(0);
  expect(report.metrics.frameInterval.samples).toBeGreaterThan(5);
  expect(Number.isFinite(report.metrics.frameInterval.p95Ms)).toBe(true);
  expect(Number.isFinite(report.metrics.aiCpu.p95Ms)).toBe(true);
  expect(report.metrics.aiUpdates).toBeGreaterThan(0);
  expect(report.metrics.webglContextLost).toBeGreaterThanOrEqual(0);
  await expect(page.getByRole('button', {name: 'Download JSON'})).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test('250 NPCs with opt-in tracing remain measurable and reset clears the report', async ({page}) => {
  await page.goto(BENCHMARK);
  await page.getByLabel('NPC count').selectOption('250');
  await page.getByLabel(/Instrument one NPC/).check();
  await page.getByRole('button', {name: 'Start benchmark'}).click();
  await expect(page.locator('#metrics')).toContainText('recent AI p95:', {timeout: 15000});
  await page.getByRole('button', {name: 'Stop and generate report'}).click();
  const report = JSON.parse(await page.getByLabel('Benchmark JSON report').inputValue()) as {
    workload: {npcCount: number; tracedAgents: number};
    metrics: {aiUpdates: number};
  };
  expect(report.workload).toMatchObject({npcCount: 250, tracedAgents: 1});
  expect(report.metrics.aiUpdates).toBeGreaterThan(0);
  await page.getByRole('button', {name: 'Reset', exact: true}).click();
  await expect(page.getByLabel('Benchmark JSON report')).toHaveValue('');
  await expect(page.getByRole('button', {name: 'Download JSON'})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Start benchmark'})).toBeEnabled();
});
