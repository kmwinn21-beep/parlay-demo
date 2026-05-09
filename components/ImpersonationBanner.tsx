'use client';
import { useCapabilities, invalidateCapabilitiesCache } from '@/lib/useCapabilities';
import { useRouter } from 'next/navigation';

export default function ImpersonationBanner() {
  const { isImpersonating, impersonatedAccountId, impersonatedCompanyName } = useCapabilities();
  const router = useRouter();

  if (!isImpersonating) return null;

  async function endImpersonation() {
    await fetch('/api/ops/impersonate/end', { method: 'POST' });
    invalidateCapabilitiesCache();
    router.push(`/ops/accounts/${impersonatedAccountId ?? ''}`);
  }

  return (
    <div className="w-full bg-red-600 text-white text-sm py-2 px-4 flex items-center justify-between flex-shrink-0 z-50">
      <span>
        Admin view: <strong>{impersonatedCompanyName ?? 'Unknown account'}</strong>
      </span>
      <button onClick={endImpersonation} className="underline font-semibold hover:text-red-100">
        Exit impersonation →
      </button>
    </div>
  );
}
