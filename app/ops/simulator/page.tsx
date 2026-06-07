'use client';

import React, { useState, useCallback, useMemo } from 'react';

interface PreflightChecks {
  effectivenessDefaults: { ok: boolean; missing: string[]; values: Record<string, number> }
  budget: { ok: boolean; totalSpend: number; requiredPipelineAmount: number | null }
  wse: { ok: boolean; totalIcp: number; withWse: number }
  icpAttendees: { ok: boolean; count: number }
}
interface PreflightResult {
  checks: PreflightChecks
  allOk: boolean
}

interface ConferenceItem {
  id: number;
  name: string;
  status: string | null;
  strategy: string | null;
  totalCost: number | null;
  attendeeCount: number;
  currentCes: number | null;
  hasSimulatedActivity: boolean;
  icpAttendeeCount?: number;
  hasSnapshot?: boolean;
  snapshotTakenAt?: string | null;
}

interface RepItem {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface SimulationPlan {
  meetingsScheduled: number;
  meetingsHeld: number;
  meetingsNoShow: number;
  followUpsCreated: number;
  followUpsCompleted: number;
  followUpsOpen: number;
  touchpoints: number;
  companiesEngaged: number;
  netNewLogos: number;
}

interface SimulationResult {
  plan: SimulationPlan;
  cesEstimate: { low: number; high: number };
  written: boolean;
  recordsWritten?: { meetings: number; followUps: number; touchpoints: number };
  warning?: string;
}

function cesTierLabel(score: number): string {
  if (score >= 90) return 'Exceptional';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Moderate';
  return 'Weak';
}

function cesTierColor(score: number): string {
  if (score >= 90) return 'text-green-700';
  if (score >= 75) return 'text-blue-700';
  if (score >= 60) return 'text-amber-700';
  return 'text-red-700';
}

function computeClientCES(
  meetingsHeld: number,
  touchpoints: number,
  followUpCompletionPct: number,
  icpAttendeeCount: number,
): { low: number; high: number } {
  const meetingsScheduled = Math.round(meetingsHeld / 0.85);
  const followUpsCreated = meetingsHeld + touchpoints;
  const holdRate = meetingsHeld / Math.max(meetingsScheduled, 1);
  const fuSchedulingRate = Math.min(followUpsCreated / Math.max(meetingsHeld, 1), 1);
  const dim2 = ((holdRate + fuSchedulingRate) / 2) * 100;
  const dim5 = followUpCompletionPct;

  // Client-side approximations for known dims
  // dim1 — assume engaged companies ≈ min(meetingsHeld, icpAttendeeCount) unique
  const estimatedEngaged = Math.min(meetingsHeld, icpAttendeeCount);
  const icpRate = Math.min(estimatedEngaged / Math.max(icpAttendeeCount, 1), 1);
  const dim1 = icpRate * 100;
  // dim4 — engagement breadth: same as icpRate
  const dim4 = dim1;

  // Uncertain dims: dim3 (pipeline), dim6 (net-new), dim7 (cost efficiency)
  // Weights: dim1=0.20, dim2=0.20, dim3=0.30, dim4=0.05, dim5=0.10, dim6=0.05, dim7=0.10
  // No pipeline target assumed client-side → redistribute dim3's 0.30 proportionally
  const w1 = 0.20, w2 = 0.20, w4 = 0.05, w5 = 0.10, w6 = 0.05, w7 = 0.10;
  const otherSum = w1 + w2 + w4 + w5 + w6 + w7;
  const scale = (otherSum + 0.30) / otherSum;
  const sw1 = w1 * scale, sw2 = w2 * scale, sw4 = w4 * scale, sw5 = w5 * scale, sw6 = w6 * scale, sw7 = w7 * scale;

  const dim6Optimistic = 60;
  const dim6Conservative = 0;
  const dim7Optimistic = 75;
  const dim7Conservative = 50;

  const high = Math.min(100, Math.round(
    dim1 * sw1 + dim2 * sw2 + dim4 * sw4 + dim5 * sw5 + dim6Optimistic * sw6 + dim7Optimistic * sw7
  ));
  const low = Math.min(100, Math.round(
    dim1 * sw1 + dim2 * sw2 + dim4 * sw4 + dim5 * sw5 + dim6Conservative * sw6 + dim7Conservative * sw7
  ));

  return { low: Math.max(0, low), high: Math.max(0, high) };
}

export default function SimulatorPage() {
  const [accountId, setAccountId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [conferences, setConferences] = useState<ConferenceItem[]>([]);
  const [reps, setReps] = useState<RepItem[]>([]);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState('');

  const [selectedConference, setSelectedConference] = useState<ConferenceItem | null>(null);
  const [selectedRepIds, setSelectedRepIds] = useState<Set<number>>(new Set());
  const [meetingsHeld, setMeetingsHeld] = useState(10);
  const [touchpointsCount, setTouchpointsCount] = useState(5);
  const [followUpCompletionPct, setFollowUpCompletionPct] = useState(75);
  const [icpAttendeeCount, setIcpAttendeeCount] = useState(0);

  const [previewResult, setPreviewResult] = useState<SimulationResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [confirmWrite, setConfirmWrite] = useState(false);
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeStatus, setWriteStatus] = useState('');

  const [confirmReset, setConfirmReset] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState('');

  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState('');
  const [snapshotError, setSnapshotError] = useState('');

  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState('');
  const [budgetInput, setBudgetInput] = useState(50000);
  const [fixLoading, setFixLoading] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!accountId.trim()) return;
    setLoadingAccount(true);
    setAccountError('');
    setConferences([]);
    setReps([]);
    setSelectedConference(null);
    setPreviewResult(null);
    setWriteStatus('');
    setResetStatus('');
    setIcpAttendeeCount(0);
    setPreflightResult(null);
    setPreflightError('');

    try {
      const [confsRes, repsRes] = await Promise.all([
        fetch(`/api/ops/simulate-conference-activity/accounts/${accountId.trim()}/conferences`),
        fetch(`/api/ops/simulate-conference-activity/accounts/${accountId.trim()}/reps`),
      ]);

      if (!confsRes.ok) {
        const err = await confsRes.json().catch(() => ({ error: 'Unknown error' }));
        setAccountError(err.error ?? 'Failed to load conferences');
        return;
      }
      if (!repsRes.ok) {
        const err = await repsRes.json().catch(() => ({ error: 'Unknown error' }));
        setAccountError(err.error ?? 'Failed to load reps');
        return;
      }

      const confsData = await confsRes.json();
      const repsData = await repsRes.json();

      setCompanyName(confsData.companyName ?? '');
      setConferences(confsData.conferences ?? []);
      setReps(repsData.reps ?? []);
      setSelectedRepIds(new Set((repsData.reps ?? []).map((r: RepItem) => r.id)));
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : 'Failed to load account');
    } finally {
      setLoadingAccount(false);
    }
  }, [accountId]);

  const handleConferenceChange = (id: string) => {
    const conf = conferences.find(c => c.id === Number(id));
    setSelectedConference(conf ?? null);
    setPreviewResult(null);
    setWriteStatus('');
    setResetStatus('');
    setConfirmWrite(false);
    setConfirmReset(false);
    setIcpAttendeeCount(conf?.icpAttendeeCount ?? 0);
    setMeetingsHeld(10);
    setTouchpointsCount(5);
    setPreflightResult(null);
    setPreflightError('');
    setSnapshotStatus('');
    setSnapshotError('');
  };

  const toggleRep = (id: number) => {
    setSelectedRepIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllReps = () => setSelectedRepIds(new Set(reps.map(r => r.id)));
  const deselectAllReps = () => setSelectedRepIds(new Set());

  const runSnapshot = async () => {
    if (!selectedConference) return;
    setSnapshotLoading(true);
    setSnapshotStatus('');
    setSnapshotError('');
    try {
      const res = await fetch('/api/ops/compute-conference-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accountId.trim(), conferenceId: selectedConference.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSnapshotError(data.error ?? 'Snapshot computation failed');
        return;
      }
      if (data.failed > 0) {
        setSnapshotError(`Failed: ${data.errors[0]?.error ?? 'Unknown error'}`);
      } else {
        setSnapshotStatus('Snapshot computed successfully.');
        // Refresh conference list to update hasSnapshot / snapshotTakenAt
        const confsRes = await fetch(`/api/ops/simulate-conference-activity/accounts/${accountId.trim()}/conferences`);
        if (confsRes.ok) {
          const confsData = await confsRes.json();
          setConferences(confsData.conferences ?? []);
          const updated = (confsData.conferences ?? []).find((c: ConferenceItem) => c.id === selectedConference.id);
          if (updated) setSelectedConference(updated);
        }
      }
    } catch (e) {
      setSnapshotError(e instanceof Error ? e.message : 'Snapshot computation failed');
    } finally {
      setSnapshotLoading(false);
    }
  };

  const followUpsCreated = meetingsHeld + touchpointsCount;
  const followUpsCompleted = Math.round(followUpsCreated * (followUpCompletionPct / 100));

  const liveEstimate = useMemo(
    () => computeClientCES(meetingsHeld, touchpointsCount, followUpCompletionPct, icpAttendeeCount),
    [meetingsHeld, touchpointsCount, followUpCompletionPct, icpAttendeeCount],
  );

  const runPreview = async () => {
    if (!selectedConference) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewResult(null);
    setConfirmWrite(false);
    setWriteStatus('');

    try {
      const res = await fetch('/api/ops/simulate-conference-activity/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          conferenceId: selectedConference.id,
          repIds: Array.from(selectedRepIds),
          meetingsHeld,
          touchpoints: touchpointsCount,
          followUpCompletionPct,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error ?? 'Preview failed');
        return;
      }
      setPreviewResult(data as SimulationResult);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const runWrite = async () => {
    if (!selectedConference || !previewResult) return;
    setWriteLoading(true);
    setWriteStatus('');

    try {
      const res = await fetch('/api/ops/simulate-conference-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          conferenceId: selectedConference.id,
          repIds: Array.from(selectedRepIds),
          meetingsHeld,
          touchpoints: touchpointsCount,
          followUpCompletionPct,
          dryRun: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWriteStatus(`Error: ${data.error ?? 'Write failed'}`);
        return;
      }
      const rw = data.recordsWritten;
      setWriteStatus(
        `Written: ${rw?.meetings ?? 0} meetings, ${rw?.followUps ?? 0} follow-ups, ${rw?.touchpoints ?? 0} touchpoints.`
      );
      setConfirmWrite(false);
      const confsRes = await fetch(`/api/ops/simulate-conference-activity/accounts/${accountId.trim()}/conferences`);
      if (confsRes.ok) {
        const confsData = await confsRes.json();
        setConferences(confsData.conferences ?? []);
        const updated = (confsData.conferences ?? []).find((c: ConferenceItem) => c.id === selectedConference.id);
        if (updated) setSelectedConference(updated);
      }
    } catch (e) {
      setWriteStatus(`Error: ${e instanceof Error ? e.message : 'Write failed'}`);
    } finally {
      setWriteLoading(false);
    }
  };

  const runReset = async () => {
    if (!selectedConference) return;
    setResetLoading(true);
    setResetStatus('');

    try {
      const res = await fetch('/api/ops/reset-simulated-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          conferenceId: selectedConference.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetStatus(`Error: ${data.error ?? 'Reset failed'}`);
        return;
      }
      const d = data.deleted;
      setResetStatus(
        `Deleted: ${d?.meetings ?? 0} meetings, ${d?.followUps ?? 0} follow-ups, ${d?.touchpoints ?? 0} touchpoints.`
      );
      setConfirmReset(false);
      setPreviewResult(null);
      setWriteStatus('');
      const confsRes = await fetch(`/api/ops/simulate-conference-activity/accounts/${accountId.trim()}/conferences`);
      if (confsRes.ok) {
        const confsData = await confsRes.json();
        setConferences(confsData.conferences ?? []);
        const updated = (confsData.conferences ?? []).find((c: ConferenceItem) => c.id === selectedConference.id);
        if (updated) setSelectedConference(updated);
      }
    } catch (e) {
      setResetStatus(`Error: ${e instanceof Error ? e.message : 'Reset failed'}`);
    } finally {
      setResetLoading(false);
    }
  };

  const runPreflight = async () => {
    if (!selectedConference) return;
    setPreflightLoading(true);
    setPreflightError('');
    setPreflightResult(null);
    try {
      const res = await fetch(
        `/api/ops/simulate-conference-activity/preflight?accountId=${encodeURIComponent(accountId.trim())}&conferenceId=${selectedConference.id}`
      );
      const data = await res.json();
      if (!res.ok) {
        setPreflightError(data.error ?? 'Preflight check failed');
        return;
      }
      setPreflightResult(data as PreflightResult);
    } catch (e) {
      setPreflightError(e instanceof Error ? e.message : 'Preflight check failed');
    } finally {
      setPreflightLoading(false);
    }
  };

  const runFix = async () => {
    if (!selectedConference || !preflightResult) return;
    setFixLoading(true);
    try {
      const { checks } = preflightResult;
      const fixes: {
        seedEffectivenessDefaults?: boolean;
        seedBudget?: { totalSpend: number };
        seedWse?: boolean;
      } = {};
      if (!checks.effectivenessDefaults.ok) fixes.seedEffectivenessDefaults = true;
      if (!checks.budget.ok) fixes.seedBudget = { totalSpend: budgetInput };
      if (!checks.wse.ok) fixes.seedWse = true;

      const res = await fetch('/api/ops/simulate-conference-activity/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          conferenceId: selectedConference.id,
          fixes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreflightError(data.error ?? 'Fix failed');
        return;
      }
      // Re-run preflight to refresh status
      await runPreflight();
    } catch (e) {
      setPreflightError(e instanceof Error ? e.message : 'Fix failed');
    } finally {
      setFixLoading(false);
    }
  };

  const renderLiveEstimate = () => {
    const { low, high } = liveEstimate;
    const lowLabel = cesTierLabel(low);
    const highLabel = cesTierLabel(high);
    const tierDisplay = lowLabel === highLabel
      ? <span className={cesTierColor(low)}>{lowLabel}</span>
      : (
        <>
          <span className={cesTierColor(low)}>{lowLabel}</span>
          {' → '}
          <span className={cesTierColor(high)}>{highLabel}</span>
        </>
      );

    return (
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estimated CES</p>
        </div>
        <div className="px-3 py-3 space-y-1">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{low} — {high}</p>
          <p className="text-sm font-medium">{tierDisplay}</p>
        </div>
        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">
            Range reflects uncertainty in pipeline influence and cost efficiency dimensions.
            Actual CES computes from written activity.
          </p>
        </div>
      </div>
    );
  };

  const renderPreviewBlock = (result: SimulationResult) => {
    if (result.warning) {
      return (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {result.warning}
        </p>
      );
    }

    const { plan, cesEstimate } = result;

    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Activity to be written</p>
        <div className="border border-gray-200 rounded-md overflow-hidden divide-y divide-gray-100">
          <div className="flex items-baseline justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">Meetings</span>
            <span className="text-gray-900 tabular-nums">
              <span className="font-semibold">{plan.meetingsHeld}</span>
              <span className="text-gray-400"> ({plan.meetingsScheduled} scheduled · {plan.meetingsNoShow} no-show)</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">Follow-ups</span>
            <span className="text-gray-900 tabular-nums">
              <span className="font-semibold">{plan.followUpsCreated}</span>
              <span className="text-gray-400"> ({plan.followUpsCompleted} completed · {plan.followUpsOpen} open)</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">Touchpoints</span>
            <span className="font-semibold text-gray-900 tabular-nums">{plan.touchpoints}</span>
          </div>
          <div className="flex items-baseline justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">Companies</span>
            <span className="font-semibold text-gray-900 tabular-nums">{plan.companiesEngaged}</span>
          </div>
          <div className="flex items-baseline justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">Net-new logos</span>
            <span className="font-semibold text-gray-900 tabular-nums">{plan.netNewLogos}</span>
          </div>
          <div className="flex items-baseline justify-between px-3 py-2 text-sm bg-gray-50">
            <span className="text-gray-500">Estimated CES</span>
            <span className="font-semibold text-gray-900 tabular-nums">{cesEstimate.low}–{cesEstimate.high}</span>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Actual CES computes from written activity after simulation runs.
        </p>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Conference Activity Simulator</h1>

      {/* Step 1: Account */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Step 1 — Account</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadAccount()}
            onBlur={loadAccount}
            placeholder="Account ID"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full sm:w-64"
          />
          <button
            onClick={loadAccount}
            disabled={loadingAccount}
            className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50 sm:flex-shrink-0"
          >
            {loadingAccount ? 'Loading...' : 'Load'}
          </button>
        </div>
        {accountError && <p className="mt-2 text-sm text-red-600">{accountError}</p>}
        {companyName && !accountError && (
          <p className="mt-2 text-sm text-gray-600">Account: <span className="font-medium text-gray-900">{companyName}</span></p>
        )}
      </div>

      {/* Step 2: Conference selector */}
      {conferences.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 2 — Conference</h2>
          <select
            value={selectedConference?.id ?? ''}
            onChange={e => handleConferenceChange(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full"
          >
            <option value="">Select a conference...</option>
            {conferences.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} · CES {c.currentCes ?? '—'} · {c.status ?? 'unknown'}
              </option>
            ))}
          </select>
          {selectedConference?.hasSimulatedActivity && (
            <span className="mt-2 inline-block text-xs bg-amber-100 text-amber-800 border border-amber-300 rounded px-2 py-0.5">
              simulated data exists
            </span>
          )}
        </div>
      )}

      {/* Step 3: Rep selector */}
      {selectedConference && reps.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 3 — Reps</h2>
          <div className="flex gap-2 mb-3">
            <button
              onClick={selectAllReps}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Select all
            </button>
            <span className="text-xs text-gray-400">/</span>
            <button
              onClick={deselectAllReps}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Deselect all
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {reps.map(rep => (
              <label key={rep.id} className="flex items-center gap-2 text-sm cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={selectedRepIds.has(rep.id)}
                  onChange={() => toggleRep(rep.id)}
                  className="rounded flex-shrink-0"
                />
                <span className="text-gray-900 flex-shrink-0">{rep.name}</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">Rep</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Environment Setup (pre-flight) */}
      {selectedConference && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 4 — Environment Setup</h2>
          <button
            onClick={runPreflight}
            disabled={preflightLoading}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            {preflightLoading ? 'Checking...' : 'Run Pre-flight Check'}
          </button>
          {preflightError && <p className="mt-2 text-sm text-red-600">{preflightError}</p>}
          {preflightResult && (
            <div className="mt-4 space-y-3">
              {/* Check: Effectiveness Defaults */}
              <div className="border border-gray-200 rounded-md p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={preflightResult.checks.effectivenessDefaults.ok ? 'text-green-600' : 'text-red-600'}>
                    {preflightResult.checks.effectivenessDefaults.ok ? '✓' : '✗'}
                  </span>
                  <span className="text-sm font-medium text-gray-900">Effectiveness defaults</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {Object.keys(preflightResult.checks.effectivenessDefaults.values).length}/5 keys configured
                  </span>
                </div>
                {!preflightResult.checks.effectivenessDefaults.ok && (
                  <p className="text-xs text-gray-500 pl-5">
                    Missing: {preflightResult.checks.effectivenessDefaults.missing.join(', ')}
                  </p>
                )}
              </div>

              {/* Check: Budget */}
              <div className="border border-gray-200 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={preflightResult.checks.budget.ok ? 'text-green-600' : 'text-red-600'}>
                    {preflightResult.checks.budget.ok ? '✓' : '✗'}
                  </span>
                  <span className="text-sm font-medium text-gray-900">Conference budget</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {preflightResult.checks.budget.ok
                      ? `$${preflightResult.checks.budget.totalSpend.toLocaleString()} spend`
                      : 'No spend data'}
                  </span>
                </div>
                {!preflightResult.checks.budget.ok && (
                  <div className="flex items-center gap-2 pl-5">
                    <label className="text-xs text-gray-600">Event spend:</label>
                    <input
                      type="number"
                      min={1}
                      value={budgetInput}
                      onChange={e => setBudgetInput(Number(e.target.value))}
                      className="border border-gray-300 rounded px-2 py-0.5 text-sm w-32 tabular-nums"
                    />
                  </div>
                )}
              </div>

              {/* Check: WSE */}
              <div className="border border-gray-200 rounded-md p-3 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={preflightResult.checks.wse.ok ? 'text-green-600' : 'text-red-600'}>
                    {preflightResult.checks.wse.ok ? '✓' : '✗'}
                  </span>
                  <span className="text-sm font-medium text-gray-900">ICP company deal values</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {preflightResult.checks.wse.withWse}/{preflightResult.checks.wse.totalIcp} companies have WSE values
                  </span>
                </div>
                {!preflightResult.checks.wse.ok && (
                  <span className="ml-5 inline-block text-xs bg-amber-100 text-amber-800 border border-amber-200 rounded px-2 py-0.5">
                    {preflightResult.checks.wse.totalIcp - preflightResult.checks.wse.withWse} missing — will auto-assign on Fix
                  </span>
                )}
              </div>

              {/* Check: ICP Attendees */}
              <div className="border border-gray-200 rounded-md p-3">
                <div className="flex items-center gap-2">
                  <span className={preflightResult.checks.icpAttendees.ok ? 'text-green-600' : 'text-red-600'}>
                    {preflightResult.checks.icpAttendees.ok ? '✓' : '✗'}
                  </span>
                  <span className="text-sm font-medium text-gray-900">ICP attendees</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {preflightResult.checks.icpAttendees.count} ICP-matched attendees
                  </span>
                </div>
              </div>

              {!preflightResult.allOk && (
                <div className="space-y-2">
                  <button
                    onClick={runFix}
                    disabled={fixLoading}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {fixLoading ? 'Fixing...' : 'Fix All Issues'}
                  </button>
                  <p className="text-xs text-amber-700">
                    WSE values assigned to companies are permanent and will affect CES calculations for all conferences.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 5: Activity sliders */}
      {selectedConference && preflightResult?.allOk === true && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 5 — Activity Volume</h2>
          <div className="space-y-5">
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-sm text-gray-700">Meetings held</label>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{meetingsHeld}</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(icpAttendeeCount, meetingsHeld, 1)}
                step={1}
                value={meetingsHeld}
                onChange={e => setMeetingsHeld(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>0</span>
                <span>{Math.max(icpAttendeeCount, meetingsHeld, 1)}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-sm text-gray-700">Touchpoints</label>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{touchpointsCount}</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(icpAttendeeCount * 2, touchpointsCount, 1)}
                step={1}
                value={touchpointsCount}
                onChange={e => setTouchpointsCount(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>0</span>
                <span>{Math.max(icpAttendeeCount * 2, touchpointsCount, 1)}</span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-gray-500">Follow-ups created</span>
                <span className="font-semibold text-gray-900 tabular-nums">{followUpsCreated}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Follow-up completion</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={followUpCompletionPct}
                    onChange={e => setFollowUpCompletionPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="border border-gray-300 rounded px-2 py-0.5 text-sm w-16 tabular-nums text-right"
                  />
                  <span className="text-gray-500 text-sm">%</span>
                </div>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-gray-500">Follow-ups completed</span>
                <span className="font-semibold text-gray-900 tabular-nums">{followUpsCompleted}</span>
              </div>
            </div>

            <p className="text-xs text-gray-400">
              Follow-ups are auto-created from meetings held and touchpoints per system behavior.
            </p>
          </div>
        </div>
      )}

      {/* Step 6: Live CES estimate */}
      {selectedConference && preflightResult?.allOk === true && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 6 — CES Estimate</h2>
          {renderLiveEstimate()}
        </div>
      )}

      {/* Step 7: Preview */}
      {selectedConference && preflightResult?.allOk === true && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 7 — Preview</h2>
          <button
            onClick={runPreview}
            disabled={previewLoading}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {previewLoading ? 'Computing...' : 'Preview simulation'}
          </button>
          {previewError && <p className="mt-2 text-sm text-red-600">{previewError}</p>}
          {previewResult && (
            <div className="mt-4">
              {renderPreviewBlock(previewResult)}
            </div>
          )}
        </div>
      )}

      {/* Step 8: Write */}
      {selectedConference && preflightResult?.allOk === true && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 8 — Write</h2>
          {!previewResult ? (
            <p className="text-sm text-gray-500">Run preview first before writing.</p>
          ) : !confirmWrite ? (
            <button
              onClick={() => setConfirmWrite(true)}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 w-full sm:w-auto"
            >
              Write simulation to {selectedConference?.name}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-gray-700 space-y-1">
                <p>Writing to <strong>{selectedConference.name}</strong> ({companyName || accountId}):</p>
                <ul className="list-disc list-inside text-gray-600 space-y-0.5 pl-1">
                  <li>{previewResult.plan.meetingsScheduled} meetings ({previewResult.plan.meetingsHeld} held)</li>
                  <li>{previewResult.plan.followUpsCreated} follow-ups ({previewResult.plan.followUpsCompleted} completed)</li>
                  <li>{previewResult.plan.touchpoints} touchpoints</li>
                  <li>{previewResult.plan.companiesEngaged} companies engaged</li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={runWrite}
                  disabled={writeLoading}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {writeLoading ? 'Writing...' : 'Confirm write'}
                </button>
                <button
                  onClick={() => setConfirmWrite(false)}
                  className="px-3 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {writeStatus && (
            <p className={`mt-2 text-sm ${writeStatus.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
              {writeStatus}
            </p>
          )}
        </div>
      )}

      {/* Step 9: Reset */}
      {selectedConference?.hasSimulatedActivity && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 9 — Reset Simulated Activity</h2>
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="px-4 py-2 border border-red-300 text-red-700 text-sm rounded-md hover:bg-red-50 w-full sm:w-auto"
            >
              Reset simulated activity
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Permanently delete all <code className="text-xs bg-gray-100 px-1 rounded">source=simulated</code> records for <strong>{selectedConference.name}</strong>. Cannot be undone.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={runReset}
                  disabled={resetLoading}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {resetLoading ? 'Resetting...' : 'Confirm reset'}
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {resetStatus && (
            <p className={`mt-2 text-sm ${resetStatus.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
              {resetStatus}
            </p>
          )}
        </div>
      )}

      {/* Conference Snapshots */}
      {selectedConference && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Conference Snapshots</h2>
          <div className="space-y-3">
            <div className="border border-gray-200 rounded-md p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{selectedConference.name}</p>
                {selectedConference.hasSnapshot ? (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Snapshot taken {selectedConference.snapshotTakenAt
                      ? new Date(selectedConference.snapshotTakenAt).toLocaleString()
                      : '—'}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5">No snapshot yet</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${
                selectedConference.hasSnapshot
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200'
              }`}>
                {selectedConference.hasSnapshot ? 'computed' : 'missing'}
              </span>
            </div>
            <button
              onClick={runSnapshot}
              disabled={snapshotLoading}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              {snapshotLoading ? 'Computing...' : selectedConference.hasSnapshot ? 'Recompute Snapshot' : 'Compute Snapshot'}
            </button>
            {snapshotError && <p className="text-sm text-red-600">{snapshotError}</p>}
            {snapshotStatus && <p className="text-sm text-green-700">{snapshotStatus}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
