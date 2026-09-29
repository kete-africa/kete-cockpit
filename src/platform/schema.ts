import { bigserial, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Kete Cockpit's own operating data (decision 0004): which apps exist, how they are doing, what
// they announced. No client data — events carry facts and counters only (event contract) — and
// nothing is reachable except through operator-checked code or the signed event endpoint.

export type Environment = 'production' | 'staging' | 'preview' | 'development';
export type ProbeStatus = 'healthy' | 'degraded' | 'down' | 'unreachable';

/** A Kete app this Cockpit watches: one product, at one address. */
export const apps = pgTable('apps', {
  id: text('id').primaryKey(),
  /** From the app's manifest, e.g. `prd_kete_account`; what its event deliveries carry. */
  product: text('product').notNull().unique(),
  name: text('name').notNull(),
  environment: text('environment').$type<Environment>().notNull(),
  baseUrl: text('base_url').notNull().unique(),
  version: text('version'),
  /** Event types the manifest declares; others are refused. */
  events: jsonb('events').$type<string[]>().notNull().default([]),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The keys an app signs its event deliveries with. The secret is stored encrypted
 * (COCKPIT_ENCRYPTION_KEY) and shown once, when created. A replaced key stays valid a few days.
 */
export const appKeys = pgTable(
  'app_keys',
  {
    kid: text('kid').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    secretCiphertext: text('secret_ciphertext').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** After this, deliveries signed with the key are refused. */
    notAfter: timestamp('not_after', { withTimezone: true }),
  },
  (table) => [index('app_keys_app_idx').on(table.appId)],
);

/** One reading of an app's health (`/health`). */
export const probes = pgTable(
  'probes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').$type<ProbeStatus>().notNull(),
    latencyMs: integer('latency_ms'),
    version: text('version'),
    outboxPending: integer('outbox_pending'),
    /** Dependencies as the app reported them (names and states only). */
    dependencies: jsonb('dependencies')
      .$type<{ name: string; status: string; latency_ms?: number }[]>()
      .notNull()
      .default([]),
  },
  (table) => [index('probes_app_checked_idx').on(table.appId, table.checkedAt)],
);
