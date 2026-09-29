import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { checkOperator, getSignIn } from '@/platform/signin';

/** Who is at the Cockpit: signed out, refused (and why), or an operator. */
export const fetchOperator = createServerFn({ method: 'GET' }).handler(async () => {
  const check = checkOperator(await getSignIn().session(getRequest()));
  if (check.status === 'signed_out') return { status: 'signed_out' as const };
  const person = { name: check.identity.name, email: check.identity.email };
  if (check.status === 'refused')
    return { status: 'refused' as const, reason: check.reason, person };
  return { status: 'operator' as const, person };
});

/** Where the operator's Compte Kete is (e.g. to turn on two-factor). */
export const fetchAccountUrl = createServerFn({ method: 'GET' }).handler(() => ({
  accountUrl: process.env.KETE_ACCOUNT_URL ?? '',
}));
