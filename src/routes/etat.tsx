import { createFileRoute } from '@tanstack/react-router';
import { KeteBand } from '@kete/design';
import { fetchStatus } from '@/features/status/functions';
import type { ServiceStatus } from '@/features/status/status';
import { formatDateTime, StatusTag } from '@/features/registry/ui';
import { LanguageSwitch, Wordmark } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

// « État des services » (phase 11, step E3): public, for every customer — each Kete service, how it
// answers now, how often it answered over a day and a week, from the Cockpit's readings.
export const Route = createFileRoute('/etat')({
  loader: () => fetchStatus(),
  component: StatusPage,
});

const percent = (share: number | null) =>
  share === null
    ? '—'
    : new Intl.NumberFormat(getLocale(), {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(share);

const environmentName: Record<string, () => string> = {
  production: m.status_page_production,
  staging: m.status_page_staging,
  preview: m.status_page_preview,
  development: m.status_page_development,
};

/** One day's share as a bar: its height and its word, never color alone. */
function Day({ share, label }: { share: number | null; label: string }) {
  const tone =
    share === null
      ? 'bg-line'
      : share >= 0.99
        ? 'bg-state-success'
        : share >= 0.9
          ? 'bg-state-verify'
          : 'bg-state-error';
  return (
    <span
      title={`${label} · ${percent(share)}`}
      aria-label={`${label} · ${percent(share)}`}
      className={`inline-block h-6 w-2.5 rounded-sm ${tone}`}
    />
  );
}

function Service({ service }: { service: ServiceStatus }) {
  const today = new Date();
  const dayLabel = (index: number) =>
    new Intl.DateTimeFormat(getLocale(), {
      weekday: 'short',
      day: 'numeric',
    }).format(new Date(today.getTime() - (6 - index) * 86_400_000));
  return (
    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="font-semibold">{service.name}</span>
        <span className="text-body-sm text-bark">
          {m.status_page_shares({
            day: percent(service.day),
            week: percent(service.week),
          })}
          {service.checkedAt
            ? ` · ${m.status_page_checked({ at: formatDateTime(service.checkedAt) })}`
            : ''}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-end gap-1" role="img" aria-label={m.status_page_week()}>
          {service.days.map((share, index) => (
            <Day key={index} share={share} label={dayLabel(index)} />
          ))}
        </span>
        <StatusTag status={service.now} />
      </div>
    </li>
  );
}

function StatusPage() {
  const { services } = Route.useLoaderData();
  const environments = [...new Set(services.map((service) => service.environment))];
  const allUp = services.length > 0 && services.every((service) => service.now === 'healthy');
  return (
    <div className="flex min-h-dvh flex-col">
      <KeteBand />
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Wordmark />
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pb-12 pt-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-headline text-headline font-extrabold">{m.status_page_title()}</h1>
          <p className="text-body-lg text-bark">
            {services.length === 0
              ? m.status_page_none()
              : allUp
                ? m.status_page_all_up()
                : m.status_page_some_down()}
          </p>
        </div>
        {environments.map((environment) => (
          <section key={environment} className="flex flex-col gap-1">
            <h2 className="text-title font-bold">
              {environmentName[environment]?.() ?? environment}
            </h2>
            <ul className="divide-y divide-line">
              {services
                .filter((service) => service.environment === environment)
                .map((service) => (
                  <Service key={service.name} service={service} />
                ))}
            </ul>
          </section>
        ))}
        <p className="text-body-sm text-bark">{m.status_page_how()}</p>
      </main>
    </div>
  );
}
