function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see apps/cockpit/.env.example).`);
  return value;
}

/** Read lazily so importing a module never fails at build time. */
export const env = {
  /** The Compte Kete's public origin: where operators sign in, and the admin API. */
  get accountUrl() {
    return required('KETE_ACCOUNT_URL').replace(/\/$/, '');
  },
  /** The Cockpit's public origin. */
  get publicUrl() {
    return required('COCKPIT_URL').replace(/\/$/, '');
  },
  /** The Cockpit's registration at the Compte Kete (scripts/clients.ts there). */
  get clientId() {
    return required('COCKPIT_CLIENT_ID');
  },
  get clientSecret() {
    return required('COCKPIT_CLIENT_SECRET');
  },
  /** Signs the Cockpit's own cookies; at least 32 characters. */
  get sessionSecret() {
    return required('COCKPIT_SESSION_SECRET');
  },
  /** The Cockpit's database, application role (no BYPASSRLS). */
  get databaseUrl() {
    return required('COCKPIT_DATABASE_URL');
  },
  /** 32 bytes, base64: encrypts the apps' event-signing secrets at rest. */
  get encryptionKey() {
    const key = Buffer.from(required('COCKPIT_ENCRYPTION_KEY'), 'base64');
    if (key.length !== 32) throw new Error('COCKPIT_ENCRYPTION_KEY must be 32 bytes, base64.');
    return key;
  },
  /** Kete's organization in the Compte Kete: its owners and admins with two-factor operate. */
  get operatorsOrganizationId() {
    return required('KETE_OPERATORS_ORGANIZATION_ID');
  },
};
