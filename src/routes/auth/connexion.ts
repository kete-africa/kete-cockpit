import { createFileRoute } from '@tanstack/react-router';
import { getSignIn } from '@/platform/signin';

// Sends the operator to the Compte Kete to sign in, then back to `returnTo`.
export const Route = createFileRoute('/auth/connexion')({
  server: { handlers: { GET: ({ request }) => getSignIn().start(request) } },
});
