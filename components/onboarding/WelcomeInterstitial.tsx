'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useOnboarding, type OnboardingTrack } from '@/lib/OnboardingContext';

export function WelcomeInterstitial() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isEligible, loading, onboardingTrack, onboardingProgress, updateTrack, updateProgress } = useOnboarding();
  const [show, setShow] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<OnboardingTrack | null>(null);
  const [saving, setSaving] = useState(false);

  const hasWelcomeParam = searchParams.get('welcome') === 'true';

  useEffect(() => {
    if (!loading && isEligible && hasWelcomeParam && onboardingProgress === null) {
      setShow(true);
      // Pre-select the stored track (from marketing site modal)
      if (onboardingTrack) setSelectedTrack(onboardingTrack);
    }
  }, [loading, isEligible, hasWelcomeParam, onboardingProgress, onboardingTrack]);

  const handleStart = async (track: OnboardingTrack) => {
    if (saving) return;
    setSaving(true);
    try {
      if (track !== onboardingTrack) await updateTrack(track);
      await updateProgress({ completed_steps: [], dismissed: false, completed_at: null });
      // Clean the URL
      router.replace('/');
      setShow(false);
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-brand-primary font-serif mb-2">
            Welcome to Parlay.
          </h1>
          <p className="text-gray-500 text-sm">Let&apos;s get you set up. What brings you here today?</p>
        </div>

        {/* Track option cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Track A */}
          <button
            onClick={() => setSelectedTrack('track_a')}
            className={`text-left p-6 rounded-xl border-2 transition-all ${
              selectedTrack === 'track_a'
                ? 'border-brand-primary bg-brand-primary/5'
                : 'border-gray-200 hover:border-brand-primary/50 hover:bg-gray-50'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${
              selectedTrack === 'track_a' ? 'bg-brand-primary' : 'bg-gray-100'
            }`}>
              <svg className={`w-5 h-5 ${selectedTrack === 'track_a' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">I have a conference coming up</h3>
            <p className="text-sm text-gray-500">Upload your attendee list and arrive with a targeting strategy</p>
            {selectedTrack === 'track_a' && (
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-primary">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Selected
              </div>
            )}
          </button>

          {/* Track B */}
          <button
            onClick={() => setSelectedTrack('track_b')}
            className={`text-left p-6 rounded-xl border-2 transition-all ${
              selectedTrack === 'track_b'
                ? 'border-brand-primary bg-brand-primary/5'
                : 'border-gray-200 hover:border-brand-primary/50 hover:bg-gray-50'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${
              selectedTrack === 'track_b' ? 'bg-brand-primary' : 'bg-gray-100'
            }`}>
              <svg className={`w-5 h-5 ${selectedTrack === 'track_b' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">I&apos;m planning next year&apos;s calendar</h3>
            <p className="text-sm text-gray-500">Upload past conference lists and score your history</p>
            {selectedTrack === 'track_b' && (
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-primary">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Selected
              </div>
            )}
          </button>
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <button
            disabled={!selectedTrack || saving}
            onClick={() => selectedTrack && handleStart(selectedTrack)}
            className="px-8 py-3 bg-brand-primary text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Setting up…' : 'Start here →'}
          </button>
        </div>
      </div>
    </div>
  );
}
