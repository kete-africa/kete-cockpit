import { createFileRoute } from '@tanstack/react-router';
import { KeteBand } from '@kete/design';
import { fetchAccountUrl } from '@/features/session/functions';
import { LanguageSwitch, Notice, Wordmark } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

export const Route = createFileRoute('/refus')({
  validateSearch: (search: Record<string, unknown>) => ({
    raison: typeof search.raison === 'string' ? search.raison : 'not_an_operator',
  }),
  loader: () => fetchAccountUrl(),
  component: Refused,
});

function Refused() {
  const { raison } = Route.useSearch();
  const { accountUrl } = Route.useLoaderData();
  return (
    <div className="flex min-h-dvh flex-col">
      <KeteBand />
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Wordmark />
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-12 pt-6">
        <h1 className="font-headline text-headline font-extrabold">{m.refused_title()}</h1>
        <Notice tone={raison === 'sign_in' ? 'error' : 'info'}>
          {raison === 'no_two_factor'
            ? m.refused_no_two_factor()
            : raison === 'sign_in'
              ? m.refused_sign_in()
              : m.refused_not_operator()}
        </Notice>
        {raison === 'no_two_factor' && accountUrl && (
          <a
            href={`${accountUrl}/espace/securite`}
            className="font-semibold text-primary underline"
          >
            {m.refused_security()}
          </a>
        )}
        <a href="/auth/connexion" className="font-semibold text-primary underline">
          {m.refused_retry()}
        </a>
      </main>
    </div>
  );
}
