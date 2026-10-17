import { type FormEvent, useState } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Button, Panel, Tag, TextField } from '@kete/design';
import {
  type FleetDeployment,
  fetchFleet,
  makeDeploymentReady,
  type Mode,
} from '@/features/fleet/functions';
import { Notice } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

// « Flotte » (kete-core specs 123 and 125; phase 11, step B2): every organization's Kete
// Enterprise as the Compte Kete keeps it — what waits for Kete first — and the operator's word
// that one is made, at its address; its organization then finds it ready in « Mon Kete ».
export const Route = createFileRoute('/_operator/flotte')({
  loader: () => fetchFleet(),
  component: Fleet,
});

const modeName: Record<Mode, () => string> = {
  shared: m.fleet_mode_shared,
  dedicated: m.fleet_mode_dedicated,
  on_premises: m.fleet_mode_on_premises,
  autonomous: m.fleet_mode_autonomous,
};
const appName: Record<string, () => string> = {
  prd_kete_finance: m.fleet_app_finance,
  prd_kete_team: m.fleet_app_team,
  prd_kete_commitments: m.fleet_app_commitments,
  prd_kete_helpdesk: m.fleet_app_helpdesk,
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' }).format(new Date(iso));
}

/** Signed out or refused mid-way: the whole page goes through the door again. */
function reenter(status: 'signed_out' | 'refused') {
  window.location.assign(
    status === 'signed_out'
      ? `/auth/connexion?returnTo=${encodeURIComponent('/flotte')}`
      : '/refus',
  );
}

const waiting = (d: FleetDeployment) => d.status === 'requested' || d.requestedMode !== null;

function Fleet() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const [notice, setNotice] = useState<'made' | 'conflict' | 'error' | null>(null);

  if (result.status !== 'ok') {
    if (typeof window !== 'undefined') reenter(result.status);
    return <p>{m.common_loading()}</p>;
  }
  const { deployments } = result.data;
  const toMake = deployments.filter(waiting);
  const running = deployments.filter((d) => !waiting(d));

  async function after(outcome: { status: string }) {
    if (outcome.status === 'signed_out' || outcome.status === 'refused') {
      reenter(outcome.status);
      return;
    }
    setNotice(outcome.status === 'ok' ? 'made' : outcome.status === 'conflict' ? 'conflict' : 'error');
    await router.invalidate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-headline text-headline font-extrabold">{m.fleet_title()}</h1>
        <p className="text-body-lg text-bark">{m.fleet_intro()}</p>
      </div>
      {notice === 'made' && <Notice tone="success">{m.fleet_made()}</Notice>}
      {notice === 'conflict' && <Notice tone="info">{m.fleet_conflict()}</Notice>}
      {notice === 'error' && <Notice tone="error">{m.error_generic()}</Notice>}

      <Panel title={m.fleet_to_make({ count: String(toMake.length) })}>
        {toMake.length === 0 ? (
          <p className="text-body-sm text-bark">{m.fleet_nothing_to_make()}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {toMake.map((deployment) => (
              <li key={deployment.id} className="flex flex-col gap-3 py-4">
                <Summary deployment={deployment} />
                <MakeReady deployment={deployment} onDone={after} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={m.fleet_running({ count: String(running.length) })}>
        {running.length === 0 ? (
          <p className="text-body-sm text-bark">{m.fleet_none_running()}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {running.map((deployment) => (
              <li key={deployment.id} className="py-3">
                <Summary deployment={deployment} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Summary({ deployment }: { deployment: FleetDeployment }) {
  const wanted = deployment.requestedMode;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{deployment.organizationName}</p>
        <p className="text-body-sm text-bark">
          {modeName[deployment.mode]()} · {deployment.region}
          {deployment.apps.length > 0 &&
            ` · ${deployment.apps.map((app) => appName[app]?.() ?? app).join(', ')}`}
          {' · '}
          {m.fleet_since({ date: formatDate(deployment.createdAt) })}
        </p>
        {deployment.url && (
          <a href={deployment.url} className="text-body-sm text-primary underline">
            {deployment.url}
          </a>
        )}
      </div>
      {deployment.status === 'requested' ? (
        <Tag tone="verify">{m.fleet_requested()}</Tag>
      ) : wanted ? (
        <Tag tone="verify">{m.fleet_move_to({ mode: modeName[wanted]() })}</Tag>
      ) : (
        <Tag tone="validated">{m.fleet_ready()}</Tag>
      )}
    </div>
  );
}

function MakeReady({
  deployment,
  onDone,
}: {
  deployment: FleetDeployment;
  onDone: (outcome: { status: string }) => Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^https:\/\/[^\s/$.?#].[^\s]*$/.test(url);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    await onDone(await makeDeploymentReady({ data: { deploymentId: deployment.id, url } }));
    setBusy(false);
  }

  return (
    <form method="post" onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <TextField
        label={m.fleet_address()}
        hint={m.fleet_address_hint()}
        type="url"
        inputMode="url"
        placeholder="https://"
        value={url}
        onChange={(event) => setUrl(event.currentTarget.value.trim())}
        className="min-w-64 flex-1"
      />
      <Button type="submit" disabled={!valid || busy}>
        {m.fleet_make()}
      </Button>
    </form>
  );
}
