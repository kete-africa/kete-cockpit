import handler from '@tanstack/react-start/server-entry';
import { paraglideMiddleware } from './paraglide/server.js';

// The apps' health is read on a schedule (COCKPIT_PROBE_INTERVAL_SECONDS, default 300; 0: off),
// by one Cockpit instance at a time.
const interval = Number(process.env.COCKPIT_PROBE_INTERVAL_SECONDS ?? 300);
if (interval > 0 && process.env.COCKPIT_DATABASE_URL) {
  // Loaded only when the database is configured: the server starts (and reports its health)
  // without it.
  void import('./features/registry/registry').then(({ probeAllOnce }) => {
    setInterval(() => {
      probeAllOnce().catch((error: unknown) =>
        console.warn(`[probes] ${error instanceof Error ? error.message : 'failed'}`),
      );
    }, interval * 1000).unref();
  });
}

export default {
  fetch(request: Request): Promise<Response> {
    // Every request resolves its language first, so server-rendered text matches it.
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
};
