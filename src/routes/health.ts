import { createFileRoute } from '@tanstack/react-router';

// Liveness for the container probe: the Cockpit holds no database of its own yet.
export const Route = createFileRoute('/health')({
  server: {
    handlers: {
      GET: () => Response.json({ status: 'healthy' }, { headers: { 'cache-control': 'no-store' } }),
    },
  },
});
