'use client';

import type { ConferenceStage } from '@/lib/conference-stage';

interface ConferenceStageBadgeProps {
  stage: ConferenceStage;
  daysRemaining?: number;
  className?: string;
}

const STAGE_CONFIG: Record<ConferenceStage, { label: string; base: string }> = {
  planning: { label: 'Planning', base: 'bg-blue-100 text-blue-800 ring-blue-200' },
  in_progress: { label: 'In Progress', base: 'bg-green-100 text-green-800 ring-green-200' },
  post_conference: { label: 'Post-Conference', base: 'bg-amber-100 text-amber-800 ring-amber-200' },
  closed: { label: 'Closed', base: 'bg-gray-100 text-gray-600 ring-gray-200' },
};

export function ConferenceStageBadge({ stage, daysRemaining, className = '' }: ConferenceStageBadgeProps) {
  const config = STAGE_CONFIG[stage];
  const isUrgentPostConference = stage === 'post_conference' && daysRemaining != null && daysRemaining <= 2;
  const ringColor = isUrgentPostConference
    ? 'bg-red-100 text-red-800 ring-red-200'
    : config.base;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ringColor} ${className}`}
    >
      {stage === 'closed' && (
        <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )}
      {config.label}
      {stage === 'post_conference' && daysRemaining != null && (
        <span className="opacity-75">· {daysRemaining}d left</span>
      )}
    </span>
  );
}
