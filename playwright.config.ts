import {defineConfig, devices} from '@playwright/test';

const TOKEN = 'instinct-local-e2e-test-token-2026';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  expect: {timeout: 12_000},
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', {open: 'never', outputFolder: 'playwright-report'}]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium',
    testIgnore: '**/mobile.spec.ts',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: {
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      },
    },
  }, {
    name: 'webkit-desktop',
    use: {
      ...devices['Desktop Safari'],
      browserName: 'webkit',
    },
    testIgnore: '**/mobile.spec.ts',
  }, {
    name: 'webkit-mobile',
    use: {
      ...devices['iPhone 13'],
      browserName: 'webkit',
    },
    testMatch: '**/mobile*.spec.ts',
  }],
  webServer: [
    {
      command: 'npm run dev --workspace=@instinct/bridge-server',
      wait: {stdout: /Instinct development bridge:/},
      env: {INSTINCT_BRIDGE_TOKEN: TOKEN, INSTINCT_BRIDGE_PORT: '7331'},
      reuseExistingServer: false,
      timeout: 45_000,
      stdout: 'pipe',
    },
    {
      command: 'npm run dev --workspace=@instinct/editor -- --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev --workspace=@instinct/example-remote -- --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
