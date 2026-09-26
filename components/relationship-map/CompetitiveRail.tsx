'use client';

import { SIGNAL_LABELS, type SignalKey } from '@/lib/competitiveSignals';

/** A column in the competitive grid, with how many accounts sit under it. */
export interface CompetitorColumn {
  id: number;
  name: string;
  accountCount: number;
}

/**
 * The rail in Competitive view — what to show, not what to centre on.
 *
 * The Map rail picks one company and draws everything around it. There is no
 * hub here: every competitor is a column and every account is somewhere in the
 * grid, so the rail's job changes from choosing a subject to narrowing a
 * field. Same width, same row styling as the picker, so flipping the view does
 * not move the canvas.
 *
 * Presentational on purpose. Every count arrives already derived, which keeps
 * the signal rules in competitiveSignals.ts where they are tested without a
 * browser.
 */
export function CompetitiveRail({
  signalCounts,
  competitors,
  hiddenCompetitorIds,
  onToggleCompetitor,
  signalsOnly,
  onSignalsOnly,
  showConnectors,
  onShowConnectors,
  activeSignals,
  onToggleSignal,
  unclassifiedCount,
  className = 'w-72 flex-shrink-0',
}: {
  signalCounts: Record<SignalKey, number>;
  competitors: CompetitorColumn[];
  hiddenCompetitorIds: Set<number>;
  onToggleCompetitor: (id: number) => void;
  signalsOnly: boolean;
  onSignalsOnly: (on: boolean) => void;
  showConnectors: boolean;
  onShowConnectors: (on: boolean) => void;
  activeSignals: Set<SignalKey>;
  onToggleSignal: (key: SignalKey) => void;
  /**
   * Relationships on a status with no class.
   *
   * Shown rather than dropped quietly: a grid missing twelve relationships
   * looks exactly like a grid with nothing to show, and only one of those is
   * something the account can fix.
   */
  unclassifiedCount: number;
  className?: string;
}) {
  return (
    <div className={`${className} view-competitive flex flex-col min-h-0 rounded-xl border border-gray-200 bg-white`}>
      <div className="p-3 border-b border-gray-100 space-y-2.5">
        {/* Signals only shares the heading's row: it applies to everything
            below it, and a checkbox under the filters would read as a fourth
            filter rather than the switch that governs the other three. */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-brand-primary font-serif">Signals</p>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={signalsOnly}
              onChange={e => onSignalsOnly(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-brand-secondary focus:ring-brand-secondary/40"
            />
            Signals only
          </label>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showConnectors}
            onChange={e => onShowConnectors(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-brand-secondary focus:ring-brand-secondary/40"
          />
          Show connectors
        </label>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-desktop-thin p-2 space-y-4">
        <div>
          <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Filter by signal
          </p>
          <div className="space-y-1.5">
            {(Object.keys(SIGNAL_LABELS) as SignalKey[]).map(key => {
              const on = activeSignals.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onToggleSignal(key)}
                  aria-pressed={on}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-all ${
                    on
                      ? 'border-brand-secondary bg-brand-secondary/5'
                      : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-xs font-semibold text-brand-primary truncate">
                      {SIGNAL_LABELS[key]}
                    </span>
                    <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gray-100 text-[10px] font-bold text-gray-600">
                      {signalCounts[key]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Competitors shown
          </p>
          {competitors.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No competitors to compare.</p>
          ) : (
            <div className="space-y-1.5">
              {competitors.map(c => {
                // Shown unless hidden, rather than a set of what to show. A
                // competitor arriving in the data after the modal opened should
                // appear, not be silently left out of its own grid.
                const on = !hiddenCompetitorIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onToggleCompetitor(c.id)}
                    aria-pressed={on}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
                      on
                        ? 'border-brand-secondary bg-brand-secondary/5'
                        : 'border-gray-100 bg-gray-50 hover:bg-gray-100 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-brand-primary truncate">{c.name}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {c.accountCount} account{c.accountCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Only when there is something to say. A line reading "0 relationships
          on unclassified statuses" is noise on every account that has none. */}
      {unclassifiedCount > 0 && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-gray-100">
          <a
            href="/admin"
            className="text-[11px] text-gray-500 hover:text-brand-secondary underline decoration-dotted transition-colors"
          >
            {unclassifiedCount} relationship{unclassifiedCount === 1 ? '' : 's'} on unclassified
            statuses — not counted in signals
          </a>
        </div>
      )}
    </div>
  );
}
