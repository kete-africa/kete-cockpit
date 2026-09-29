import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// Integration tests run against the kete-cockpit `test` branch, through the application role.
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const appUrl = process.env.COCKPIT_TEST_APP_URL;
if (!appUrl) throw new Error('COCKPIT_TEST_APP_URL is not set (see .env.example).');
process.env.COCKPIT_DATABASE_URL = appUrl;
process.env.COCKPIT_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
