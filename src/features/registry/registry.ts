import { randomBytes } from 'node:crypto';
import {
  InvalidManifestError,
  parseManifest,
  validateHealthReport,
  type HealthReport,
  type KeyRing,
  type SigningKey,
} from '@kete/sdk';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db, getPool } from '@/platform/db';
import { apps, appKeys, probes, type ProbeStatus } from '@/platform/schema';
import { open, seal } from '@/platform/secrets';

const KEY_OVERLAP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export class RegistryError extends Error {
  constructor(
    readonly code:
      'invalid_address' | 'unreachable' | 'invalid_manifest' | 'already_registered' | 'not_found',
  ) {
    super(code);
    this.name = 'RegistryError';
  }
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

/** https only; plain http on this machine for development and tests. */
export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new RegistryError('invalid_address');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new RegistryError('invalid_address');
  }
  if (url.username || url.password || url.search || url.hash)
    throw new RegistryError('invalid_address');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

async function fetchJson(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; body: unknown; ms: number }> {
  const started = performance.now();
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, ms: Math.round(performance.now() - started) };
}

function newKey(appId: string) {
  const kid = newId('key');
  const secret = randomBytes(32).toString('base64url');
  return { row: { kid, appId, secretCiphertext: seal(secret) }, shown: { kid, secret } };
}

/**
 * Registers an app from its address: its manifest (`/.well-known/kete`) says who it is and which
 * events it sends. Returns its first signing key — the secret is shown this once, never again.
 */
export async function registerApp(operatorId: string, address: string) {
  const baseUrl = normalizeBaseUrl(address);
  let manifest;
  try {
    const answer = await fetchJson(`${baseUrl}/.well-known/kete`, 10_000);
    if (answer.status !== 200) throw new RegistryError('invalid_manifest');
    manifest = parseManifest(answer.body);
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    if (error instanceof InvalidManifestError) throw new RegistryError('invalid_manifest');
    throw new RegistryError('unreachable');
  }
  const [existing] = await db
    .select({ id: apps.id })
    .from(apps)
    .where(or(eq(apps.product, manifest.product), eq(apps.baseUrl, baseUrl)));
  if (existing) throw new RegistryError('already_registered');

  const id = newId('app');
  const key = newKey(id);
  await db.transaction(async (tx) => {
    await tx.insert(apps).values({
      id,
      product: manifest.product,
      name: manifest.name,
      environment: manifest.environment,
      baseUrl,
      version: manifest.version,
      events: manifest.events,
      createdBy: operatorId,
    });
    await tx.insert(appKeys).values(key.row);
  });
  return { appId: id, product: manifest.product, key: key.shown };
}

/** A new signing key; the previous ones keep working for a week, so the app can switch calmly. */
export async function rotateKey(appId: string) {
  const [app] = await db.select({ id: apps.id }).from(apps).where(eq(apps.id, appId));
  if (!app) throw new RegistryError('not_found');
  const key = newKey(appId);
  await db.transaction(async (tx) => {
    await tx
      .update(appKeys)
      .set({ notAfter: new Date(Date.now() + KEY_OVERLAP_DAYS * DAY_MS) })
      .where(and(eq(appKeys.appId, appId), isNull(appKeys.notAfter)));
    await tx.insert(appKeys).values(key.row);
  });
  return key.shown;
}

/** The keys deliveries may be signed with, per product (expired ones left out). */
export async function loadKeyRing(): Promise<KeyRing> {
  const rows = await db
    .select({
      product: apps.product,
      kid: appKeys.kid,
      sealed: appKeys.secretCiphertext,
      notAfter: appKeys.notAfter,
    })
    .from(appKeys)
    .innerJoin(apps, eq(apps.id, appKeys.appId))
    .where(or(isNull(appKeys.notAfter), gt(appKeys.notAfter, new Date())));
  const ring = new Map<string, SigningKey[]>();
  for (const row of rows) {
    const keys = ring.get(row.product) ?? [];
    keys.push({
      kid: row.kid,
      secret: open(row.sealed),
      ...(row.notAfter ? { notAfter: row.notAfter } : {}),
    });
    ring.set(row.product, keys);
  }
  return ring;
}

/** Event types each product declared in its manifest. */
export async function declaredEvents(): Promise<Map<string, string[]>> {
  const rows = await db.select({ product: apps.product, events: apps.events }).from(apps);
  return new Map(rows.map((row) => [row.product, row.events]));
}

/** Reads an app's health and records it; an app that does not answer is `unreachable`. */
export async function probeApp(app: { id: string; baseUrl: string }) {
  let status: ProbeStatus = 'unreachable';
  let latencyMs: number | null = null;
  let report: HealthReport | null = null;
  try {
    const answer = await fetchJson(`${app.baseUrl}/health`, 5_000);
    latencyMs = answer.ms;
    if (validateHealthReport(answer.body).ok) {
      report = answer.body as HealthReport;
      status = report.status;
    } else {
      status = answer.status < 500 ? 'degraded' : 'down';
    }
  } catch {
    status = 'unreachable';
  }
  const [probe] = await db
    .insert(probes)
    .values({
      appId: app.id,
      status,
      latencyMs,
      version: report?.version ?? null,
      outboxPending: report?.outbox.pending ?? null,
      dependencies: (report?.dependencies ?? []).map((d) => ({
        name: d.name,
        status: d.status,
        ...(d.latency_ms === undefined ? {} : { latency_ms: d.latency_ms }),
      })),
    })
    .returning();
  if (report?.version)
    await db.update(apps).set({ version: report.version }).where(eq(apps.id, app.id));
  return probe;
}

export async function probeAll(): Promise<number> {
  const rows = await db.select({ id: apps.id, baseUrl: apps.baseUrl }).from(apps);
  await Promise.all(rows.map((app) => probeApp(app)));
  return rows.length;
}

/**
 * Probes on a schedule, in one Cockpit instance at a time (a Postgres advisory lock), so the
 * Cockpit can run several copies without probing twice.
 */
export async function probeAllOnce(): Promise<boolean> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      `select pg_try_advisory_lock(hashtext('kete_cockpit_probes')) as locked`,
    );
    if (!rows[0]?.locked) return false;
    try {
      await probeAll();
      return true;
    } finally {
      await client.query(`select pg_advisory_unlock(hashtext('kete_cockpit_probes'))`);
    }
  } finally {
    client.release();
  }
}

export interface AppSummary {
  id: string;
  product: string;
  name: string;
  environment: string;
  baseUrl: string;
  version: string | null;
  lastProbe: { status: ProbeStatus; checkedAt: string; latencyMs: number | null } | null;
  lastEventAt: string | null;
  eventsLast24h: number;
}

/** Every app, with its latest health and its recent events. */
export async function listApps(): Promise<AppSummary[]> {
  const rows = await db.select().from(apps).orderBy(apps.name);
  return Promise.all(
    rows.map(async (app) => {
      const [probe] = await db
        .select()
        .from(probes)
        .where(eq(probes.appId, app.id))
        .orderBy(desc(probes.checkedAt))
        .limit(1);
      const { rows: stats } = await db.execute<{ last: Date | null; recent: string }>(
        sql`select max(received_at) as last,
                   count(*) filter (where received_at > now() - interval '24 hours') as recent
              from kete_received_events where product = ${app.product}`,
      );
      const last = stats[0]?.last ? new Date(stats[0].last).toISOString() : null;
      return {
        id: app.id,
        product: app.product,
        name: app.name,
        environment: app.environment,
        baseUrl: app.baseUrl,
        version: app.version,
        lastProbe: probe
          ? {
              status: probe.status,
              checkedAt: probe.checkedAt.toISOString(),
              latencyMs: probe.latencyMs,
            }
          : null,
        lastEventAt: last,
        eventsLast24h: Number(stats[0]?.recent ?? 0),
      };
    }),
  );
}

/** One app: its recent health readings, its latest events, its keys (never their secrets). */
export async function appDetail(appId: string) {
  const [app] = await db.select().from(apps).where(eq(apps.id, appId));
  if (!app) throw new RegistryError('not_found');
  const history = await db
    .select()
    .from(probes)
    .where(eq(probes.appId, appId))
    .orderBy(desc(probes.checkedAt))
    .limit(20);
  const { rows: events } = await db.execute<{
    event_id: string;
    type: string;
    organization: string;
    occurred_at: string;
    received_at: Date;
  }>(
    sql`select event_id, envelope->>'type' as type, envelope->>'organization' as organization,
               envelope->>'occurred_at' as occurred_at, received_at
          from kete_received_events where product = ${app.product}
         order by received_at desc limit 50`,
  );
  const keys = await db
    .select({ kid: appKeys.kid, createdAt: appKeys.createdAt, notAfter: appKeys.notAfter })
    .from(appKeys)
    .where(eq(appKeys.appId, appId))
    .orderBy(desc(appKeys.createdAt));
  return {
    app: {
      id: app.id,
      product: app.product,
      name: app.name,
      environment: app.environment,
      baseUrl: app.baseUrl,
      version: app.version,
      events: app.events,
    },
    probes: history.map((p) => ({
      status: p.status,
      checkedAt: p.checkedAt.toISOString(),
      latencyMs: p.latencyMs,
      version: p.version,
      outboxPending: p.outboxPending,
      dependencies: p.dependencies,
    })),
    events: events.map((e) => ({
      id: e.event_id,
      type: e.type,
      organization: e.organization,
      occurredAt: e.occurred_at,
      receivedAt: new Date(e.received_at).toISOString(),
    })),
    keys: keys.map((k) => ({
      kid: k.kid,
      createdAt: k.createdAt.toISOString(),
      notAfter: k.notAfter?.toISOString() ?? null,
    })),
  };
}
