import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createEvent, sign } from '@kete/sdk';
import pg from 'pg';

// Spec 008: a Kete operator runs the offers catalog from Kete Cockpit; nobody else gets in.

const ACCOUNT = 'http://localhost:3200';
const COCKPIT = 'http://127.0.0.1:3300';
const OPERATORS = 'org_e2e_operators';
const PRODUCT = 'prd_e2e_cockpit';
const run = randomBytes(4).toString('hex');
const password = `e2e-${randomBytes(9).toString('base64url')}`;
const operatorEmail = `operator.cockpit.${run}@example.test`;
let totpSecret = '';
let cockpit: ChildProcess | undefined;

test.describe.configure({ mode: 'serial' });

/** COCKPIT_SCREENSHOTS=<folder>: keep a picture of each screen the journeys go through. */
async function shot(page: Page, name: string) {
  const folder = process.env.COCKPIT_SCREENSHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true });
}

/** RFC 6238 code from a base32 secret, as an authenticator app computes it. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** The Compte Kete API as a browser calls it, keeping cookies. */
function accountClient() {
  const jar = new Map<string, string>();
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(`${ACCOUNT}/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ACCOUNT,
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const index = pair?.indexOf('=') ?? -1;
      if (pair && index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return {
      status: response.status,
      json: (await response.json().catch(() => null)) as Record<string, unknown>,
    };
  };
  return Object.assign(call, { cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ') });
}

test.beforeAll(async () => {
  // A previous interrupted run may have left the Compte Kete registered.
  const registry = new pg.Pool({ connectionString: process.env.COCKPIT_TEST_APP_URL, max: 1 });
  await registry.query(`delete from apps where product = 'prd_kete_account'`);
  await registry.end();

  // An operator: two-factor on, owner of Kete's organization (the test's).
  const operator = accountClient();
  const signUp = await operator('/sign-up/email', {
    name: 'Awa Operator',
    email: operatorEmail,
    password,
  });
  expect(signUp.status).toBe(200);
  const userId = String((signUp.json.user as { id: string }).id);
  const enabled = await operator('/two-factor/enable', { password });
  totpSecret = new URL(String(enabled.json.totpURI)).searchParams.get('secret') ?? '';
  expect((await operator('/two-factor/verify-totp', { code: totp(totpSecret) })).status).toBe(200);
  const db = new pg.Pool({ connectionString: process.env.ACCOUNT_TEST_APP_URL, max: 1 });
  try {
    await db.query(
      `insert into organization (id, name, slug, created_at) values ($1, 'Kete (e2e)', $1, now())
       on conflict (id) do nothing`,
      [OPERATORS],
    );
    await db.query(
      `insert into member (id, organization_id, user_id, role, created_at)
       values ($1, $2, $3, 'owner', now())`,
      [`mbr_cockpit_${run}`, OPERATORS, userId],
    );
  } finally {
    await db.end();
  }

  // The operator registers the Cockpit (server-only), then the Cockpit starts with it.
  Object.assign(process.env, {
    ACCOUNT_DATABASE_URL: process.env.ACCOUNT_TEST_APP_URL,
    BETTER_AUTH_SECRET: process.env.ACCOUNT_TEST_AUTH_SECRET,
    BETTER_AUTH_URL: ACCOUNT,
    KETE_OPERATORS_ORGANIZATION_ID: OPERATORS,
  });
  const { auth } = await import('../../account/src/platform/auth');
  const api = auth.api as unknown as {
    adminCreateOAuthClient(input: {
      body: Record<string, unknown>;
      headers: Headers;
    }): Promise<{ client_id: string; client_secret: string }>;
  };
  const client = await api.adminCreateOAuthClient({
    headers: new Headers({ cookie: operator.cookie() }),
    body: {
      client_name: `Kete Cockpit (e2e ${run})`,
      application_type: 'native',
      redirect_uris: [`${COCKPIT}/auth/callback`],
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      skip_consent: true,
      require_pkce: true,
    },
  });

  const dist = (path: string) => fileURLToPath(new URL(`../dist/${path}`, import.meta.url));
  cockpit = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/srvx/bin/srvx.mjs', import.meta.url)),
      'serve',
      '--entry',
      dist('server/server.js'),
      '--static',
      dist('client'),
      '--prod',
      '--host',
      '127.0.0.1',
      '--port',
      '3300',
    ],
    {
      env: {
        ...process.env,
        KETE_ACCOUNT_URL: ACCOUNT,
        COCKPIT_URL: COCKPIT,
        COCKPIT_CLIENT_ID: client.client_id,
        COCKPIT_CLIENT_SECRET: client.client_secret,
        COCKPIT_SESSION_SECRET: randomBytes(32).toString('hex'),
        KETE_OPERATORS_ORGANIZATION_ID: OPERATORS,
        COCKPIT_DATABASE_URL: process.env.COCKPIT_TEST_APP_URL,
        COCKPIT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
        COCKPIT_PROBE_INTERVAL_SECONDS: '0',
      },
      stdio: 'ignore',
    },
  );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await fetch(`${COCKPIT}/au-revoir`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
});

test.afterAll(async () => {
  cockpit?.kill();
  const registry = new pg.Pool({ connectionString: process.env.COCKPIT_TEST_APP_URL, max: 1 });
  await registry.query(`delete from kete_received_events where product = 'prd_kete_account'`);
  await registry.query(`delete from apps where product = 'prd_kete_account'`);
  await registry.end();
  const owner = new pg.Pool({ connectionString: process.env.ACCOUNT_TEST_OWNER_URL, max: 1 });
  await owner.query(`update offers set active = false where provider_product_id = $1`, [PRODUCT]);
  await owner.end();
});

async function signInToCockpit(page: Page) {
  await page.goto(`${COCKPIT}/`);
  await page.waitForURL(`${ACCOUNT}/connexion**`);
  await page.getByLabel('Adresse e-mail').fill(operatorEmail);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(`${ACCOUNT}/connexion/code**`);
  await page.getByLabel('Code').fill(totp(totpSecret));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await page.waitForURL(`${COCKPIT}/apps`);
}

async function clientSeesOffer(browser: Browser): Promise<boolean> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${ACCOUNT}/inscription`);
  await page.getByLabel('Votre nom').fill('Client');
  await page
    .getByLabel('Adresse e-mail')
    .fill(`client.${randomBytes(4).toString('hex')}@example.test`);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL('**/espace/nouvelle-organisation');
  await page.getByLabel("Nom de l'organisation").fill('Client org');
  await page.getByRole('button', { name: "Créer l'organisation" }).click();
  await page.waitForURL('**/espace');
  await page.goto(`${ACCOUNT}/espace/abonnements`);
  await expect(page.getByRole('heading', { name: 'Abonnements' })).toBeVisible();
  const visible = await page.getByText('Nettio — 30 jours (e2e)').isVisible();
  await page.context().close();
  return visible;
}

test('an operator signs in with two-factor and offers a product that clients then see', async ({
  page,
  browser,
}) => {
  await signInToCockpit(page);
  await page.goto(`${COCKPIT}/offres`);
  await expect(page.getByRole('heading', { name: 'Offres', level: 1 })).toBeVisible();
  await shot(page, '2-offres-avant');
  const product = page.locator('li', { hasText: 'Nettio — 30 jours (e2e)' });
  await product.getByLabel('Application').selectOption('nettio');
  await product.getByLabel('Durée (jours)').fill('30');
  await product.getByRole('button', { name: 'Proposer' }).click();
  await expect(page.getByText('Offre enregistrée.')).toBeVisible();
  await shot(page, '3-offres-apres');
  await expect(
    page.locator('li', { hasText: 'Nettio — 30 jours (e2e)' }).getByText('En vente'),
  ).toBeVisible();
  expect(await clientSeesOffer(browser)).toBe(true);
});

test('the operator withdraws the offer; clients no longer see it', async ({ page, browser }) => {
  await signInToCockpit(page);
  await page.goto(`${COCKPIT}/offres`);
  await page
    .locator('li', { hasText: 'Nettio — 30 jours (e2e)' })
    .getByRole('button', { name: 'Retirer' })
    .click();
  await expect(page.getByText('Offre retirée.')).toBeVisible();
  expect(await clientSeesOffer(browser)).toBe(false);
});

test('a client of Kete is kept out of the Cockpit, and told why', async ({ page }) => {
  await page.goto(`${ACCOUNT}/inscription`);
  await page.getByLabel('Votre nom').fill('Curious');
  await page.getByLabel('Adresse e-mail').fill(`curious.${run}@example.test`);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL('**/espace/**');
  await page.goto(`${COCKPIT}/offres`);
  await page.waitForURL(`${COCKPIT}/refus**`);
  await expect(page.getByText('Kete Cockpit est réservé aux opérateurs Kete.')).toBeVisible();
  await shot(page, '7-refus');
});

test('an operator registers the Compte Kete, reads its health and sees its signed events', async ({
  page,
}) => {
  await signInToCockpit(page);
  await page.goto(`${COCKPIT}/apps`);
  await page.getByLabel('Adresse de l’app').fill(ACCOUNT);
  await page.getByRole('button', { name: 'Déclarer' }).click();
  await expect(page.getByTestId('key-secret')).toBeVisible();
  await shot(page, '4-apps-cle');
  const secretLine = (await page.getByTestId('key-secret').textContent()) ?? '';
  const kidLine = (await page.getByText(/^Identifiant : /).textContent()) ?? '';
  const key = {
    kid: kidLine.replace('Identifiant : ', '').trim(),
    secret: secretLine.replace('Secret : ', '').trim(),
  };
  expect(key.secret.length).toBeGreaterThan(30);

  await page.getByRole('link', { name: 'Compte Kete' }).click();
  await page.getByRole('button', { name: 'Relever maintenant' }).click();
  await expect(page.getByTestId('probes').getByText('En forme').first()).toBeVisible({
    timeout: 20_000,
  });

  // The Compte Kete declares no event yet: an app declaring one would sign it this way.
  const registry = new pg.Pool({ connectionString: process.env.COCKPIT_TEST_APP_URL, max: 1 });
  await registry.query(
    `update apps set events = '["account.created"]' where product = 'prd_kete_account'`,
  );
  await registry.end();
  const event = createEvent({
    type: 'account.created',
    product: 'prd_kete_account',
    organization: 'org_client_e2e1',
    data: {},
    declaredTypes: ['account.created'],
  });
  const body = JSON.stringify({ events: [event] });
  const delivered = await fetch(`${COCKPIT}/api/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'kete-product': 'prd_kete_account',
      'kete-signature': sign(body, key),
    },
    body,
  });
  expect(delivered.status).toBe(200);
  const forged = await fetch(`${COCKPIT}/api/events`, {
    method: 'POST',
    headers: { 'kete-product': 'prd_kete_account', 'kete-signature': 't=1,kid=x,v1=00' },
    body,
  });
  expect(forged.status).toBe(401);

  await page.reload();
  await expect(page.getByTestId('events').getByText('account.created')).toBeVisible();
  await shot(page, '5-app-detail');
  await page.goto(`${COCKPIT}/apps`);
  await shot(page, '1-apps');
  await page.setViewportSize({ width: 375, height: 812 });
  await shot(page, '6-apps-telephone');
});
