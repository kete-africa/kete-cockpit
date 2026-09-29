import { env } from './env';

export class AccountApiError extends Error {
  constructor(readonly status: number) {
    super(`account api: ${status}`);
    this.name = 'AccountApiError';
  }
}

/** Calls the Compte Kete admin API with the operator's token. */
export async function accountApi<T>(accessToken: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${env.accountUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new AccountApiError(response.status);
  return (await response.json()) as T;
}
