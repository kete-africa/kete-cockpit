import { readFileSync, writeFileSync } from 'node:fs';
import { neon } from '@kete/infrastructure';
import pg from 'pg';

// The Cockpit's test database, made through Kete's provisioning port (kete-core spec 121) on the
// kete-core project's `test` branch — where kete-core's CI compute already runs — once the
// kete-cockpit project had spent its free compute hours. The application role is granted what the
// owner creates; its two addresses go to the file given, never to the screen:
// `pnpm tsx scripts/test-database.ts <secrets file> <kete-core .env> <out>`.

const envOf = (path: string): Record<string, string> =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1] ?? '', (m[2] ?? '').replace(/^"|"$/g, '')]),
  );

const [secretsPath, corePath, out] = process.argv.slice(2);
if (!secretsPath || !corePath || !out) {
  throw new Error('A secrets file, kete-core’s .env and an output file are needed.');
}
const secrets = envOf(secretsPath);
const core = envOf(corePath);
if (!secrets.NEON_API_KEY || !core.NEON_PROJECT_ID) {
  throw new Error('NEON_API_KEY and NEON_PROJECT_ID are needed.');
}

const { ownerUrl, appUrl } = await neon({
  apiKey: secrets.NEON_API_KEY,
  projectId: core.NEON_PROJECT_ID,
  branch: 'test',
}).create('cockpit');

const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();
try {
  await owner.query(`alter default privileges for role cockpit_owner in schema public
    grant select, insert, update, delete on tables to cockpit_app`);
  await owner.query(`alter default privileges for role cockpit_owner in schema public
    grant usage, select on sequences to cockpit_app`);
} finally {
  await owner.end();
}

writeFileSync(out, `COCKPIT_TEST_OWNER_URL=${ownerUrl}\nCOCKPIT_TEST_APP_URL=${appUrl}\n`, {
  mode: 0o600,
});
console.log(`database « cockpit » ready on the test branch; its addresses are in ${out}`);
