// Shared module-level store for Calendar Intelligence scoring.
// Survives client-side navigation so the Cal Intel page and Program Planner
// share the same scored data without duplicate API calls.

export interface CalendarConferenceRow {
  conferenceId: number;
  conferenceName: string;
  conferenceYear: number;
  conferenceType: 'historical' | 'active';
  attendeeCount: number;
  totalCompanies: number;
  icpCompanies: number;
  icpDensityPct: number;
  calendarRecommendationScore: number | null;
  componentScores?: {
    audienceFit: number | null;
    targetOpportunity: number | null;
    commercialPotential: number | null;
    costJustification: number | null;
    strategicValue: number | null;
  };
  componentDetails?: {
    audienceFit: string[];
    targetOpportunity: string[];
    commercialPotential: string[];
    costJustification: string[];
    strategicValue: string[];
  };
  strategyScores?: Array<{ strategy: string; score: number }>;
  recommendedStrategy?: string;
  strategyRationale?: string;
  conferenceStrategyType?: string | null;
  confidenceMultiplier?: number;
  availableComponentCount?: number;
  totalComponentCount?: number;
  maxPossibleScore?: number;
  recommendationTier: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  dataAge: number;
  recommendationReason?: string[];
  confidenceFactors?: string[];
  tierProbabilityFactors?: { must: number; high: number; worth: number };
  targetingScored?: boolean;
  diagnostics?: {
    targetingEngine?: {
      mustTargetCount: number;
      highPriorityCount: number;
      worthEngagingCount: number;
      monitorCount: number;
      lowPriorityCount: number;
      needsTitleReviewCount: number;
      totalScoredCompanies: number;
      avgTargetPriorityScore: number;
      avgBuyerAccessScore: number;
      avgRelationshipLeverageScore: number;
      actionableCount: number;
      isLargeConference: boolean;
      totalScheduledMeetings?: number;
    } | null;
    budget?: { line_items?: unknown; return_on_cost?: string | null; required_pipeline_amount?: number; required_pipeline_multiple?: number } | null;
    commercialPotential?: { projected_pipeline?: number; realistic_pipeline?: number; must_wse?: number; high_wse?: number; worth_wse?: number; avg_cost_per_unit?: number } | null;
    strategicValue?: {
      base_score: number;
      competitor_bonus: number;
      has_competitor: boolean;
      internal_rel_count: number;
      prior_engagement_count: number;
      known_prospect_count: number;
      client_count: number;
      total_scored: number;
    } | null;
  };
}

export type CalendarScoringStatus = 'idle' | 'loading_basic' | 'scoring' | 'ready';

export type CalendarStore = {
  status: CalendarScoringStatus;
  rows: CalendarConferenceRow[];
  scoringProgress: { completed: number; total: number } | null;
  // Which conferenceIds have completed per-conference deep scoring (success or failure).
  // Only these should be shown in the program planner — others still show loading dots.
  fullyScored: Set<number>;
};

let _calendarStore: CalendarStore = { status: 'idle', rows: [], scoringProgress: null, fullyScored: new Set() };
const _calendarListeners = new Set<() => void>();

export function getCalendarStore(): CalendarStore { return _calendarStore; }

export function setCalendarStore(update: Partial<CalendarStore>) {
  _calendarStore = { ..._calendarStore, ...update };
  _calendarListeners.forEach(l => l());
}

export function subscribeCalendarStore(listener: () => void): () => void {
  _calendarListeners.add(listener);
  return () => _calendarListeners.delete(listener);
}

let _calendarScoringPromise: Promise<void> | null = null;

// Each per-conference score is a heavy synchronous computation (targeting engine
// scoring over every company/attendee) that runs on the same single-threaded
// Node event loop as every other API request. Firing them back-to-back as fast
// as possible starves unrelated requests on the same server instance — e.g. the
// Program Planner's Plan tab loading its own conference list at the same time.
// Spacing iterations out (and backing off further while this scoring isn't the
// thing the user is actually looking at) keeps that background work from
// stalling everything else on the page.
let _scoringDelayMs = 120;

export function setCalendarScoringPriority(foreground: boolean) {
  _scoringDelayMs = foreground ? 120 : 600;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function startCalendarScoring(force = false) {
  const status = _calendarStore.status;
  if (!force && (status === 'loading_basic' || status === 'scoring' || status === 'ready')) return;
  if (_calendarScoringPromise && !force) return;

  _calendarScoringPromise = (async () => {
    // Let whatever triggered this mount (the page's own critical data fetches)
    // get its requests in flight first, rather than racing them from tick zero.
    await delay(300);
    setCalendarStore({ status: 'loading_basic', rows: [], scoringProgress: null, fullyScored: new Set() });
    try {
      const res = await fetch('/api/program-intelligence/calendar-intelligence', { cache: 'no-store' });
      if (!res.ok) { setCalendarStore({ status: 'idle' }); return; }
      const data = await res.json() as { conferences: CalendarConferenceRow[] };
      const basicRows = data.conferences ?? [];
      setCalendarStore({ rows: basicRows });
      if (basicRows.length === 0) { setCalendarStore({ status: 'ready' }); return; }

      setCalendarStore({ status: 'scoring', scoringProgress: { completed: 0, total: basicRows.length } });
      let completed = 0;
      for (const row of basicRows) {
        if (completed > 0) await delay(_scoringDelayMs);
        let updatedRows = _calendarStore.rows;
        try {
          const r = await fetch(`/api/program-intelligence/calendar-intelligence/${row.conferenceId}`, { cache: 'no-store' });
          if (r.ok) {
            const scored = ((await r.json()) as { conference: CalendarConferenceRow }).conference;
            updatedRows = _calendarStore.rows.map(x => x.conferenceId === scored.conferenceId ? scored : x);
          }
        } catch { /* skip */ }
        completed++;
        // Mark this conference as fully scored (whether the deep fetch succeeded or not)
        const newFullyScored = new Set(_calendarStore.fullyScored);
        newFullyScored.add(row.conferenceId);
        setCalendarStore({
          rows: updatedRows,
          scoringProgress: { completed, total: basicRows.length },
          fullyScored: newFullyScored,
        });
      }
      setCalendarStore({ status: 'ready', scoringProgress: null });
    } catch {
      setCalendarStore({ status: 'idle' });
    }
  })().finally(() => { _calendarScoringPromise = null; });
}

export async function refreshConferenceScore(conferenceId: number) {
  try {
    const r = await fetch(`/api/program-intelligence/calendar-intelligence/${conferenceId}`, { cache: 'no-store' });
    if (r.ok) {
      const scored = ((await r.json()) as { conference: CalendarConferenceRow }).conference;
      const newFullyScored = new Set(_calendarStore.fullyScored);
      newFullyScored.add(conferenceId);
      setCalendarStore({
        rows: _calendarStore.rows.map(x => x.conferenceId === scored.conferenceId ? scored : x),
        fullyScored: newFullyScored,
      });
    }
  } catch { /* non-fatal */ }
}
