'use client';

import { TargetBtn } from './TargetBtn';
import { useRecordDrawer } from './RecordDrawerContext';
import type { ProductIcpEntry, TargetEntry } from '../PreConferenceReview';

function HealthDot({ score }: { score: number }) {
  const color = score >= 75 ? '#34D399' : score >= 50 ? '#f59e0b' : score >= 25 ? '#f97316' : '#ef4444';
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />;
}

function ProductColumn({
  entry,
  targetMap,
  onToggleTarget,
  readOnly,
}: {
  entry: ProductIcpEntry;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  readOnly: boolean;
}) {
  const openRecord = useRecordDrawer();
  const totalAttendees = entry.companies.reduce((sum, c) => sum + c.attendees.length, 0);
  const hex = entry.color ?? null;
  const headerStyle = hex
    ? { backgroundColor: `${hex}2e`, borderColor: hex, color: hex }
    : {};

  return (
    <div className="flex-shrink-0 w-72 flex flex-col gap-3">
      <div
        className={`rounded-xl px-4 py-2.5 border-2 ${hex ? '' : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary'}`}
        style={headerStyle}
      >
        <h3 className="font-semibold text-sm">{entry.product}</h3>
        <p className="text-xs mt-0.5 opacity-70">
          {entry.companies.length} {entry.companies.length === 1 ? 'company' : 'companies'} · {totalAttendees} {totalAttendees === 1 ? 'attendee' : 'attendees'}
        </p>
      </div>

      {entry.companies.map((company) => (
        <div
          key={company.companyId}
          className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all flex flex-col gap-3 bg-white"
        >
          <div className="min-w-0">
            {company.companyId > 0 ? (
              <button
                type="button"
                onClick={() => openRecord('company', company.companyId)}
                className="font-semibold text-gray-900 hover:text-brand-secondary transition-colors text-sm block truncate text-left w-full"
              >
                {company.companyName}
              </button>
            ) : (
              <span className="font-semibold text-gray-900 text-sm block truncate">
                {company.companyName || 'Unknown Company'}
              </span>
            )}
            {company.assignedUserNames.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {company.assignedUserNames.map((name) => (
                  <span key={name} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            {company.attendees.map((a) => {
              const isTarget = targetMap.has(a.id);
              const subtitleParts = [a.title, a.function].filter(Boolean);
              return (
                <div key={a.id} className="flex items-center gap-2 text-xs min-w-0">
                  <HealthDot score={a.health} />
                  <button
                    type="button"
                    onClick={() => openRecord('attendee', a.id)}
                    className="text-gray-700 truncate flex-1 hover:text-brand-secondary transition-colors min-w-0 text-left"
                  >
                    <span className="font-medium">{a.firstName} {a.lastName}</span>
                    {subtitleParts.length > 0 && (
                      <span className="text-gray-400"> · {subtitleParts.join(' · ')}</span>
                    )}
                  </button>
                  <TargetBtn
                    isTarget={isTarget}
                    disabled={readOnly}
                    onClick={() => onToggleTarget({
                      attendeeId: a.id,
                      firstName: a.firstName,
                      lastName: a.lastName,
                      title: a.title,
                      seniority: a.seniority,
                      companyName: company.companyName,
                      companyId: company.companyId > 0 ? company.companyId : null,
                      companyWse: null,
                      assignedUserNames: company.assignedUserNames,
                    })}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProductIcpTab({
  productIcp,
  targetMap,
  onToggleTarget,
  readOnly = false,
}: {
  productIcp: ProductIcpEntry[];
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  readOnly?: boolean;
}) {
  if (productIcp.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No attendees at this conference have a product assigned.</p>
      </div>
    );
  }

  // Determine if products span multiple categories
  const categoryLabels = new Set(productIcp.map(e => e.categoryLabel));
  const isMultiCategory = categoryLabels.size > 1;

  if (!isMultiCategory) {
    // Flat layout — same as before
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-500">
          {productIcp.length} product{productIcp.length !== 1 ? 's' : ''} represented at this conference
        </p>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {productIcp.map((entry) => (
            <ProductColumn key={entry.product} entry={entry} targetMap={targetMap} onToggleTarget={onToggleTarget} readOnly={readOnly} />
          ))}
        </div>
      </div>
    );
  }

  // Group by category preserving order of first appearance
  const categoryOrder: string[] = [];
  const byCategory = new Map<string, { label: string; color: string | null; entries: ProductIcpEntry[] }>();
  for (const entry of productIcp) {
    const key = entry.categoryLabel;
    if (!byCategory.has(key)) {
      categoryOrder.push(key);
      byCategory.set(key, { label: entry.categoryLabel, color: entry.categoryColor, entries: [] });
    }
    byCategory.get(key)!.entries.push(entry);
  }

  const totalProducts = productIcp.length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        {totalProducts} product{totalProducts !== 1 ? 's' : ''} across {categoryOrder.length} categories represented at this conference
      </p>
      {categoryOrder.map((catLabel) => {
        const cat = byCategory.get(catLabel)!;
        return (
          <div key={catLabel}>
            <div className="flex items-center gap-2 mb-3">
              {cat.color && (
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              )}
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{cat.label}</h3>
              <span className="text-xs text-gray-400">{cat.entries.length} product{cat.entries.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {cat.entries.map((entry) => (
                <ProductColumn key={entry.product} entry={entry} targetMap={targetMap} onToggleTarget={onToggleTarget} readOnly={readOnly} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
