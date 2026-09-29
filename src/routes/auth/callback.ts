import { createFileRoute } from '@tanstack/react-router';
import { getSignIn } from '@/platform/signin';

// The Compte Kete sends the operator back here; a replayed or tampered answer is refused.
export const Route = createFileRoute('/auth/callback')({
  server: {
    handlers: {
      GET: ({ request }) =>
        getSignIn()
          .callback(request)
          .catch(
            () =>
              new Response(null, { status: 302, headers: { location: '/refus?raison=sign_in' } }),
          ),
    },
  },
});
