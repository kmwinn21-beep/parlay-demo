'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const PLAN_LABELS: Record<string, string> = {
  essentials: 'Essentials',
  professional: 'Professional',
  enterprise: 'Enterprise',
  custom: '',
};

export function UpgradeSuccessBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'neutral' } | null>(null);

  useEffect(() => {
    const upgraded = searchParams.get('upgraded');
    const plan = searchParams.get('plan');
    const cancelled = searchParams.get('checkout');

    if (upgraded === 'true' && plan) {
      const planLabel = PLAN_LABELS[plan];
      const text = planLabel
        ? `Welcome to Parlay ${planLabel}. Your full access is now active.`
        : 'Welcome to Parlay. Your custom plan is now active.';
      setMessage({ text, type: 'success' });
      router.replace(pathname);
    } else if (cancelled === 'cancelled') {
      setMessage({ text: 'No changes were made to your plan.', type: 'neutral' });
      router.replace(pathname);
      // Auto-dismiss after 4s
      setTimeout(() => setMessage(null), 4000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!message) return null;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm mb-4 ${
        message.type === 'success'
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          : 'bg-gray-100 border border-gray-200 text-gray-600'
      }`}
    >
      {message.type === 'success' ? (
        <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      <span className="font-medium">{message.text}</span>
      <button
        onClick={() => setMessage(null)}
        className="ml-auto text-current opacity-50 hover:opacity-80 transition-opacity"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
