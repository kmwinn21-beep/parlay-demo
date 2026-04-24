'use client';

import type { ActionItem, PostConferenceData } from '../PostConferenceReview';

type ActionItems = PostConferenceData['actionItems'];

const TYPE_META: Record<ActionItem['type'], { label: string; icon: string; bg: string; text: string; border: string }> = {
  overdue_followup: { label: 'Overdue Follow-up', icon: '⏰', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  missing_outcome: { label: 'Missing Outcome', icon: '📝', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  no_show: { label: 'No Show', icon: '👻', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  ghost_penalty: { label: 'Ghost Penalty', icon: '🔁', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  pipeline: { label: 'Pipeline Opportunity', icon: '🚀', bg: 'bg-blue-50', text: 'text-brand-secondary', border: 'border-blue-200' },
  new_contact: { label: 'New Contact', icon: '✨', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  retrospective: { label: 'Retrospective', icon: '📊', bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
};

const PRIORITY_ORDER: ActionItem['priority'][] = ['high', 'medium'];
const PRIORITY_META: Record<ActionItem['priority'], { label: string; className: string }> = {
  high: { label: 'High', className: 'bg-red-100 text-red-700' },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-700' },
  low: { label: 'Low', className: 'bg-gray-100 text-gray-600' },
};

function ActionCard({ item }: { item: ActionItem }) {
  const meta = TYPE_META[item.type];
  const pMeta = PRIORITY_META[item.priority];
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${meta.bg} ${meta.border} border`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">{meta.icon}</span>
          <span className={`text-xs font-semibold uppercase tracking-wider flex-shrink-0 ${meta.text}`}>{meta.label}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${pMeta.className}`}>{pMeta.label}</span>
      </div>
      <p className="text-sm font-semibold text-gray-800 leading-snug">{item.title}</p>
      <p className="text-xs text-gray-600 leading-relaxed">{item.description}</p>
      {(item.repName || item.attendeeName || item.companyName) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-black/5">
          {item.repName && <span className="text-xs text-gray-500">Rep: <span className="font-medium text-gray-700">{item.repName}</span></span>}
          {item.attendeeName && <span className="text-xs text-gray-500">Contact: <span className="font-medium text-gray-700">{item.attendeeName}</span></span>}
          {item.companyName && <span className="text-xs text-gray-500">Company: <span className="font-medium text-gray-700">{item.companyName}</span></span>}
        </div>
      )}
    </div>
  );
}

export function ActionItemsTab({ actionItems }: { actionItems: ActionItems }) {
  // Exclude low priority items entirely
  const visibleItems = actionItems.filter(i => i.priority !== 'low');

  if (visibleItems.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <p className="text-2xl">✅</p>
        <p className="text-sm font-semibold text-gray-600">All clear — no action items generated.</p>
        <p className="text-xs text-gray-400">Everything looks good for this conference.</p>
      </div>
    );
  }

  const high = visibleItems.filter(i => i.priority === 'high');
  const medium = visibleItems.filter(i => i.priority === 'medium');

  // Type breakdown
  const typeCounts = visibleItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total Actions', value: visibleItems.length, color: '#223A5E' },
          { label: 'High Priority', value: high.length, color: '#ef4444' },
          { label: 'Medium Priority', value: medium.length, color: '#d97706' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-gray-100 p-4 bg-white">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs font-semibold text-gray-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Type breakdown */}
      {Object.keys(typeCounts).length > 1 && (
        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Action Types</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {Object.entries(typeCounts).map(([type, count]) => {
              const meta = TYPE_META[type as ActionItem['type']];
              if (!meta) return null;
              return (
                <span key={type} className={`inline-flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${meta.bg} ${meta.border} ${meta.text}`}>
                  <span className="flex items-center gap-1">{meta.icon} {meta.label}</span>
                  <span className="font-bold">{count}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Items grouped by priority (high + medium only) */}
      {PRIORITY_ORDER.map(priority => {
        const items = visibleItems.filter(i => i.priority === priority);
        if (items.length === 0) return null;
        const pMeta = PRIORITY_META[priority];
        return (
          <div key={priority}>
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className={`text-xs font-semibold uppercase tracking-wider whitespace-nowrap px-2 py-0.5 rounded-full ${pMeta.className}`}>
                {pMeta.label} Priority ({items.length})
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {items.map((item, i) => <ActionCard key={i} item={item} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
