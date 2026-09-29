import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from '@playwright/test';

// Kete Cockpit end to end: the Compte Kete (production build, Neon "test" branch, a fake payment
// provider) is started here; the Cockpit is started by the test itself, once it is registered as
// a client by an operator. KETE_CHROMIUM lets a machine without the bundled browser use its own.
const rootEnv = '../../.env';
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const databaseUrl = process.env.ACCOUNT_TEST_APP_URL;
const authSecret = process.env.ACCOUNT_TEST_AUTH_SECRET;
if (!databaseUrl || !authSecret) {
  throw new Error(
    'ACCOUNT_TEST_APP_URL and ACCOUNT_TEST_AUTH_SECRET must be set (see .env.example).',
  );
}

const account = (path: string) =>
  fileURLToPath(new URL(`../account/dist/${path}`, import.meta.url));

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    locale: 'fr-FR',
    launchOptions: process.env.KETE_CHROMIUM ? { executablePath: process.env.KETE_CHROMIUM } : {},
  },
  webServer: {
    // Both production builds; the Compte Kete is served here, the Cockpit by the test.
    command: `pnpm --filter @kete/account build && pnpm --filter @kete/cockpit build && pnpm --filter @kete/account exec srvx serve --entry ${account('server/server.js')} --static ${account('client')} --prod --port 3200`,
    port: 3200,
    env: {
      ACCOUNT_DATABASE_URL: databaseUrl,
      BETTER_AUTH_URL: 'http://localhost:3200',
      BETTER_AUTH_SECRET: authSecret,
      KETE_OPERATORS_ORGANIZATION_ID: 'org_e2e_operators',
      PAYMENTS_PROVIDER: 'fake',
      PAYMENTS_FAKE_PRODUCTS: JSON.stringify([
        {
          id: 'prd_e2e_cockpit',
          name: 'Nettio — 30 jours (e2e)',
          price: { value: 5000, currency: 'XOF' },
        },
      ]),
    },
    reuseExistingServer: false,
    timeout: 360_000,
  },
});
