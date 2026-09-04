import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { isOwnerOnlyEmail } from '@/constants/ownerOnlyFeatures';

/** True only for beartec@beartec.uk — unfinished tools stay visible for that account. */
export function useShowOwnerOnlyTools(): boolean {
  const { user } = useCryptoAuth();
  return isOwnerOnlyEmail(user?.email);
}
