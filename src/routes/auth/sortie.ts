import { createFileRoute } from '@tanstack/react-router';
import { getSignIn } from '@/platform/signin';

// Closes the Cockpit session (the Compte Kete session stays: signing in again is silent).
export const Route = createFileRoute('/auth/sortie')({
  server: { handlers: { GET: () => getSignIn().signOut('/au-revoir') } },
});
