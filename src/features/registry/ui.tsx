import { Tag } from '@kete/design';
import * as m from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

export type Status = 'healthy' | 'degraded' | 'down' | 'unreachable';

const tone = {
  healthy: 'validated',
  degraded: 'verify',
  down: 'error',
  unreachable: 'error',
} as const;
const label = {
  healthy: m.status_healthy,
  degraded: m.status_degraded,
  down: m.status_down,
  unreachable: m.status_unreachable,
};

/** An app's health: a word and a square marker, never color alone. */
export function StatusTag({ status }: { status: Status | null }) {
  if (!status) return <Tag tone="neutral">{m.status_unknown()}</Tag>;
  return <Tag tone={tone[status]}>{label[status]()}</Tag>;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export const registryError = {
  invalid_address: m.apps_error_invalid_address,
  unreachable: m.apps_error_unreachable,
  invalid_manifest: m.apps_error_invalid_manifest,
  already_registered: m.apps_error_already_registered,
  not_found: m.apps_error_not_found,
};

/** Shown once: the key an app signs its event deliveries with. */
export function KeyShownOnce({ kid, secret }: { kid: string; secret: string }) {
  return (
    <div className="flex flex-col gap-2 border-2 border-verify bg-verify-surface p-4">
      <p className="font-semibold text-verify-ink">{m.apps_key_title()}</p>
      <p className="text-body-sm text-verify-ink">{m.apps_key_once()}</p>
      <p className="break-all font-number text-body-sm">{m.apps_key_kid({ kid })}</p>
      <p className="break-all font-number text-body-sm" data-testid="key-secret">
        {m.apps_key_secret({ secret })}
      </p>
    </div>
  );
}
