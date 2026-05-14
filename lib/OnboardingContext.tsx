'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useCapabilities } from '@/lib/useCapabilities';

export interface OnboardingProgress {
  completed_steps: string[];
  dismissed: boolean;
  completed_at: number | null;
}

export type OnboardingTrack = 'track_a' | 'track_b';

interface OnboardingState {
  onboardingTrack: OnboardingTrack | null;
  onboardingProgress: OnboardingProgress | null;
  firstName: string;
  loading: boolean;
  isEligible: boolean; // trial + not impersonating
  updateProgress: (patch: Partial<OnboardingProgress>) => Promise<void>;
  updateTrack: (track: OnboardingTrack) => Promise<void>;
  markStepComplete: (stepId: string) => Promise<void>;
  refresh: () => void;
}

const defaultState: OnboardingState = {
  onboardingTrack: null,
  onboardingProgress: null,
  firstName: '',
  loading: true,
  isEligible: false,
  updateProgress: async () => {},
  updateTrack: async () => {},
  markStepComplete: async () => {},
  refresh: () => {},
};

const OnboardingContext = createContext<OnboardingState>(defaultState);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { planId, isImpersonating, role } = useCapabilities();
  const [onboardingTrack, setOnboardingTrack] = useState<OnboardingTrack | null>(null);
  const [onboardingProgress, setOnboardingProgress] = useState<OnboardingProgress | null>(null);
  const [firstName, setFirstName] = useState('');
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  // Only show onboarding UI for trial users who are not impersonating, and not stakeholders
  const isEligible = planId === 'trial' && !isImpersonating && role !== 'stakeholder';

  const fetchProgress = useCallback(async () => {
    if (!isEligible) { setLoading(false); return; }
    try {
      const res = await fetch('/api/onboarding/progress', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as {
        onboarding_track: string | null;
        onboarding_progress: OnboardingProgress | null;
        first_name: string;
      };
      if (data.onboarding_track === 'track_a' || data.onboarding_track === 'track_b') {
        setOnboardingTrack(data.onboarding_track);
      }
      setOnboardingProgress(data.onboarding_progress);
      setFirstName(data.first_name ?? '');
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [isEligible]);

  useEffect(() => {
    // Wait until capabilities have loaded (planId not default)
    if (planId === 'trial' && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchProgress();
    } else if (planId !== 'trial') {
      setLoading(false);
    }
  }, [planId, fetchProgress]);

  const updateProgress = useCallback(async (patch: Partial<OnboardingProgress>) => {
    const next: OnboardingProgress = {
      completed_steps: [],
      dismissed: false,
      completed_at: null,
      ...onboardingProgress,
      ...patch,
    };
    setOnboardingProgress(next);
    await fetch('/api/onboarding/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_progress: next }),
    }).catch(() => {});
  }, [onboardingProgress]);

  const updateTrack = useCallback(async (track: OnboardingTrack) => {
    setOnboardingTrack(track);
    await fetch('/api/onboarding/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_track: track }),
    }).catch(() => {});
  }, []);

  const markStepComplete = useCallback(async (stepId: string) => {
    const current = onboardingProgress;
    if (!current) return;
    if (current.completed_steps.includes(stepId)) return;
    const updatedSteps = [...current.completed_steps, stepId];
    const next: OnboardingProgress = {
      ...current,
      completed_steps: updatedSteps,
    };
    setOnboardingProgress(next);
    await fetch('/api/onboarding/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_progress: next }),
    }).catch(() => {});
  }, [onboardingProgress]);

  return (
    <OnboardingContext.Provider value={{
      onboardingTrack,
      onboardingProgress,
      firstName,
      loading,
      isEligible,
      updateProgress,
      updateTrack,
      markStepComplete,
      refresh: fetchProgress,
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
