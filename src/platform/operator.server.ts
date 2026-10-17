import { getRequest } from '@tanstack/react-start/server';
import { AccountApiError } from './account';
import { checkOperator, getSignIn } from './signin';

// The signed-in operator's call to the Compte Kete, server-side only (the offers, the fleet): the
// token never leaves the server; signed out or refused is said, never thrown.

export type Result<T> =
  | { status: 'ok'; data: T }
  | { status: 'signed_out' }
  | { status: 'refused' };

/** The operator's token, or why there is none; the token never leaves the server. */
async function operatorToken(): Promise<{ token: string } | { status: 'signed_out' | 'refused' }> {
  const request = getRequest();
  const signIn = getSignIn();
  const check = checkOperator(await signIn.session(request));
  if (check.status === 'signed_out') return { status: 'signed_out' };
  if (check.status === 'refused') return { status: 'refused' };
  const token = await signIn.accessToken(request);
  return token ? { token } : { status: 'signed_out' };
}

/** Calls the Compte Kete as the signed-in operator; signed out or refused said, never thrown. */
export async function asOperator<T>(call: (token: string) => Promise<T>): Promise<Result<T>> {
  const operator = await operatorToken();
  if (!('token' in operator)) return operator;
  try {
    return { status: 'ok', data: await call(operator.token) };
  } catch (error) {
    // The Compte Kete checks again: an expired token signs in again, a revoked operator is refused.
    if (error instanceof AccountApiError && error.status === 401) return { status: 'signed_out' };
    if (error instanceof AccountApiError && error.status === 403) return { status: 'refused' };
    throw error;
  }
}
