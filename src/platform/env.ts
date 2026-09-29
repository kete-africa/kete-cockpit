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
  /** Kete's organization in the Compte Kete: its owners and admins with two-factor operate. */
  get operatorsOrganizationId() {
    return required('KETE_OPERATORS_ORGANIZATION_ID');
  },
};
