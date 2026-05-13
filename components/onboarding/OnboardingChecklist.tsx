'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useOnboarding } from '@/lib/OnboardingContext';

interface StepDef {
  id: string;
  label: string;
  description: string;
  actionLabel: string;
  getHref: (state: CheckState) => string;
  allowSkip?: boolean;
}

interface CheckState {
  firstConferenceId: number | null;
}

const TRACK_A_STEPS: StepDef[] = [
  {
    id: 'icp_configured',
    label: 'Configure your ICP profile',
    description: 'Your target scores will improve significantly after you configure your ICP profile.',
    actionLabel: 'Go to ICP settings',
    getHref: () => '/admin?tab=icp',
  },
  {
    id: 'conference_created',
    label: 'Create your first conference',
    description: 'Add your upcoming conference — name, dates, and location.',
    actionLabel: 'Create conference',
    getHref: () => '/conferences/new',
  },
  {
    id: 'attendees_uploaded',
    label: 'Upload your attendee list',
    description: 'Upload the attendee CSV from your upcoming conference.',
    actionLabel: 'Upload attendees',
    getHref: ({ firstConferenceId }) => firstConferenceId ? `/conferences/${firstConferenceId}` : '/conferences',
  },
  {
    id: 'preconf_visited',
    label: 'Review your pre-conference intelligence',
    description: 'See your target priority scores, strategy assessment, and recommended actions.',
    actionLabel: 'View pre-conference review',
    getHref: ({ firstConferenceId }) => firstConferenceId ? `/conferences/${firstConferenceId}` : '/conferences',
  },
  {
    id: 'team_invited',
    label: 'Invite your team',
    description: 'Add your reps, managers, and coordinators.',
    actionLabel: 'Invite team',
    getHref: () => '/admin?tab=users',
    allowSkip: true,
  },
];

const TRACK_B_STEPS: StepDef[] = [
  {
    id: 'icp_configured',
    label: 'Configure your ICP profile',
    description: 'Before uploading past conference lists, configure your ICP profile. Every list you upload will be scored against these settings.',
    actionLabel: 'Go to ICP settings',
    getHref: () => '/admin?tab=icp',
  },
  {
    id: 'conferences_uploaded',
    label: 'Upload past conference lists',
    description: 'Upload attendee lists from up to 5 past conferences.',
    actionLabel: 'Add past conference',
    getHref: () => '/conferences/new',
  },
  {
    id: 'calendar_intel_visited',
    label: 'Review your retroactive scores',
    description: 'See which conferences had the highest ICP density and pipeline potential.',
    actionLabel: 'View Calendar Intelligence',
    getHref: () => '/program-intelligence?tab=calendar',
  },
  {
    id: 'performance_visited',
    label: 'Compare conferences side by side',
    description: 'See all past conferences scored and ranked for next year\'s calendar decisions.',
    actionLabel: 'View Performance Overview',
    getHref: () => '/program-intelligence?tab=performance',
  },
  {
    id: 'team_invited',
    label: 'Invite your team',
    description: 'Add your reps, managers, and coordinators.',
    actionLabel: 'Invite team',
    getHref: () => '/admin?tab=users',
    allowSkip: true,
  },
];

interface ConferenceSummary {
  id: number;
  end_date: string;
  attendee_count: number;
}

interface IcpConfigResponse {
  rules: unknown[];
}

async function checkCompletionConditions(completedSteps: string[]): Promise<{
  newSteps: string[];
  firstConferenceId: number | null;
}> {
  const toCheck: string[] = [];
  const needsIcp = !completedSteps.includes('icp_configured');
  const needsConf = !completedSteps.includes('conference_created') || !completedSteps.includes('conferences_uploaded');
  const needsAttendees = !completedSteps.includes('attendees_uploaded');
  const needsTeam = !completedSteps.includes('team_invited');

  if (needsIcp) toCheck.push('icp');
  if (needsConf || needsAttendees) toCheck.push('conferences');
  if (needsTeam) toCheck.push('users');

  const results = await Promise.all([
    toCheck.includes('icp')
      ? fetch('/api/admin/icp-rules', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<IcpConfigResponse> : { rules: [] }).catch(() => ({ rules: [] as unknown[] }))
      : Promise.resolve(null),
    toCheck.includes('conferences')
      ? fetch('/api/conferences', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<ConferenceSummary[]> : []).catch(() => [] as ConferenceSummary[])
      : Promise.resolve(null),
    toCheck.includes('users')
      ? fetch('/api/admin/users', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<unknown[]> : []).catch(() => [] as unknown[])
      : Promise.resolve(null),
  ]);

  const [icpData, conferencesData, usersData] = results;
  const newSteps: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  if (icpData && (icpData as IcpConfigResponse).rules?.length > 0) newSteps.push('icp_configured');

  let firstFutureConfId: number | null = null;
  let hasAttendees = false;
  let hasPastWithAttendees = false;

  if (conferencesData) {
    const confs = conferencesData as ConferenceSummary[];
    const future = confs.filter(c => c.end_date >= today);
    if (future.length > 0) {
      newSteps.push('conference_created');
      firstFutureConfId = future[0].id;
    }
    hasAttendees = confs.some(c => c.attendee_count > 0 && c.end_date >= today);
    if (hasAttendees) newSteps.push('attendees_uploaded');
    hasPastWithAttendees = confs.some(c => c.attendee_count > 0 && c.end_date < today);
    if (hasPastWithAttendees) newSteps.push('conferences_uploaded');
  }

  if (usersData) {
    const users = usersData as unknown[];
    if (users.length >= 2) newSteps.push('team_invited');
  }

  return { newSteps, firstConferenceId: firstFutureConfId };
}

export function OnboardingChecklist() {
  const router = useRouter();
  const pathname = usePathname();
  const { isEligible, loading, onboardingTrack, onboardingProgress, updateProgress, markStepComplete } = useOnboarding();
  const [expanded, setExpanded] = useState(true);
  const [checkState, setCheckState] = useState<CheckState>({ firstConferenceId: null });
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const checkedRef = useRef(false);

  const steps = onboardingTrack === 'track_b' ? TRACK_B_STEPS : TRACK_A_STEPS;

  const runCompletionCheck = useCallback(async () => {
    if (!onboardingProgress) return;
    const { newSteps, firstConferenceId } = await checkCompletionConditions(onboardingProgress.completed_steps);
    setCheckState({ firstConferenceId });

    const allCurrentSteps = [...onboardingProgress.completed_steps];
    let changed = false;
    for (const s of newSteps) {
      if (!allCurrentSteps.includes(s)) { allCurrentSteps.push(s); changed = true; }
    }

    if (changed) {
      const allComplete = steps.every(s => allCurrentSteps.includes(s.id));
      const next = {
        ...onboardingProgress,
        completed_steps: allCurrentSteps,
        completed_at: allComplete ? Date.now() : null,
      };
      await fetch('/api/onboarding/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_progress: next }),
      }).catch(() => {});

      if (allComplete && !onboardingProgress.completed_at) {
        setShowComplete(true);
        setTimeout(() => setShowComplete(false), 3000);
      }
    }
  }, [onboardingProgress, steps]);

  // Check on mount and route changes
  useEffect(() => {
    if (!onboardingProgress || !isEligible) return;
    runCompletionCheck();
    checkedRef.current = true;
  }, [pathname, onboardingProgress, isEligible, runCompletionCheck]);

  if (loading || !isEligible || !onboardingProgress || onboardingProgress.dismissed) return null;
  if (onboardingProgress.completed_at && !showComplete) return null;

  const completedIds = new Set(onboardingProgress.completed_steps);
  const completedCount = steps.filter(s => completedIds.has(s.id)).length;
  const allDone = completedCount === steps.length;

  const handleDismiss = async () => {
    setShowDismissConfirm(false);
    await updateProgress({ dismissed: true });
  };

  const handleSkipStep = async (stepId: string) => {
    await markStepComplete(stepId);
  };

  const handleStepClick = (step: StepDef) => {
    if (completedIds.has(step.id)) return;
    const href = step.getHref(checkState);
    router.push(href);
  };

  // Collapsed chip
  if (!expanded) {
    return (
      <div className="mx-4 mb-2">
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-left"
        >
          <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-white/40 flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">{completedCount}</span>
          </div>
          <span className="text-white/80 text-xs font-medium truncate">
            Setup guide ({completedCount}/{steps.length} complete)
          </span>
          <svg className="w-3 h-3 text-white/50 flex-shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
    );
  }

  // All-done success message
  if (showComplete || allDone) {
    return (
      <div className="mx-4 mb-2 bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-xs font-semibold text-green-800">You&apos;re all set!</p>
        <p className="text-xs text-green-600 mt-0.5">Your Parlay account is fully configured.</p>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-2 bg-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-white text-xs font-semibold">Setup guide</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(false)}
            className="text-white/50 hover:text-white/80 transition-colors p-1"
            aria-label="Collapse checklist"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={() => setShowDismissConfirm(true)}
            className="text-white/50 hover:text-white/80 transition-colors p-1"
            aria-label="Dismiss setup guide"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dismiss confirmation */}
      {showDismissConfirm && (
        <div className="px-3 py-3 bg-white/5 border-b border-white/10">
          <p className="text-white/80 text-xs mb-2">Hide the setup guide? You can find it again in settings.</p>
          <div className="flex gap-2">
            <button onClick={handleDismiss} className="flex-1 py-1 text-xs bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors">
              Hide it
            </button>
            <button onClick={() => setShowDismissConfirm(false)} className="flex-1 py-1 text-xs text-white/60 hover:text-white/80 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="py-1">
        {steps.map((step, idx) => {
          const isComplete = completedIds.has(step.id);
          const isNext = !isComplete && steps.slice(0, idx).every(s => completedIds.has(s.id));
          return (
            <div key={step.id} className="px-3 py-2">
              <div className="flex items-start gap-2">
                {/* Status icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {isComplete ? (
                    <div className="w-4 h-4 rounded-full bg-green-400 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div className={`w-4 h-4 rounded-full border-2 ${isNext ? 'border-white/60' : 'border-white/25'}`} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium leading-tight ${isComplete ? 'text-white/40 line-through' : 'text-white/90'}`}>
                    {step.label}
                  </p>
                  {!isComplete && (
                    <>
                      <p className="text-white/50 text-[10px] leading-tight mt-0.5">{step.description}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          onClick={() => handleStepClick(step)}
                          className="text-[10px] font-medium text-brand-highlight hover:underline"
                        >
                          {step.actionLabel} →
                        </button>
                        {step.allowSkip && (
                          <button
                            onClick={() => handleSkipStep(step.id)}
                            className="text-[10px] text-white/40 hover:text-white/60"
                          >
                            Skip
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="px-3 pb-2">
        <div className="w-full bg-white/10 rounded-full h-1">
          <div
            className="bg-green-400 h-1 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
        <p className="text-white/40 text-[10px] text-right mt-0.5">{completedCount}/{steps.length}</p>
      </div>
    </div>
  );
}
