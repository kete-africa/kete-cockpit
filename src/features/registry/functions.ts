import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { checkOperator, getSignIn } from '@/platform/signin';
import { appDetail, listApps, probeApp, registerApp, RegistryError, rotateKey } from './registry';

type Guarded<T> =
  | { status: 'ok'; data: T }
  | { status: 'signed_out' | 'refused' }
  | { status: 'error'; code: RegistryError['code'] };

/** Every registry action: an operator only (the Cockpit's session), errors named, not thrown. */
async function asOperator<T>(run: (operatorId: string) => Promise<T>): Promise<Guarded<T>> {
  const check = checkOperator(await getSignIn().session(getRequest()));
  if (check.status !== 'operator') return { status: check.status };
  try {
    return { status: 'ok', data: await run(check.identity.userId) };
  } catch (error) {
    if (error instanceof RegistryError) return { status: 'error', code: error.code };
    throw error;
  }
}

const appId = z.object({ appId: z.string().min(1).max(64) });

export const fetchApps = createServerFn({ method: 'GET' }).handler(() =>
  asOperator(() => listApps()),
);

export const fetchApp = createServerFn({ method: 'GET' })
  .validator((input: unknown) => appId.parse(input))
  .handler(({ data }) => asOperator(() => appDetail(data.appId)));

export const addApp = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ address: z.string().min(1).max(300) }).parse(input))
  .handler(({ data }) => asOperator((operatorId) => registerApp(operatorId, data.address)));

export const newKey = createServerFn({ method: 'POST' })
  .validator((input: unknown) => appId.parse(input))
  .handler(({ data }) => asOperator(() => rotateKey(data.appId)));

export const probeNow = createServerFn({ method: 'POST' })
  .validator((input: unknown) => appId.parse(input))
  .handler(({ data }) =>
    asOperator(async () => {
      const detail = await appDetail(data.appId);
      await probeApp({ id: detail.app.id, baseUrl: detail.app.baseUrl });
      return { ok: true as const };
    }),
  );
