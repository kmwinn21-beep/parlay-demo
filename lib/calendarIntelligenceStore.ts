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
};

let _calendarStore: CalendarStore = { status: 'idle', rows: [], scoringProgress: null };
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

export function startCalendarScoring(force = false) {
  const status = _calendarStore.status;
  if (!force && (status === 'loading_basic' || status === 'scoring' || status === 'ready')) return;
  if (_calendarScoringPromise && !force) return;

  _calendarScoringPromise = (async () => {
    setCalendarStore({ status: 'loading_basic', rows: [], scoringProgress: null });
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
        try {
          const r = await fetch(`/api/program-intelligence/calendar-intelligence/${row.conferenceId}`, { cache: 'no-store' });
          if (r.ok) {
            const scored = ((await r.json()) as { conference: CalendarConferenceRow }).conference;
            setCalendarStore({ rows: _calendarStore.rows.map(x => x.conferenceId === scored.conferenceId ? scored : x) });
          }
        } catch { /* skip */ }
        completed++;
        setCalendarStore({ scoringProgress: { completed, total: basicRows.length } });
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
      setCalendarStore({ rows: _calendarStore.rows.map(x => x.conferenceId === scored.conferenceId ? scored : x) });
    }
  } catch { /* non-fatal */ }
}
