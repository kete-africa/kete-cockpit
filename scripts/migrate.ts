/** Applies pending migrations with the owner role (COCKPIT_OWNER_URL). */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const url = process.env.COCKPIT_OWNER_URL;
if (!url) throw new Error('COCKPIT_OWNER_URL is not set.');
const pool = new pg.Pool({ connectionString: url, max: 1 });
await migrate(drizzle({ client: pool }), {
  migrationsFolder: new URL('../db/migrations', import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    '$1',
  ),
});
await pool.end();
console.log('Migrations applied.');
