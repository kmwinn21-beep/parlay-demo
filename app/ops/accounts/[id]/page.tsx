'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface AccountDetail {
  id: string;
  company_name: string;
  admin_email: string;
  admin_first_name: string | null;
  admin_last_name: string | null;
  plan_id: string;
  trial_expires_at: string | null;
  grace_period_ends_at: string | null;
  activated_plan_at: string | null;
  onboarding_track: string | null;
  onboarding_completed: number;
  deployment_url: string | null;
  signup_role: string | null;
  signup_industry: string | null;
  signup_team_size: string | null;
  signup_conferences_per_year: string | null;
  signup_primary_goal: string | null;
  signup_current_tool: string | null;
  last_active_at: string | null;
  created_at: string;
}

interface TenantUser {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  active: number;
  last_seen_at: string | null;
  login_count?: number;
}

interface TimelineEvent {
  event: string;
  timestamp: string;
}

interface SetupProgress {
  account_created: boolean;
  conference_added: boolean;
  attendees_uploaded: boolean;
  icp_configured: boolean;
  team_invited: boolean;
  budget_saved: boolean;
}

interface TenantMetrics {
  conferences_count: number;
  attendees_count: number;
  meetings_count: number;
  followups_completed: number;
  companies_count: number;
  first_conf_at: string | null;
  first_upload_at: string | null;
  first_invite_at: string | null;
}

interface EventSummaryRow {
  event_type: string;
  count: number;
  last_at: string;
}

interface FeatureUsageRow {
  feature_key: string;
  total_uses: number;
  last_used: string;
}

interface DaySession {
  day: string;
  logins: number;
}

interface AccountData {
  account: AccountDetail;
  users: TenantUser[];
  timeline: TimelineEvent[];
  healthScore: number;
  tenantMetrics: TenantMetrics;
  setupProgress: SetupProgress;
  eventSummary: EventSummaryRow[];
  featureUsage: FeatureUsageRow[];
  dailySessions: DaySession[];
  weekOverWeek: { thisWeek: number; lastWeek: number };
  sessionSummary: { totalSessions: number; activeDays: number; lastSession: string | null };
}

const PLAN_IDS = ['trial', 'essentials', 'professional', 'enterprise'] as const;
const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  trial: { label: 'Trial', cls: 'bg-amber-100 text-amber-800' },
  essentials: { label: 'Essentials', cls: 'bg-gray-100 text-gray-800' },
  professional: { label: 'Professional', cls: 'bg-blue-100 text-blue-800' },
  enterprise: { label: 'Enterprise', cls: 'bg-green-100 text-green-800' },
};

const FEATURE_LABELS: Record<string, string> = {
  effectiveness: 'Conference Effectiveness',
  budget: 'Budget',
  icp_rules: 'ICP Rules',
  floor_notes: 'Floor Notes',
  meetings: 'Meetings',
  meeting_ai: 'Meeting AI',
  badge_scan: 'Badge Scan',
  booth_capture: 'Booth Capture',
  ai_effectiveness_summary: 'AI Summary',
};

const EVENT_LABELS: Record<string, string> = {
  user_login: 'Logins',
  conference_created: 'Conferences created',
  attendee_list_uploaded: 'Attendee uploads',
  budget_saved: 'Budget saves',
  icp_saved: 'ICP saves',
  note_created: 'Notes created',
  meeting_created: 'Meetings created',
  ai_analysis: 'AI analyses',
  followup_completed: 'Follow-ups completed',
  user_invited: 'Users invited',
  badge_scan: 'Badge scans',
  booth_scan: 'Booth scans',
};

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60_000) return rtf.format(-Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(-Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(-Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return rtf.format(-Math.round(diff / 86_400_000), 'day');
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function trialStatusLabel(account: AccountDetail): { label: string; color: string } {
  if (account.plan_id !== 'trial') return { label: '', color: '' };
  const now = Date.now();
  const expires = account.trial_expires_at ? new Date(account.trial_expires_at).getTime() : null;
  const grace = account.grace_period_ends_at ? new Date(account.grace_period_ends_at).getTime() : null;
  if (!expires) return { label: '', color: '' };
  if (now < expires) {
    const days = Math.ceil((expires - now) / 86_400_000);
    return { label: `${days}d remaining`, color: days <= 3 ? 'text-amber-600' : 'text-green-700' };
  }
  if (grace && now < grace) {
    const days = Math.ceil((grace - now) / 86_400_000);
    return { label: `Grace — ${days}d left`, color: 'text-red-600' };
  }
  return { label: 'Expired', color: 'text-red-600' };
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  const label = score >= 70 ? 'Healthy' : score >= 40 ? 'Needs attention' : 'At risk';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className="h-2 rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-sm font-semibold tabular-nums" style={{ color }}>{score}%</span>
      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: color }}>{label}</span>
    </div>
  );
}

function SetupStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-500' : 'bg-gray-200'}`}>
        {done ? (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <div className="w-2 h-2 rounded-full bg-gray-400" />
        )}
      </div>
      <span className={done ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
    </div>
  );
}

function ActivityBar({ day, logins, max }: { day: string; logins: number; max: number }) {
  const height = max > 0 ? Math.max((logins / max) * 48, logins > 0 ? 4 : 0) : 0;
  const label = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="w-full flex items-end justify-center" style={{ height: 52 }}>
        <div
          className="w-full max-w-[20px] rounded-t transition-all"
          style={{ height, backgroundColor: logins > 0 ? '#3b82f6' : '#e5e7eb' }}
          title={`${label}: ${logins} login${logins !== 1 ? 's' : ''}`}
        />
      </div>
      {/* Only show label on first/last/mid */}
      <span className="text-[9px] text-gray-400 leading-none hidden" aria-hidden="true">{label}</span>
    </div>
  );
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Plan change state
  const [pendingPlan, setPendingPlan] = useState<string>('');
  const [planConfirming, setPlanConfirming] = useState(false);
  const [planWorking, setPlanWorking] = useState(false);
  const [planMsg, setPlanMsg] = useState('');

  // Trial extend state
  const [extendDays, setExtendDays] = useState(7);
  const [extendConfirming, setExtendConfirming] = useState(false);
  const [extendWorking, setExtendWorking] = useState(false);
  const [trialMsg, setTrialMsg] = useState('');

  // Expire trial state
  const [expireConfirming, setExpireConfirming] = useState(false);
  const [expireWorking, setExpireWorking] = useState(false);

  // Test email state
  const [testTemplate, setTestTemplate] = useState<'welcome' | 'trial_reminder' | 'invite'>('welcome');
  const [testTo, setTestTo] = useState('');
  const [testTrack, setTestTrack] = useState<'track_a' | 'track_b'>('track_a');
  const [testDays, setTestDays] = useState(3);
  const [testWorking, setTestWorking] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  // User deactivate/reactivate
  const [userWorking, setUserWorking] = useState<Record<number, boolean>>({});
  const [userConfirm, setUserConfirm] = useState<Record<number, boolean>>({});
  const [userMsg, setUserMsg] = useState<Record<number, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/ops/accounts/${id}`)
      .then(r => r.json())
      .then((d: AccountData & { error?: string }) => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setData(d);
        if (d.account?.admin_email) setTestTo(d.account.admin_email);
        if (d.account?.onboarding_track === 'track_b') setTestTrack('track_b');
        setLoading(false);
      })
      .catch(() => { setError('Failed to load.'); setLoading(false); });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changePlan() {
    if (!pendingPlan || !data?.account) return;
    setPlanWorking(true);
    const res = await fetch(`/api/ops/accounts/${id}/plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: pendingPlan }),
    });
    setPlanWorking(false);
    if (res.ok) {
      setPlanMsg(`Plan changed to ${pendingPlan}.`);
      setPlanConfirming(false);
      setPendingPlan('');
      load();
    } else {
      const d = await res.json();
      setPlanMsg(d.error ?? 'Failed to change plan.');
    }
  }

  async function extendTrial() {
    setExtendWorking(true);
    const res = await fetch(`/api/ops/accounts/${id}/trial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'extend', days: extendDays }),
    });
    setExtendWorking(false);
    if (res.ok) {
      setTrialMsg(`Trial extended by ${extendDays} days.`);
      setExtendConfirming(false);
      load();
    } else {
      const d = await res.json();
      setTrialMsg(d.error ?? 'Failed to extend trial.');
    }
  }

  async function expireTrial() {
    setExpireWorking(true);
    const res = await fetch(`/api/ops/accounts/${id}/trial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'expire' }),
    });
    setExpireWorking(false);
    if (res.ok) {
      setTrialMsg('Trial expired.');
      setExpireConfirming(false);
      load();
    } else {
      const d = await res.json();
      setTrialMsg(d.error ?? 'Failed to expire trial.');
    }
  }

  async function toggleUser(userId: number, currentActive: number) {
    setUserWorking(w => ({ ...w, [userId]: true }));
    const res = await fetch(`/api/ops/accounts/${id}/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: currentActive === 0 }),
    });
    setUserWorking(w => ({ ...w, [userId]: false }));
    setUserConfirm(c => ({ ...c, [userId]: false }));
    if (res.ok) {
      setUserMsg(m => ({ ...m, [userId]: currentActive === 0 ? 'Reactivated.' : 'Deactivated.' }));
      load();
    } else {
      const d = await res.json();
      setUserMsg(m => ({ ...m, [userId]: d.error ?? 'Failed.' }));
    }
  }

  async function startImpersonation() {
    const res = await fetch(`/api/ops/accounts/${id}/impersonate`, { method: 'POST' });
    if (res.ok) router.push('/');
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>
  );
  if (error || !data) return (
    <div className="text-red-600 text-sm py-8">{error ?? 'Not found.'}</div>
  );

  const { account, users, timeline, healthScore, tenantMetrics, setupProgress, eventSummary, featureUsage, dailySessions, weekOverWeek, sessionSummary } = data;
  const badge = PLAN_BADGE[account.plan_id] ?? { label: account.plan_id, cls: 'bg-gray-100 text-gray-700' };
  const trial = trialStatusLabel(account);
  const maxLogins = Math.max(...dailySessions.map(d => d.logins), 1);
  const setupDone = Object.values(setupProgress).filter(Boolean).length;
  const setupTotal = Object.keys(setupProgress).length;
  const wowDelta = weekOverWeek.lastWeek > 0
    ? Math.round(((weekOverWeek.thisWeek - weekOverWeek.lastWeek) / weekOverWeek.lastWeek) * 100)
    : weekOverWeek.thisWeek > 0 ? 100 : 0;

  return (
    <div className="max-w-6xl space-y-6">
      <Link href="/ops/accounts" className="text-sm text-gray-500 hover:text-gray-800 inline-block">
        ← All accounts
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{account.company_name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
              {badge.label}
            </span>
            {trial.label && (
              <span className={`text-sm font-medium ${trial.color}`}>{trial.label}</span>
            )}
            <span className="text-xs text-gray-400">Created {relativeTime(account.created_at)}</span>
          </div>
        </div>
        <button
          onClick={startImpersonation}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-700"
        >
          View as customer →
        </button>
      </div>

      {/* Health Banner */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Account Health</h2>
          <span className="text-xs text-gray-400">Based on setup, activity, feature usage & engagement</span>
        </div>
        <HealthBar score={healthScore} />
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900 tabular-nums">{tenantMetrics.conferences_count}</div>
            <div className="text-xs text-gray-500">Conferences</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900 tabular-nums">{tenantMetrics.attendees_count.toLocaleString()}</div>
            <div className="text-xs text-gray-500">Attendees</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900 tabular-nums">{tenantMetrics.meetings_count}</div>
            <div className="text-xs text-gray-500">Meetings</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900 tabular-nums">{tenantMetrics.followups_completed}</div>
            <div className="text-xs text-gray-500">Follow-ups done</div>
          </div>
        </div>
      </div>

      {/* 3-col grid: Setup Progress, Login Activity, Feature Adoption */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Setup Progress */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Setup Progress</h2>
            <span className="text-xs text-gray-500 tabular-nums">{setupDone}/{setupTotal}</span>
          </div>
          <div className="space-y-2.5">
            <SetupStep label="Account created" done={setupProgress.account_created} />
            <SetupStep label="Conference added" done={setupProgress.conference_added} />
            <SetupStep label="Attendees uploaded" done={setupProgress.attendees_uploaded} />
            <SetupStep label="ICP configured" done={setupProgress.icp_configured} />
            <SetupStep label="Team invited" done={setupProgress.team_invited} />
            <SetupStep label="Budget saved" done={setupProgress.budget_saved} />
          </div>
        </div>

        {/* Login Activity Chart */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Login Activity</h2>
            <span className="text-xs text-gray-400">Last 14 days</span>
          </div>
          <div className="flex items-end gap-0.5 mb-2" style={{ height: 64 }}>
            {dailySessions.map(d => (
              <ActivityBar key={d.day} day={d.day} logins={d.logins} max={maxLogins} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-3">
            <span>{new Date(dailySessions[0]?.day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span>Today</span>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
            <div>
              <div className="text-base font-bold text-gray-900 tabular-nums">{sessionSummary.totalSessions}</div>
              <div className="text-[10px] text-gray-400">Sessions (30d)</div>
            </div>
            <div>
              <div className="text-base font-bold text-gray-900 tabular-nums">{sessionSummary.activeDays}</div>
              <div className="text-[10px] text-gray-400">Active days</div>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-base font-bold text-gray-900 tabular-nums">{weekOverWeek.thisWeek}</span>
                {weekOverWeek.lastWeek > 0 && (
                  <span className={`text-[10px] font-semibold ${wowDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {wowDelta >= 0 ? '+' : ''}{wowDelta}%
                  </span>
                )}
              </div>
              <div className="text-[10px] text-gray-400">Events (7d)</div>
            </div>
          </div>
        </div>

        {/* Feature Adoption */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Feature Adoption</h2>
            <span className="text-xs text-gray-400">{featureUsage.length} feature{featureUsage.length !== 1 ? 's' : ''} used</span>
          </div>
          {featureUsage.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No feature usage recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {featureUsage.slice(0, 7).map(f => (
                <div key={f.feature_key}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-gray-700">{FEATURE_LABELS[f.feature_key] ?? f.feature_key}</span>
                    <span className="text-gray-500 tabular-nums">{f.total_uses}</span>
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-1 bg-blue-400 rounded-full"
                      style={{ width: `${Math.min((f.total_uses / (featureUsage[0]?.total_uses ?? 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {eventSummary.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">30-day events</div>
              <div className="space-y-1">
                {eventSummary.slice(0, 5).map(e => (
                  <div key={e.event_type} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{EVENT_LABELS[e.event_type] ?? e.event_type}</span>
                    <span className="font-medium text-gray-900 tabular-nums">{e.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Account info + plan controls */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Account info</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ['ID', account.id],
              ['Email', account.admin_email],
              ['Name', [account.admin_first_name, account.admin_last_name].filter(Boolean).join(' ') || '—'],
              ['Onboarding track', account.onboarding_track ?? '—'],
              ['Onboarding', account.onboarding_completed ? 'Complete' : 'Pending'],
              ['Last active', relativeTime(account.last_active_at)],
              ['Member since', formatDate(account.created_at)],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-gray-500 text-xs">{label}</dt>
                <dd className="font-medium text-gray-900 break-all text-sm">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Plan controls */}
          <div className="mt-6 border-t border-gray-100 pt-4 space-y-4">
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Change plan</div>
              {!planConfirming ? (
                <div className="flex gap-2">
                  <select
                    value={pendingPlan}
                    onChange={e => setPendingPlan(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select plan…</option>
                    {PLAN_IDS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <button
                    disabled={!pendingPlan}
                    onClick={() => setPlanConfirming(true)}
                    className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-40"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span>Confirm change to <strong>{pendingPlan}</strong>?</span>
                  <button onClick={changePlan} disabled={planWorking} className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 disabled:opacity-40">
                    {planWorking ? '...' : 'Confirm'}
                  </button>
                  <button onClick={() => setPlanConfirming(false)} className="text-gray-500 hover:text-gray-800">Cancel</button>
                </div>
              )}
              {planMsg && <div className="text-xs mt-1 text-gray-600">{planMsg}</div>}
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Extend trial</div>
              {!extendConfirming ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={365} value={extendDays}
                    onChange={e => setExtendDays(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-20 focus:outline-none"
                  />
                  <span className="text-sm text-gray-500">days</span>
                  <button onClick={() => setExtendConfirming(true)} className="text-sm bg-amber-500 text-white px-3 py-1.5 rounded-md hover:bg-amber-600">
                    Extend
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span>Add <strong>{extendDays} days</strong>?</span>
                  <button onClick={extendTrial} disabled={extendWorking} className="bg-amber-500 text-white px-3 py-1 rounded-md hover:bg-amber-600 disabled:opacity-40">
                    {extendWorking ? '...' : 'Confirm'}
                  </button>
                  <button onClick={() => setExtendConfirming(false)} className="text-gray-500 hover:text-gray-800">Cancel</button>
                </div>
              )}
              {trialMsg && <div className="text-xs mt-1 text-gray-600">{trialMsg}</div>}
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Expire trial now</div>
              {!expireConfirming ? (
                <button onClick={() => setExpireConfirming(true)} className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700">
                  Expire trial
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-red-600 font-medium">Are you sure?</span>
                  <button onClick={expireTrial} disabled={expireWorking} className="bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700 disabled:opacity-40">
                    {expireWorking ? '...' : 'Confirm'}
                  </button>
                  <button onClick={() => setExpireConfirming(false)} className="text-gray-500 hover:text-gray-800">Cancel</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Signup responses + test email */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Signup responses</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[
                ['Role', account.signup_role],
                ['Industry', account.signup_industry],
                ['Team size', account.signup_team_size],
                ['Conf. / year', account.signup_conferences_per_year],
                ['Primary goal', account.signup_primary_goal],
                ['Current tool', account.signup_current_tool],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-gray-500 text-xs">{label}</dt>
                  <dd className={value ? 'font-medium text-gray-900 text-sm' : 'text-gray-400 italic text-sm'}>
                    {value || 'Not provided'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Send test email</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Template</label>
                <select
                  value={testTemplate}
                  onChange={e => { setTestTemplate(e.target.value as typeof testTemplate); setTestMsg(null); }}
                  className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="welcome">Welcome email</option>
                  <option value="trial_reminder">Trial reminder</option>
                  <option value="invite">Team invite</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input type="email" value={testTo} onChange={e => setTestTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" />
              </div>
              {testTemplate === 'welcome' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Track</label>
                  <select value={testTrack} onChange={e => setTestTrack(e.target.value as 'track_a' | 'track_b')}
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm">
                    <option value="track_a">Track A — upcoming conference</option>
                    <option value="track_b">Track B — planning calendar</option>
                  </select>
                </div>
              )}
              {testTemplate === 'trial_reminder' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Days remaining (1–3)</label>
                  <input type="number" min={1} max={3} value={testDays} onChange={e => setTestDays(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" />
                </div>
              )}
              <button
                disabled={testWorking || !testTo}
                onClick={async () => {
                  setTestWorking(true); setTestMsg(null);
                  try {
                    const res = await fetch(`/api/ops/accounts/${id}/test-email`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ template: testTemplate, to: testTo, track: testTrack, days: testDays }),
                    });
                    const d = await res.json() as { success?: boolean; error?: string };
                    setTestMsg(d.success ? '✓ Sent — check your inbox' : `Error: ${d.error ?? 'Unknown'}`);
                  } catch { setTestMsg('Error: request failed'); }
                  finally { setTestWorking(false); }
                }}
                className="w-full py-1.5 bg-gray-700 text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {testWorking ? 'Sending…' : 'Send test email'}
              </button>
              {testMsg && (
                <p className={`text-xs ${testMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{testMsg}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Users</h2>
        {users.length === 0 ? (
          <p className="text-sm text-gray-400">No user data available (tenant DB not connected).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Last active</th>
                  <th className="pb-2 pr-4 text-right">Logins</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {(users as TenantUser[]).map(u => (
                  <tr key={u.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium">{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className="py-2 pr-4 text-gray-600">{u.email}</td>
                    <td className="py-2 pr-4 text-gray-600 capitalize">{u.role}</td>
                    <td className="py-2 pr-4 text-gray-500 text-xs">{relativeTime(u.last_seen_at)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-700">{u.login_count ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={u.active ? 'text-green-700' : 'text-gray-400'}>{u.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="py-2 text-right">
                      {userMsg[u.id] ? (
                        <span className="text-xs text-gray-500">{userMsg[u.id]}</span>
                      ) : !userConfirm[u.id] ? (
                        <button
                          onClick={() => setUserConfirm(c => ({ ...c, [u.id]: true }))}
                          className="text-xs text-gray-500 hover:text-gray-800 underline"
                        >
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 justify-end text-xs">
                          <span>Sure?</span>
                          <button onClick={() => toggleUser(u.id, u.active)} disabled={userWorking[u.id]}
                            className="text-red-600 hover:text-red-800 disabled:opacity-40 underline">
                            {userWorking[u.id] ? '...' : 'Yes'}
                          </button>
                          <button onClick={() => setUserConfirm(c => ({ ...c, [u.id]: false }))} className="text-gray-400 hover:text-gray-600">No</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-400">No events available.</p>
        ) : (
          <ol className="relative border-l border-gray-200 ml-2 space-y-4">
            {timeline.map((event, i) => (
              <li key={i} className="ml-4">
                <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-gray-300 border-2 border-white" />
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-800">{event.event}</span>
                  <span className="text-xs text-gray-400">{relativeTime(event.timestamp)}</span>
                  <span className="text-xs text-gray-300">{formatDate(event.timestamp)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* Pending milestones */}
        {(!setupProgress.conference_added || !setupProgress.attendees_uploaded || !setupProgress.icp_configured) && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Pending milestones</div>
            <div className="space-y-2">
              {!setupProgress.conference_added && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-2 h-2 rounded-full border-2 border-dashed border-gray-300" />
                  First conference not yet added
                </div>
              )}
              {!setupProgress.attendees_uploaded && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-2 h-2 rounded-full border-2 border-dashed border-gray-300" />
                  No attendee list uploaded yet
                </div>
              )}
              {!setupProgress.icp_configured && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-2 h-2 rounded-full border-2 border-dashed border-gray-300" />
                  ICP rules not configured
                </div>
              )}
              {!setupProgress.team_invited && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-2 h-2 rounded-full border-2 border-dashed border-gray-300" />
                  No team members invited yet
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
