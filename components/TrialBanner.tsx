'use client';
import { useState, useEffect } from 'react';
import { useCapabilities } from '@/lib/useCapabilities';
import { useUpgradeModal } from '@/lib/UpgradeModalContext';

export function TrialBanner() {
  const { trialState, daysRemaining } = useCapabilities();
  const { openUpgradeModal } = useUpgradeModal();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (daysRemaining != null) {
      const key = `trial_banner_dismissed_${daysRemaining}`;
      setDismissed(sessionStorage.getItem(key) === 'true');
    }
  }, [daysRemaining]);

  const handleDismiss = () => {
    if (daysRemaining != null) {
      sessionStorage.setItem(`trial_banner_dismissed_${daysRemaining}`, 'true');
    }
    setDismissed(true);
  };

  if (!mounted) return null;

  // Expired — full-screen interstitial
  if (trialState === 'expired') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Your trial has ended</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your 14-day free trial has expired. Upgrade to a paid plan to continue using Parlay. Your data is safe and will be restored when you upgrade.
          </p>
          <button
            onClick={() => openUpgradeModal()}
            className="inline-block w-full py-3 px-6 bg-brand-primary text-white font-semibold rounded-xl text-center hover:opacity-90 transition-opacity"
          >
            View Plans &amp; Pricing
          </button>
          <p className="text-xs text-gray-400 mt-4">
            Need help? Contact us at{' '}
            <a href="mailto:support@useparlay.com" className="underline">support@useparlay.com</a>
          </p>
        </div>
      </div>
    );
  }

  // Grace period — non-dismissible red bar
  if (trialState === 'grace') {
    return (
      <div className="w-full bg-red-600 text-white text-sm py-2 px-4 flex items-center justify-center gap-3 flex-shrink-0">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Your trial has ended — the app is now <strong>read-only</strong>. Upgrade to restore full access.</span>
        <button
          onClick={() => openUpgradeModal()}
          className="ml-2 underline font-semibold hover:no-underline flex-shrink-0 bg-transparent border-0 cursor-pointer text-white"
        >
          Upgrade now →
        </button>
      </div>
    );
  }

  // Active trial, days 1-11 — silent (no banner)
  if (trialState !== 'active' || daysRemaining == null || daysRemaining > 3) return null;

  // Active trial, days ≤ 3 — dismissible amber warning
  if (dismissed) return null;

  const dayWord = daysRemaining === 1 ? 'day' : 'days';

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 text-amber-800 text-sm py-2 px-4 flex items-center justify-between gap-3 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          Your free trial ends in <strong>{daysRemaining} {dayWord}</strong>.{' '}
          <button
            onClick={() => openUpgradeModal()}
            className="underline font-semibold hover:no-underline bg-transparent border-0 cursor-pointer text-amber-800 p-0"
          >
            Upgrade now →
          </button>
        </span>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss trial banner"
        className="flex-shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
