import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env';
import * as schema from './schema';

let pool: pg.Pool | undefined;
let instance: NodePgDatabase<typeof schema> | undefined;

export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: env.databaseUrl, max: 5 });
  return pool;
}

/**
 * The database, created on first use: the Cockpit starts and answers `/health` even before its
 * database is configured.
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, property) {
    instance ??= drizzle({ client: getPool(), schema });
    const value: unknown = Reflect.get(instance, property);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value;
  },
});
