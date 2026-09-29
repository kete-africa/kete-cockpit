import { deliveryHandler, postgresDedupeStore } from '@kete/sdk';
import { createFileRoute } from '@tanstack/react-router';
import { declaredEvents, loadKeyRing } from '@/features/registry/registry';
import { getPool } from '@/platform/db';

// Where Kete apps deliver their events (@kete/sdk relay): signed batches, each event accepted once,
// only the types its manifest declares. The keys are read per delivery, so a rotation applies at
// once.
export const Route = createFileRoute('/api/events')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [keyRing, declared] = await Promise.all([loadKeyRing(), declaredEvents()]);
        return deliveryHandler({
          keyRing,
          store: postgresDedupeStore(getPool()),
          declaredTypes: (product) => declared.get(product),
        })(request);
      },
    },
  },
});
