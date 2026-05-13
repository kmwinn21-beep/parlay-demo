'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useUpgradeModal } from '@/lib/UpgradeModalContext';

export function UpgradeQueryTrigger() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openUpgradeModal } = useUpgradeModal();

  useEffect(() => {
    if (searchParams.get('upgrade') === 'true') {
      openUpgradeModal();
      const params = new URLSearchParams(searchParams.toString());
      params.delete('upgrade');
      const qs = params.toString();
      router.replace(pathname + (qs ? `?${qs}` : ''));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
