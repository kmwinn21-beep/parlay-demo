'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { sortCompaniesByPriority, type TargetingApiResponse } from './targetRecommendationsView';

// Module-level cache of in-progress/completed target-recommendation compilations,
// keyed by conference id — shared across every component that needs company
// target-priority data (TargetRecommendationsTab, the rep drill-down drawer in
// LandscapeTab) so switching between them never re-triggers the same expensive
// batched fetch.
const TARGETING_BATCH_SIZE = 25;

export type CompilationStatus = 'idle' | 'compiling' | 'ready' | 'error';

export type CompilationSnapshot = {
  status: CompilationStatus;
  data: TargetingApiResponse | null;
  error: string | null;
  completed: number;
  total: number | null;
};

const compilationStore = new Map<number, CompilationSnapshot>();
const compilationPromises = new Map<number, Promise<void>>();
const compilationListeners = new Map<number, Set<() => void>>();

function defaultSnapshot(): CompilationSnapshot {
  return { status: 'idle', data: null, error: null, completed: 0, total: null };
}

export function getCompilationSnapshot(conferenceId: number): CompilationSnapshot {
  return compilationStore.get(conferenceId) ?? defaultSnapshot();
}

function setCompilationSnapshot(conferenceId: number, snapshot: CompilationSnapshot) {
  compilationStore.set(conferenceId, snapshot);
  compilationListeners.get(conferenceId)?.forEach(listener => listener());
}

export function subscribeToCompilation(conferenceId: number, listener: () => void): () => void {
  const listeners = compilationListeners.get(conferenceId) ?? new Set<() => void>();
  listeners.add(listener);
  compilationListeners.set(conferenceId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) compilationListeners.delete(conferenceId);
  };
}

async function fetchTargetingBatch(conferenceId: number, offset: number): Promise<TargetingApiResponse> {
  const params = new URLSearchParams({ batch: '1', offset: String(offset), limit: String(TARGETING_BATCH_SIZE) });
  const res = await fetch(`/api/conferences/${conferenceId}/targeting?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load targeting recommendations');
  return res.json() as Promise<TargetingApiResponse>;
}

export function startTargetRecommendationsCompilation(conferenceId: number, force = false): CompilationSnapshot {
  const current = getCompilationSnapshot(conferenceId);
  if (!force && (current.status === 'compiling' || current.status === 'ready' || compilationPromises.has(conferenceId))) return current;

  const initial: CompilationSnapshot = { status: 'compiling', data: null, error: null, completed: 0, total: null };
  setCompilationSnapshot(conferenceId, initial);

  const promise = (async () => {
    let offset = 0;
    let total: number | null = null;
    let unavailableReason: string | undefined;
    let scoringConfig: TargetingApiResponse['scoring_config'];
    const companies: NonNullable<TargetingApiResponse['companies']> = [];

    try {
      while (true) {
        const batch = await fetchTargetingBatch(conferenceId, offset);
        unavailableReason = batch.unavailable_reason ?? unavailableReason;
        scoringConfig = scoringConfig ?? batch.scoring_config;
        companies.push(...(batch.companies ?? []));

        const pagination = batch.pagination;
        total = pagination?.total_companies ?? companies.length;
        const completed = Math.min(total, pagination ? pagination.offset + pagination.returned : companies.length);
        setCompilationSnapshot(conferenceId, {
          status: 'compiling',
          data: { ...batch, companies: sortCompaniesByPriority(companies), scoring_config: scoringConfig },
          error: null,
          completed,
          total,
        });

        if (!pagination?.has_more || pagination.next_offset == null) break;
        offset = pagination.next_offset;
      }

      const readyData: TargetingApiResponse = {
        conference_id: conferenceId,
        generated_at: new Date().toISOString(),
        scoring_config: scoringConfig,
        companies: sortCompaniesByPriority(companies),
        pagination: total == null ? undefined : {
          offset: 0,
          limit: companies.length,
          total_companies: total,
          returned: companies.length,
          has_more: false,
          next_offset: null,
        },
        unavailable_reason: companies.length === 0 ? unavailableReason : undefined,
      };

      setCompilationSnapshot(conferenceId, { status: 'ready', data: readyData, error: null, completed: companies.length, total });
      toast.success('Target recommendations are ready.');
    } catch {
      setCompilationSnapshot(conferenceId, { status: 'error', data: null, error: 'Unable to load target recommendations.', completed: companies.length, total });
      toast.error('Unable to load target recommendations.');
    } finally {
      compilationPromises.delete(conferenceId);
    }
  })();

  compilationPromises.set(conferenceId, promise);
  return initial;
}

/** Subscribes to (and kicks off, if not already running) the shared
 * target-recommendations compilation for a conference. Safe to call from
 * multiple components at once — they all read the same cached snapshot. */
export function useTargetingCompilation(conferenceId: number): CompilationSnapshot {
  const [snapshot, setSnapshot] = useState<CompilationSnapshot>(() => getCompilationSnapshot(conferenceId));

  useEffect(() => {
    const unsubscribe = subscribeToCompilation(conferenceId, () => setSnapshot(getCompilationSnapshot(conferenceId)));
    setSnapshot(startTargetRecommendationsCompilation(conferenceId));
    return unsubscribe;
  }, [conferenceId]);

  return snapshot;
}
