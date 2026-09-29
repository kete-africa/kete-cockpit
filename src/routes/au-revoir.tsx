import { createFileRoute } from '@tanstack/react-router';
import { KeteBand } from '@kete/design';
import { LanguageSwitch, Wordmark } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

export const Route = createFileRoute('/au-revoir')({ component: Goodbye });

function Goodbye() {
  return (
    <div className="flex min-h-dvh flex-col">
      <KeteBand />
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Wordmark />
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-12 pt-6">
        <h1 className="font-headline text-headline font-extrabold">{m.goodbye_title()}</h1>
        <a href="/auth/connexion" className="font-semibold text-primary underline">
          {m.goodbye_again()}
        </a>
      </main>
    </div>
  );
}
