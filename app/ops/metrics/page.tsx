import { requireOpsAdminPage } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';

export default async function OpsMetricsPage() {
  await requireOpsAdminPage();
  await dbReady;

  const rows = await db.execute({
    sql: `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN plan_id = 'trial' AND trial_expires_at > datetime('now') THEN 1 ELSE 0 END) as active_trials,
      SUM(CASE WHEN plan_id = 'trial' AND trial_expires_at < datetime('now') AND grace_period_ends_at > datetime('now') THEN 1 ELSE 0 END) as grace_period,
      SUM(CASE WHEN plan_id IN ('essentials','professional','enterprise') AND activated_plan_at IS NOT NULL AND activated_plan_at != '' THEN 1 ELSE 0 END) as converted
      FROM accounts`,
    args: [],
  });

  const m = rows.rows[0] ?? {};
  const metrics = [
    { label: 'Total accounts', value: Number(m.total ?? 0) },
    { label: 'Active trials', value: Number(m.active_trials ?? 0) },
    { label: 'Grace period', value: Number(m.grace_period ?? 0) },
    { label: 'Converted', value: Number(m.converted ?? 0) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Metrics</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {metrics.map(m => (
          <div key={m.label} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{m.value}</div>
            <div className="text-sm text-gray-500 mt-1">{m.label}</div>
          </div>
        ))}
      </div>
      <p className="text-sm text-gray-400">Detailed metrics coming soon.</p>
    </div>
  );
}
