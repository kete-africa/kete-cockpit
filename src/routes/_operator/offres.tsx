import { type FormEvent, useState } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Button, Panel, Tag, TextField } from '@kete/design';
import { type Catalog, fetchCatalog, saveOffer, withdrawOffer } from '@/features/offers/functions';
import { Notice, SelectField, useHydrated } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

export const Route = createFileRoute('/_operator/offres')({
  loader: () => fetchCatalog(),
  component: Offers,
});

const apps = ['firmo', 'nettio', 'nyatefe', 'cockpit'] as const;
type App = (typeof apps)[number];
const appName: Record<App, () => string> = {
  firmo: m.app_firmo,
  nettio: m.app_nettio,
  nyatefe: m.app_nyatefe,
  cockpit: m.app_cockpit,
};

function price(value: Catalog['offers'][number]['price']) {
  return new Intl.NumberFormat(getLocale(), { style: 'currency', currency: value.currency }).format(
    value.value,
  );
}

/** A provider's display name ("chariow" → "Chariow"). */
function providerName(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Signed out or refused mid-way: the whole page goes through the door again. */
function reenter(status: 'signed_out' | 'refused') {
  window.location.assign(
    status === 'signed_out'
      ? `/auth/connexion?returnTo=${encodeURIComponent('/offres')}`
      : '/refus',
  );
}

function Offers() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const [notice, setNotice] = useState<'saved' | 'removed' | 'error' | null>(null);

  if (result.status !== 'ok') {
    if (typeof window !== 'undefined') reenter(result.status);
    return <p>{m.common_loading()}</p>;
  }
  const catalog = result.data;
  const offered = new Set(catalog.offers.filter((o) => o.active).map((o) => o.productId));
  const available = catalog.products.filter((p) => !offered.has(p.id));

  async function after(outcome: { status: string }, done: 'saved' | 'removed') {
    if (outcome.status === 'signed_out' || outcome.status === 'refused') {
      reenter(outcome.status);
      return;
    }
    setNotice(outcome.status === 'ok' ? done : 'error');
    await router.invalidate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-headline text-headline font-extrabold">{m.offers_title()}</h1>
        <p className="text-body-lg text-bark">
          {m.offers_intro({ provider: providerName(catalog.provider) })}
        </p>
      </div>
      {notice === 'saved' && <Notice tone="success">{m.offers_saved()}</Notice>}
      {notice === 'removed' && <Notice tone="success">{m.offers_removed()}</Notice>}
      {notice === 'error' && <Notice tone="error">{m.error_generic()}</Notice>}

      <Panel title={m.offers_current()}>
        {catalog.offers.length === 0 ? (
          <p className="text-body-sm text-bark">{m.offers_none()}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {catalog.offers.map((offer) => (
              <li key={offer.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{offer.name}</p>
                  <p className="text-body-sm text-bark">
                    {appName[offer.app]()} ·{' '}
                    {m.offers_period({
                      days: String(offer.periodDays),
                      grace: String(offer.graceDays),
                    })}
                  </p>
                </div>
                <p className="font-number">{price(offer.price)}</p>
                <Tag tone={offer.active ? 'validated' : 'neutral'}>
                  {offer.active ? m.offers_active() : m.offers_withdrawn()}
                </Tag>
                {offer.active && (
                  <Button
                    variant="secondary"
                    onClick={async () =>
                      after(
                        await withdrawOffer({ data: { productId: offer.productId } }),
                        'removed',
                      )
                    }
                  >
                    {m.offers_withdraw()}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={m.offers_products()}>
        {available.length === 0 ? (
          <p className="text-body-sm text-bark">{m.offers_products_none()}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {available.map((product) => (
              <li key={product.id} className="py-4">
                <NewOffer product={product} onDone={async (outcome) => after(outcome, 'saved')} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function NewOffer({
  product,
  onDone,
}: {
  product: Catalog['products'][number];
  onDone: (outcome: { status: string }) => Promise<void>;
}) {
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      await onDone(
        await saveOffer({
          data: {
            app: String(form.get('app')) as App,
            productId: product.id,
            periodDays: Number(form.get('days')),
            graceDays: Number(form.get('grace')),
          },
        }),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <p className="min-w-0 flex-1 font-semibold">{product.name}</p>
        <p className="font-number">{price(product.price)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <SelectField label={m.offers_app()} name="app" defaultValue="nettio">
          {apps.map((app) => (
            <option key={app} value={app}>
              {appName[app]()}
            </option>
          ))}
        </SelectField>
        <TextField
          label={m.offers_days()}
          name="days"
          type="number"
          min={1}
          max={366}
          defaultValue={30}
          required
        />
        <TextField
          label={m.offers_grace()}
          name="grace"
          type="number"
          min={0}
          max={30}
          defaultValue={3}
          required
        />
        <Button type="submit" disabled={pending || !hydrated}>
          {pending ? m.common_loading() : m.offers_create()}
        </Button>
      </div>
    </form>
  );
}
