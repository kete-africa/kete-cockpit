import type { KeteIdentity } from '@kete/auth';
import { afterEach, describe, expect, it } from 'vitest';
import { checkOperator, secondFactorWaived } from '@/platform/signin';

// Kete's operators: Kete's organization, owner or admin, second factor on — or, on staging only,
// without it when the environment says so (kete-core spec 135).

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('who enters the Cockpit', () => {
  it('without a second factor on staging only, when it says so', () => {
    process.env.KETE_OPERATORS_ORGANIZATION_ID = 'org_kete';
    const weak = {
      userId: 'usr_ama',
      organizationId: 'org_kete',
      role: 'owner',
      twoFactor: false,
    } as KeteIdentity;
    const check = () => checkOperator(weak).status;
    const before = check();
    process.env.KETE_OPERATORS_SECOND_FACTOR = 'optional';
    process.env.KETE_ENVIRONMENT = 'staging';
    expect(secondFactorWaived()).toBe(true);
    expect(check()).toBe('operator');
    process.env.KETE_ENVIRONMENT = 'production';
    expect(check()).toBe('refused');
    expect(before).toBe('refused');
  });
});
