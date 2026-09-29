import { useState } from 'react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { Button, Panel, Tag } from '@kete/design';
import { fetchApp, newKey, probeNow } from '@/features/registry/functions';
import { formatDateTime, KeyShownOnce, registryError, StatusTag } from '@/features/registry/ui';
import { Notice, useHydrated } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

export const Route = createFileRoute('/_operator/apps/$appId')({
  loader: ({ params }) => fetchApp({ data: { appId: params.appId } }),
  component: AppDetail,
});

function AppDetail() {
  const result = Route.useLoaderData();
  const { appId } = Route.useParams();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [key, setKey] = useState<{ kid: string; secret: string } | null>(null);

  if (result.status === 'error')
    return <Notice tone="error">{registryError[result.code]()}</Notice>;
  if (result.status !== 'ok') {
    if (typeof window !== 'undefined') {
      window.location.assign(
        result.status === 'signed_out'
          ? `/auth/connexion?returnTo=${encodeURIComponent(`/apps/${appId}`)}`
          : '/refus',
      );
    }
    return <p>{m.common_loading()}</p>;
  }
  const { app, probes, events, keys } = result.data;

  async function check() {
    setPending(true);
    await probeNow({ data: { appId } });
    setPending(false);
    await router.invalidate();
  }

  async function rotate() {
    setPending(true);
    const outcome = await newKey({ data: { appId } });
    setPending(false);
    if (outcome.status === 'ok') setKey(outcome.data);
    await router.invalidate();
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/apps" className="text-body-sm font-semibold text-bark hover:text-ink">
        {m.app_back()}
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-headline text-headline font-extrabold">{app.name}</h1>
          <p className="break-all font-number text-body-sm text-bark">
            {app.product} · {app.environment} · {app.baseUrl}
            {app.version ? ` · ${app.version}` : ''}
          </p>
        </div>
        <StatusTag status={probes[0]?.status ?? null} />
      </div>
      <p className="text-body-sm text-bark">
        {m.app_declared_events({ types: app.events.join(', ') || '—' })}
      </p>

      <Panel title={m.app_health()}>
        <div className="mb-4">
          <Button variant="secondary" onClick={() => void check()} disabled={pending || !hydrated}>
            {m.app_probe_now()}
          </Button>
        </div>
        {probes.length === 0 ? (
          <p className="text-body-sm text-bark">{m.app_probes_none()}</p>
        ) : (
          <ul className="divide-y divide-rule" data-testid="probes">
            {probes.map((probe) => (
              <li key={probe.checkedAt} className="flex flex-wrap items-center gap-3 py-2">
                <StatusTag status={probe.status} />
                <span className="text-body-sm">{formatDateTime(probe.checkedAt)}</span>
                {probe.latencyMs !== null && (
                  <span className="font-number text-body-sm text-bark">
                    {m.app_latency({ ms: String(probe.latencyMs) })}
                  </span>
                )}
                {probe.outboxPending !== null && probe.outboxPending > 0 && (
                  <span className="text-body-sm text-bark">
                    {m.app_outbox({ count: String(probe.outboxPending) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={m.app_events()}>
        {events.length === 0 ? (
          <p className="text-body-sm text-bark">{m.app_events_none()}</p>
        ) : (
          <ul className="divide-y divide-rule" data-testid="events">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-number text-body-sm font-semibold">{event.type}</span>
                <span className="font-number text-body-sm text-bark">{event.organization}</span>
                <span className="ml-auto text-body-sm text-bark">
                  {formatDateTime(event.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={m.app_keys()}>
        <ul className="mb-4 divide-y divide-rule">
          {keys.map((k) => (
            <li key={k.kid} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-number text-body-sm">{k.kid}</span>
              {k.notAfter ? (
                <Tag tone="verify">{m.app_key_until({ date: formatDateTime(k.notAfter) })}</Tag>
              ) : (
                <Tag tone="validated">{m.app_key_active()}</Tag>
              )}
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={() => void rotate()} disabled={pending || !hydrated}>
          {m.app_rotate()}
        </Button>
        {key && (
          <div className="mt-4">
            <KeyShownOnce kid={key.kid} secret={key.secret} />
          </div>
        )}
      </Panel>
    </div>
  );
}
