import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { AccountApiError, accountApi } from '@/platform/account';
import { checkOperator, getSignIn } from '@/platform/signin';

export interface Money {
  value: number;
  currency: string;
}

export interface Catalog {
  provider: string;
  products: { id: string; name: string; price: Money }[];
  offers: {
    id: string;
    app: 'firmo' | 'nettio' | 'nyatefe' | 'cockpit';
    name: string;
    periodDays: number;
    graceDays: number;
    productId: string;
    price: Money;
    active: boolean;
  }[];
}

type Result<T> = { status: 'ok'; data: T } | { status: 'signed_out' } | { status: 'refused' };

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

async function asOperator<T>(call: (token: string) => Promise<T>): Promise<Result<T>> {
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

export const fetchCatalog = createServerFn({ method: 'GET' }).handler(() =>
  asOperator((token) => accountApi<Catalog>(token, '/api/admin/offers')),
);

export const saveOffer = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        app: z.enum(['firmo', 'nettio', 'nyatefe', 'cockpit']),
        productId: z.string().min(1).max(128),
        periodDays: z.number().int().min(1).max(366),
        graceDays: z.number().int().min(0).max(30),
      })
      .parse(input),
  )
  .handler(({ data }) =>
    asOperator((token) =>
      accountApi<{ id: string | null }>(token, '/api/admin/offers', { action: 'set', ...data }),
    ),
  );

export const withdrawOffer = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ productId: z.string().min(1).max(128) }).parse(input))
  .handler(({ data }) =>
    asOperator((token) =>
      accountApi<{ disabled: number }>(token, '/api/admin/offers', {
        action: 'disable',
        productId: data.productId,
      }),
    ),
  );
