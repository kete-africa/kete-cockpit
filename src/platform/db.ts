import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env';
import * as schema from './schema';

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: env.databaseUrl, max: 5 });
  return pool;
}

export const db = drizzle({ client: getPool(), schema });
