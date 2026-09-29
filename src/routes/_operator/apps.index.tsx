import { type FormEvent, useState } from 'react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { Button, Panel, TextField } from '@kete/design';
import { addApp, fetchApps } from '@/features/registry/functions';
import { formatDateTime, KeyShownOnce, registryError, StatusTag } from '@/features/registry/ui';
import { Notice, useHydrated } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

export const Route = createFileRoute('/_operator/apps/')({
  loader: () => fetchApps(),
  component: Apps,
});

function reenter(status: 'signed_out' | 'refused') {
  window.location.assign(
    status === 'signed_out' ? `/auth/connexion?returnTo=${encodeURIComponent('/apps')}` : '/refus',
  );
}

function Apps() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<keyof typeof registryError | null>(null);
  const [key, setKey] = useState<{ kid: string; secret: string } | null>(null);

  if (result.status !== 'ok') {
    if (typeof window !== 'undefined' && result.status !== 'error') reenter(result.status);
    return <p>{m.common_loading()}</p>;
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);
    setKey(null);
    const outcome = await addApp({ data: { address: String(new FormData(form).get('address')) } });
    setPending(false);
    if (outcome.status === 'signed_out' || outcome.status === 'refused') {
      reenter(outcome.status);
      return;
    }
    if (outcome.status === 'error') {
      setError(outcome.code);
      return;
    }
    if (outcome.status !== 'ok') return;
    setKey(outcome.data.key);
    form.reset();
    await router.invalidate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-headline text-headline font-extrabold">{m.apps_title()}</h1>
        <p className="text-body-lg text-bark">{m.apps_intro()}</p>
      </div>

      {result.data.length === 0 ? (
        <Notice tone="info">{m.apps_none()}</Notice>
      ) : (
        <ul className="grid gap-px border border-rule bg-rule sm:grid-cols-2">
          {result.data.map((app) => (
            <li key={app.id} className="flex flex-col gap-3 bg-paper p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to="/apps/$appId"
                    params={{ appId: app.id }}
                    className="font-title text-title font-bold hover:underline"
                  >
                    {app.name}
                  </Link>
                  <p className="truncate font-number text-body-sm text-bark">
                    {app.product} · {app.environment}
                    {app.version ? ` · ${app.version}` : ''}
                  </p>
                </div>
                <StatusTag status={app.lastProbe?.status ?? null} />
              </div>
              <p className="text-body-sm text-bark">
                {m.apps_events_24h({ count: String(app.eventsLast24h) })} ·{' '}
                {app.lastEventAt
                  ? m.apps_last_event({ date: formatDateTime(app.lastEventAt) })
                  : m.apps_no_event()}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Panel title={m.apps_add()}>
        <form method="post" onSubmit={register} className="flex flex-col gap-4 sm:max-w-lg">
          {error && <Notice tone="error">{registryError[error]()}</Notice>}
          <TextField
            label={m.apps_address()}
            hint={m.apps_address_hint()}
            name="address"
            type="url"
            inputMode="url"
            required
          />
          <div>
            <Button type="submit" disabled={pending || !hydrated}>
              {pending ? m.common_loading() : m.apps_register()}
            </Button>
          </div>
          {key && <KeyShownOnce kid={key.kid} secret={key.secret} />}
        </form>
      </Panel>
    </div>
  );
}
