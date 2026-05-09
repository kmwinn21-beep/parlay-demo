'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface Account {
  id: string;
  company_name: string;
  admin_email: string;
  plan_id: string;
  trial_expires_at: string | null;
  grace_period_ends_at: string | null;
  activated_plan_at: string | null;
  onboarding_completed: number;
  last_active_at: string | null;
  created_at: string;
}

interface Metrics {
  total: number;
  active_trials: number;
  grace_period: number;
  converted: number;
}

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

function trialStatus(account: Account): { label: string; color: string } {
  if (account.plan_id !== 'trial') return { label: '', color: '' };
  const now = Date.now();
  const expires = account.trial_expires_at ? new Date(account.trial_expires_at).getTime() : null;
  const grace = account.grace_period_ends_at ? new Date(account.grace_period_ends_at).getTime() : null;

  if (!expires) return { label: '', color: '' };
  if (now < expires) {
    const days = Math.ceil((expires - now) / 86_400_000);
    return {
      label: `${days}d remaining`,
      color: days <= 3 ? 'text-amber-600' : 'text-green-700',
    };
  }
  if (grace && now < grace) {
    const days = Math.ceil((grace - now) / 86_400_000);
    return { label: `Grace — ${days}d left`, color: 'text-red-600' };
  }
  return { label: 'Expired', color: 'text-red-600' };
}

const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  trial: { label: 'Trial', cls: 'bg-amber-100 text-amber-800' },
  essentials: { label: 'Essentials', cls: 'bg-gray-100 text-gray-800' },
  professional: { label: 'Professional', cls: 'bg-blue-100 text-blue-800' },
  enterprise: { label: 'Enterprise', cls: 'bg-green-100 text-green-800' },
  expired: { label: 'Expired', cls: 'bg-red-100 text-red-800' },
  read_only: { label: 'Read only', cls: 'bg-red-100 text-red-700' },
};

export default function OpsAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, active_trials: 0, grace_period: 0, converted: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'created_at' | 'last_active_at' | 'company_name'>('created_at');

  useEffect(() => {
    fetch('/api/ops/accounts')
      .then(r => r.json())
      .then(data => {
        setAccounts(data.accounts ?? []);
        setMetrics(data.metrics ?? { total: 0, active_trials: 0, grace_period: 0, converted: 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = accounts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.company_name.toLowerCase().includes(q) || a.admin_email.toLowerCase().includes(q)
      );
    }
    if (planFilter !== 'all') {
      list = list.filter(a => a.plan_id === planFilter);
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'company_name') return a.company_name.localeCompare(b.company_name);
      const aVal = (sortBy === 'last_active_at' ? a.last_active_at : a.created_at) ?? '';
      const bVal = (sortBy === 'last_active_at' ? b.last_active_at : b.created_at) ?? '';
      return bVal.localeCompare(aVal);
    });
  }, [accounts, search, planFilter, sortBy]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Accounts</h1>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total accounts', value: metrics.total },
          { label: 'Active trials', value: metrics.active_trials },
          { label: 'Grace period', value: metrics.grace_period },
          { label: 'Converted', value: metrics.converted },
        ].map(m => (
          <div key={m.label} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{m.value}</div>
            <div className="text-sm text-gray-500 mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search company or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All plans</option>
          <option value="trial">Trial</option>
          <option value="essentials">Essentials</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="created_at">Newest first</option>
          <option value="last_active_at">Last active</option>
          <option value="company_name">Company name</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Admin email</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Trial status</th>
                <th className="px-4 py-3">Signed up</th>
                <th className="px-4 py-3">Onboarding</th>
                <th className="px-4 py-3">Last active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No accounts found.
                  </td>
                </tr>
              ) : (
                filtered.map(account => {
                  const badge = PLAN_BADGE[account.plan_id] ?? { label: account.plan_id, cls: 'bg-gray-100 text-gray-700' };
                  const trial = trialStatus(account);
                  return (
                    <tr key={account.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/ops/accounts/${account.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {account.company_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{account.admin_email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-xs font-medium ${trial.color}`}>
                        {trial.label || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{relativeTime(account.created_at)}</td>
                      <td className="px-4 py-3 text-xs">
                        {account.onboarding_completed ? (
                          <span className="text-green-700">Complete</span>
                        ) : (
                          <span className="text-gray-400">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{relativeTime(account.last_active_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
