import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { accountApi } from '@/platform/account';
import { asOperator } from '@/platform/operator.server';

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
