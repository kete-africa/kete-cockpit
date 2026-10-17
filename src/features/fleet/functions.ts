import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { accountApi, AccountApiError } from '@/platform/account';
import { asOperator } from '@/platform/operator.server';

// Kete's fleet (kete-core specs 123 and 125; phase 11, step B2): every organization's Kete
// Enterprise, as the Compte Kete keeps it — the one source; the Cockpit reads it and says what
// Kete made, never copies it.

export type Mode = 'shared' | 'dedicated' | 'on_premises' | 'autonomous';

export interface FleetDeployment {
  id: string;
  organizationId: string;
  organizationName: string;
  product: string;
  mode: Mode;
  region: string;
  apps: string[];
  status: 'requested' | 'ready';
  url: string | null;
  requestedMode: Mode | null;
  createdAt: string;
  updatedAt: string;
}

export const fetchFleet = createServerFn({ method: 'GET' }).handler(() =>
  asOperator((token) =>
    accountApi<{ deployments: FleetDeployment[] }>(token, '/api/admin/deployments'),
  ),
);

/** Says a deployment is made, at its address; the Compte Kete tells its organization. */
export const makeDeploymentReady = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        deploymentId: z.string().min(4).max(64),
        url: z
          .string()
          .url()
          .max(300)
          .refine((value) => value.startsWith('https://')),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      return await asOperator((token) =>
        accountApi<{ deployment: { deploymentId: string } }>(token, '/api/admin/deployments', data),
      );
    } catch (error) {
      // Already made, or gone meanwhile: said, never thrown.
      if (error instanceof AccountApiError && (error.status === 404 || error.status === 409)) {
        return { status: 'conflict' as const };
      }
      throw error;
    }
  });
