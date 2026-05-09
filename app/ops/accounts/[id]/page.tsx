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
  last_active_at: string | null;
}

interface TimelineEvent {
  type: string;
  label: string;
  at: string;
}

const PLAN_IDS = ['trial', 'essentials', 'professional', 'enterprise'] as const;
const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  trial: { label: 'Trial', cls: 'bg-amber-100 text-amber-800' },
  essentials: { label: 'Essentials', cls: 'bg-gray-100 text-gray-800' },
  professional: { label: 'Professional', cls: 'bg-blue-100 text-blue-800' },
  enterprise: { label: 'Enterprise', cls: 'bg-green-100 text-green-800' },
};

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60_000) return rtf.format(-Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(-Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(-Math.round(diff / 3_600_000), 'hour');
  return rtf.format(-Math.round(diff / 86_400_000), 'day');
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

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
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

  // User deactivate/reactivate
  const [userWorking, setUserWorking] = useState<Record<number, boolean>>({});
  const [userConfirm, setUserConfirm] = useState<Record<number, boolean>>({});
  const [userMsg, setUserMsg] = useState<Record<number, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/ops/accounts/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        setAccount(data.account);
        setUsers(data.users ?? []);
        setTimeline(data.timeline ?? []);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load.'); setLoading(false); });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changePlan() {
    if (!pendingPlan || !account) return;
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
    if (res.ok) {
      router.push('/');
    }
  }

  if (loading) return <div className="text-gray-500 text-sm py-8">Loading...</div>;
  if (error || !account) return <div className="text-red-600 text-sm py-8">{error ?? 'Not found.'}</div>;

  const badge = PLAN_BADGE[account.plan_id] ?? { label: account.plan_id, cls: 'bg-gray-100 text-gray-700' };
  const trial = trialStatusLabel(account);

  return (
    <div className="max-w-5xl">
      <Link href="/ops/accounts" className="text-sm text-gray-500 hover:text-gray-800 mb-4 inline-block">
        ← All accounts
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{account.company_name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
              {badge.label}
            </span>
            {trial.label && (
              <span className={`text-sm font-medium ${trial.color}`}>{trial.label}</span>
            )}
          </div>
        </div>
        <button
          onClick={startImpersonation}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-700"
        >
          View as customer →
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account info card */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Account info</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ['ID', account.id],
              ['Email', account.admin_email],
              ['Name', [account.admin_first_name, account.admin_last_name].filter(Boolean).join(' ') || '—'],
              ['Deployment URL', account.deployment_url ?? '—'],
              ['Onboarding track', account.onboarding_track ?? '—'],
              ['Onboarding', account.onboarding_completed ? 'Complete' : 'Pending'],
              ['Last active', relativeTime(account.last_active_at)],
              ['Created', relativeTime(account.created_at)],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900 break-all">{value}</dd>
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
                  <button
                    onClick={changePlan}
                    disabled={planWorking}
                    className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 disabled:opacity-40"
                  >
                    {planWorking ? '...' : 'Confirm'}
                  </button>
                  <button onClick={() => setPlanConfirming(false)} className="text-gray-500 hover:text-gray-800">
                    Cancel
                  </button>
                </div>
              )}
              {planMsg && <div className="text-xs mt-1 text-gray-600">{planMsg}</div>}
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Extend trial</div>
              {!extendConfirming ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={extendDays}
                    onChange={e => setExtendDays(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-500">days</span>
                  <button
                    onClick={() => setExtendConfirming(true)}
                    className="text-sm bg-amber-500 text-white px-3 py-1.5 rounded-md hover:bg-amber-600"
                  >
                    Extend
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span>Add <strong>{extendDays} days</strong>?</span>
                  <button
                    onClick={extendTrial}
                    disabled={extendWorking}
                    className="bg-amber-500 text-white px-3 py-1 rounded-md hover:bg-amber-600 disabled:opacity-40"
                  >
                    {extendWorking ? '...' : 'Confirm'}
                  </button>
                  <button onClick={() => setExtendConfirming(false)} className="text-gray-500 hover:text-gray-800">
                    Cancel
                  </button>
                </div>
              )}
              {trialMsg && <div className="text-xs mt-1 text-gray-600">{trialMsg}</div>}
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Expire trial now</div>
              {!expireConfirming ? (
                <button
                  onClick={() => setExpireConfirming(true)}
                  className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700"
                >
                  Expire trial
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-red-600 font-medium">Are you sure?</span>
                  <button
                    onClick={expireTrial}
                    disabled={expireWorking}
                    className="bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700 disabled:opacity-40"
                  >
                    {expireWorking ? '...' : 'Confirm'}
                  </button>
                  <button onClick={() => setExpireConfirming(false)} className="text-gray-500 hover:text-gray-800">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Signup responses card */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Signup responses</h2>
          <dl className="space-y-3 text-sm">
            {[
              ['Role', account.signup_role],
              ['Industry', account.signup_industry],
              ['Team size', account.signup_team_size],
              ['Conferences / year', account.signup_conferences_per_year],
              ['Primary goal', account.signup_primary_goal],
              ['Current tool', account.signup_current_tool],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-gray-500 text-xs mb-0.5">{label}</dt>
                <dd className={value ? 'font-medium text-gray-900' : 'text-gray-400 italic'}>
                  {value || 'Not provided'}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Users card */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">Users</h2>
          {users.length === 0 ? (
            <p className="text-sm text-gray-400">No user data available (tenant DB not connected).</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Last active</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-50">
                    <td className="py-2">{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className="py-2 text-gray-600">{u.email}</td>
                    <td className="py-2 text-gray-600 capitalize">{u.role}</td>
                    <td className="py-2 text-gray-500 text-xs">{relativeTime(u.last_active_at)}</td>
                    <td className="py-2">
                      <span className={u.active ? 'text-green-700' : 'text-gray-400'}>
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
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
                          <button
                            onClick={() => toggleUser(u.id, u.active)}
                            disabled={userWorking[u.id]}
                            className="text-red-600 hover:text-red-800 disabled:opacity-40 underline"
                          >
                            {userWorking[u.id] ? '...' : 'Yes'}
                          </button>
                          <button
                            onClick={() => setUserConfirm(c => ({ ...c, [u.id]: false }))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            No
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Timeline card */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">Timeline</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-400">No events available.</p>
          ) : (
            <ol className="space-y-3">
              {timeline.map((event, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-gray-800">{event.label}</span>
                    <span className="ml-2 text-xs text-gray-400">{relativeTime(event.at)}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
