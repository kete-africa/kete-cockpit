import { createKeteSignIn, type KeteIdentity, type KeteSignIn } from '@kete/auth';
import { env } from './env';

let signIn: KeteSignIn | undefined;

/** Operators sign in with their Compte Kete; the token stays server-side for the admin API. */
export function getSignIn(): KeteSignIn {
  signIn ??= createKeteSignIn({
    accountUrl: env.accountUrl,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    redirectUri: `${env.publicUrl}/auth/callback`,
    sessionSecret: env.sessionSecret,
    cookieName: 'kete_cockpit',
    keepAccessToken: true,
  });
  return signIn;
}

export type OperatorCheck =
  | { status: 'signed_out' }
  | { status: 'refused'; reason: 'not_an_operator' | 'no_two_factor'; identity: KeteIdentity }
  | { status: 'operator'; identity: KeteIdentity };

/**
 * Kete's organization, owner or admin, second factor on (spec 008). The Compte Kete checks again,
 * in its database, on every admin call.
 */
export function checkOperator(identity: KeteIdentity | null): OperatorCheck {
  if (!identity) return { status: 'signed_out' };
  const member =
    identity.organizationId === env.operatorsOrganizationId &&
    (identity.role === 'owner' || identity.role === 'admin');
  if (!member) return { status: 'refused', reason: 'not_an_operator', identity };
  if (!identity.twoFactor) return { status: 'refused', reason: 'no_two_factor', identity };
  return { status: 'operator', identity };
}
