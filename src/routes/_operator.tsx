import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router';
import { KeteBand } from '@kete/design';
import { fetchOperator } from '@/features/session/functions';
import { LanguageSwitch, Wordmark } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

// Every Cockpit page: an operator only. Anyone else signs in, or is told why they cannot enter.
export const Route = createFileRoute('/_operator')({
  beforeLoad: async ({ location }) => {
    const operator = await fetchOperator();
    if (operator.status === 'signed_out') {
      throw redirect({
        href: `/auth/connexion?returnTo=${encodeURIComponent(location.href)}`,
        reloadDocument: true,
      });
    }
    if (operator.status === 'refused') {
      throw redirect({ to: '/refus', search: { raison: operator.reason } });
    }
    return { operator: operator.person };
  },
  component: Layout,
});

function Layout() {
  const { operator } = Route.useRouteContext();
  return (
    <div className="flex min-h-dvh flex-col">
      <KeteBand />
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:gap-x-6 sm:px-8">
          <Link to="/offres" aria-label={m.nav_offers()} className="order-1">
            <Wordmark />
          </Link>
          <div className="order-2 ml-auto flex items-center gap-2 sm:order-5 sm:ml-0 sm:gap-3">
            <LanguageSwitch />
            <a
              href="/auth/sortie"
              className="whitespace-nowrap text-body-sm font-semibold text-bark underline hover:text-ink"
            >
              {m.nav_sign_out()}
            </a>
          </div>
          <p className="order-3 w-full truncate text-body-sm text-bark sm:order-4 sm:ml-auto sm:w-auto">
            {operator.name}
          </p>
          <nav className="order-4 flex w-full gap-4 sm:order-2 sm:w-auto">
            <Link
              to="/offres"
              className="whitespace-nowrap border-b-2 border-transparent py-1 text-body-sm font-semibold text-bark hover:text-ink data-[status=active]:border-primary data-[status=active]:text-ink"
            >
              {m.nav_offers()}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
