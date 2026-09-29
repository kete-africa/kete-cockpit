import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createEvent, deliveryHandler, postgresDedupeStore, sign } from '@kete/sdk';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appDetail,
  declaredEvents,
  listApps,
  loadKeyRing,
  normalizeBaseUrl,
  probeApp,
  registerApp,
  RegistryError,
  rotateKey,
} from '@/features/registry/registry';
import { db, getPool } from '@/platform/db';
import { apps, appKeys } from '@/platform/schema';
import { open } from '@/platform/secrets';

// Spec 009: the Cockpit registers apps from their manifest, reads their health, and accepts their
// signed events once — and nothing unsigned, undeclared or signed with a retired key.

const run = randomBytes(4).toString('hex');
const product = `prd_witness_${run}`;
let health: unknown = { status: 'healthy' };
let server: Server;
let baseUrl = '';
const registered: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/.well-known/kete') {
      res.end(
        JSON.stringify({
          product,
          name: 'Witness app',
          version: '1.2.3',
          environment: 'development',
          events: ['account.created', 'payment.succeeded'],
        }),
      );
    } else if (req.url === '/health') {
      if (health === 'hang') return; // never answers
      res.end(JSON.stringify(health));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  await getPool().query(`delete from kete_received_events where product = $1`, [product]);
  if (registered.length) await db.delete(apps).where(inArray(apps.id, registered));
  await new Promise((resolve) => server.close(resolve));
  await getPool().end();
});

const report = (status: 'healthy' | 'degraded' | 'down') => ({
  status,
  version: '1.2.4',
  checked_at: new Date().toISOString(),
  dependencies: [{ name: 'database', status: status === 'healthy' ? 'up' : 'down' }],
  outbox: { pending: 2 },
});

let appId = '';
let firstKey = { kid: '', secret: '' };

describe('registering an app', () => {
  it('reads its manifest and hands out a signing key, stored encrypted', async () => {
    const created = await registerApp('usr_operator', `${baseUrl}/`);
    registered.push(created.appId);
    appId = created.appId;
    firstKey = created.key;
    expect(created.product).toBe(product);
    const [row] = await db.select().from(appKeys).where(eq(appKeys.kid, firstKey.kid));
    expect(row?.secretCiphertext).not.toContain(firstKey.secret);
    expect(open(String(row?.secretCiphertext))).toBe(firstKey.secret);
    expect((await declaredEvents()).get(product)).toEqual(['account.created', 'payment.succeeded']);
  });

  it('refuses a bad address, an app that does not answer, a non-Kete app and a duplicate', async () => {
    for (const bad of ['ftp://x', 'http://example.com', 'https://a.test/?x=1', 'not a url']) {
      expect(() => normalizeBaseUrl(bad)).toThrow(RegistryError);
    }
    await expect(registerApp('usr_operator', 'http://127.0.0.1:9')).rejects.toMatchObject({
      code: 'unreachable',
    });
    await expect(registerApp('usr_operator', `${baseUrl}/nothing`)).rejects.toMatchObject({
      code: 'invalid_manifest',
    });
    await expect(registerApp('usr_operator', baseUrl)).rejects.toMatchObject({
      code: 'already_registered',
    });
  });
});

describe('reading health', () => {
  it('records healthy, degraded, down and unreachable', async () => {
    const app = { id: appId, baseUrl };
    health = report('healthy');
    expect(await probeApp(app)).toMatchObject({
      status: 'healthy',
      version: '1.2.4',
      outboxPending: 2,
    });
    health = report('degraded');
    expect(await probeApp(app)).toMatchObject({ status: 'degraded' });
    health = { unexpected: true };
    expect(await probeApp(app)).toMatchObject({ status: 'degraded' });
    health = 'hang';
    expect(await probeApp(app)).toMatchObject({ status: 'unreachable', latencyMs: null });
    health = report('healthy');
    const detail = await appDetail(appId);
    expect(detail.probes.map((p) => p.status)).toEqual([
      'unreachable',
      'degraded',
      'degraded',
      'healthy',
    ]);
    expect(detail.app.version).toBe('1.2.4');
  });
});

describe('receiving events', () => {
  async function deliver(events: unknown[], key: { kid: string; secret: string }, as = product) {
    const body = JSON.stringify({ events });
    const handler = deliveryHandler({
      keyRing: await loadKeyRing(),
      store: postgresDedupeStore(getPool()),
      declaredTypes: (p) => (awaitedDeclared ?? new Map()).get(p),
    });
    const response = await handler(
      new Request('http://cockpit/api/events', {
        method: 'POST',
        headers: { 'kete-product': as, 'kete-signature': sign(body, key) },
        body,
      }),
    );
    return {
      status: response.status,
      body: (await response.json()) as {
        results: { id: string; outcome: string; reason?: string }[];
      },
    };
  }
  let awaitedDeclared: Map<string, string[]> | undefined;

  const event = (type = 'account.created') =>
    createEvent({
      type,
      product,
      organization: 'org_client_1234',
      data: {},
      declaredTypes: [type],
    });

  it('accepts a signed event once, and shows it', async () => {
    awaitedDeclared = await declaredEvents();
    const one = event();
    const first = await deliver([one], firstKey);
    expect(first.body.results).toEqual([{ id: one.id, outcome: 'accepted' }]);
    const again = await deliver([one], firstKey);
    expect(again.body.results).toEqual([{ id: one.id, outcome: 'duplicate' }]);
    const detail = await appDetail(appId);
    expect(detail.events.map((e) => e.id)).toContain(one.id);
    const summary = (await listApps()).find((a) => a.id === appId);
    expect(summary?.eventsLast24h).toBe(1);
  });

  it('refuses a forged signature, another product, and an undeclared type', async () => {
    const forged = await deliver([event()], {
      kid: firstKey.kid,
      secret: 'not-the-secret-0123456789abcdef0123',
    });
    expect(forged.status).toBe(401);
    const stranger = await deliver([event()], firstKey, 'prd_somebody_else');
    expect(stranger.status).toBe(401);
    const undeclared = await deliver([event('account.closed')], firstKey);
    expect(undeclared.body.results[0]).toMatchObject({
      outcome: 'refused',
      reason: 'undeclared_type',
    });
  });

  it('keeps the previous key during a rotation, and refuses it once retired', async () => {
    const second = await rotateKey(appId);
    expect((await deliver([event()], second)).body.results[0]?.outcome).toBe('accepted');
    expect((await deliver([event()], firstKey)).body.results[0]?.outcome).toBe('accepted');
    await db
      .update(appKeys)
      .set({ notAfter: new Date(Date.now() - 1000) })
      .where(eq(appKeys.kid, firstKey.kid));
    expect((await deliver([event()], firstKey)).status).toBe(401);
    const keys = (await appDetail(appId)).keys;
    expect(keys.find((k) => k.kid === second.kid)?.notAfter).toBeNull();
  });
});
