import { resolveMemberPortalPolicy } from '@/features/application/lib/member-portal-policy';
import { getApplicationByUserId } from '@/features/application/queries/application';
import { getApplicationPortalSetting } from '@/features/application/queries/settings';

export async function getMemberPortalContext(userId: string) {
  const [application, portalSetting] = await Promise.all([
    getApplicationByUserId(userId),
    getApplicationPortalSetting(),
  ]);

  const policy = resolveMemberPortalPolicy(application, portalSetting);

  return {
    application,
    portalSetting,
    policy,
  };
}

export async function getMemberPortalPolicyByUserId(userId: string) {
  const { policy } = await getMemberPortalContext(userId);
  return policy;
}
