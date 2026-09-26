'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EntityPicker } from '@/components/relationship-map/EntityPicker';
import { CompetitiveRail, type CompetitorColumn } from '@/components/relationship-map/CompetitiveRail';
import {
  countSignals, deriveSignals, SIGNAL_PILL_LABELS, SIGNAL_TONE, type SignalKey,
} from '@/lib/competitiveSignals';
import { MapCanvas, TONE_COLOR, type Spoke } from '@/components/relationship-map/MapCanvas';
import { VendorRelationshipCard, type VendorRelationship } from '@/components/VendorRelationshipCard';
import { useConfigColors } from '@/lib/useConfigColors';
import { useUserOptions } from '@/lib/useUserOptions';
import { toneFor, type PickerCompany } from '@/lib/relationshipPicker';
import { RelationshipAttendeeCard, SectionHead } from '@/components/pre-conference/RelationshipsTab';
import type { RelationshipRow } from '@/components/PreConferenceReview';

interface GraphNode extends PickerCompany {
  company_type: string | null;
  kind: 'operator' | 'vendor';
}
interface GraphEdge {
  id: number;
  from: number;
  to: number;
  relationship_status: string[];
  stale: boolean;
}

/**
 * The relationship map, over the conference's companies.
 *
 * Opened from the Insights tab rather than replacing it: the charts answer
 * "who came", this answers "what are they connected to", and neither is the
 * other's summary.
 *
 * The graph endpoint supplies the picker — who is on the map, their counts,
 * their types. The spokes themselves come from /api/vendor-relationships for
 * whichever company is selected, because that already returns the full card,
 * read from that company's side, with its notes, its thread and its Update
 * button. Rebuilding those here would have been a second card to keep in step
 * with the one on the company record.
 */
export function RelationshipMapModal({ conferenceId, conferenceName, onClose }: {
  conferenceId: number;
  /** Named on the toggle, so the scope reads as a place rather than a setting. */
  conferenceName?: string;
  onClose: () => void;
}) {
  const colorMaps = useConfigColors();
  const userOptions = useUserOptions();

  const [scope, setScope] = useState<'conference' | 'all'>('conference');
  /**
   * Which canvas the modal is showing.
   *
   * A sibling of scope rather than a nesting of it: the two are independent, so
   * flipping the view keeps whatever scope was chosen and flipping the scope
   * keeps the view. Map opens, because that is what the button that opens this
   * modal has always meant.
   */
  const [view, setView] = useState<'map' | 'competitive'>('map');
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [icpTypes, setIcpTypes] = useState<string[]>([]);
  const [atConference, setAtConference] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rels, setRels] = useState<VendorRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRels, setLoadingRels] = useState(false);
  /**
   * The internal relationships for every company at this conference.
   *
   * From the pre-conference endpoint rather than a query of my own: that is
   * where this card already comes from, health ring and all, and the health
   * behind it is five cross-conference queries that would have had to be
   * duplicated to build it here.
   */
  const [internal, setInternal] = useState<RelationshipRow[]>([]);
  const [internalOpen, setInternalOpen] = useState(true);
  // Mobile shows one panel at a time, the way the pre-conference tab does.
  const [mobileTab, setMobileTab] = useState<'companies' | 'relationships'>('companies');

  // ── Competitive view ──
  const [signalsOnly, setSignalsOnly] = useState(false);
  /**
   * Whether the grid draws the lines between an account's two cells.
   *
   * Plain state, deliberately. Not localStorage, not sessionStorage, not a ref
   * outside the component: the modal unmounts when it closes, so this goes back
   * to unchecked every time it opens. Connectors are a thing you turn on to
   * answer one question, and finding them already on next week — with no memory
   * of asking for them — reads as the grid being broken.
   */
  const [showConnectors, setShowConnectors] = useState(false);
  const [activeSignals, setActiveSignals] = useState<Set<SignalKey>>(new Set());
  // What is hidden, not what is shown. See the note in CompetitiveRail.
  const [hiddenCompetitorIds, setHiddenCompetitorIds] = useState<Set<number>>(new Set());

  const toggleSignal = useCallback((key: SignalKey) => {
    setActiveSignals(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const toggleCompetitor = useCallback((id: number) => {
    setHiddenCompetitorIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conferences/${conferenceId}/pre-conference`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { relationships?: RelationshipRow[] } | null) => {
        if (!cancelled && d) setInternal(d.relationships ?? []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conferenceId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/conferences/${conferenceId}/relationship-map?scope=${scope}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { nodes?: GraphNode[]; edges?: GraphEdge[]; icpTypes?: string[]; atConference?: number[] } | null) => {
        if (cancelled || !d) return;
        setNodes(d.nodes ?? []);
        setEdges(d.edges ?? []);
        setIcpTypes(d.icpTypes ?? []);
        setAtConference(new Set(d.atConference ?? []));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conferenceId, scope]);

  // Only companies something connects to. A picker full of rows that open an
  // empty canvas is a list of dead ends.
  const connected = useMemo(() => nodes.filter(n => n.relationshipCount > 0), [nodes]);

  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // The most connected company, so the map opens on something worth looking at.
  useEffect(() => {
    if (selectedId !== null || connected.length === 0) return;
    setSelectedId(connected.reduce((a, b) => (b.relationshipCount > a.relationshipCount ? b : a)).id);
  }, [connected, selectedId]);

  const loadRels = useCallback((companyId: number) => {
    setLoadingRels(true);
    fetch(`/api/vendor-relationships?company_id=${companyId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: VendorRelationship[]) => setRels(Array.isArray(d) ? d : []))
      .catch(() => setRels([]))
      .finally(() => setLoadingRels(false));
  }, []);

  useEffect(() => {
    if (selectedId === null) { setRels([]); return; }
    loadRels(selectedId);
  }, [selectedId, loadRels]);

  const hubNode = selectedId != null ? byId.get(selectedId) ?? null : null;

  /**
   * The internal relationships to show beside the map.
   *
   * One card per tagged contact. Every contact here is at this conference
   * already — the pre-conference route tags them from the conference's own
   * attendee list — so both scopes show the same cards today. Widening "All
   * Relationships" to contacts who did not come would mean computing the
   * health ring outside that route, which is five cross-conference queries.
   */
  const internalCards = useMemo(() => {
    if (!hubNode) return [];
    return internal
      .filter(r => r.company_id === hubNode.id)
      .flatMap(r => r.attendees.map(a => ({
        key: `${r.id}:${a.id}`,
        attendee: { ...a, company_name: r.company_name, company_id: r.company_id },
        repNames: r.rep_names,
        descriptions: [r.description].filter(Boolean),
      })));
  }, [internal, hubNode]);

  const spokes: Spoke[] = useMemo(() => {
    if (!hubNode) return [];
    return rels
      // At this conference means what it says: only relationships whose other
      // end is also at this show. All accounts drops the restriction.
      .filter(rel => scope === 'all' || atConference.has(rel.related_company_id))
      .map(rel => ({
        // The relationship's own id. Keying on the company collapsed two
        // relationships with one company into a single React key.
        id: rel.id,
        rel,
        tone: toneFor(rel.relationship_status, byId.get(rel.related_company_id)?.company_types ?? []),
      }));
  }, [hubNode, rels, byId, scope, atConference]);

  // What the hub's badge says, counted the same way the spokes are drawn.
  const hubCount = hubNode
    ? (rels.length > 0
        ? spokes.length
        : edges.filter(e => e.from === hubNode.id || e.to === hubNode.id).length)
    : 0;

  /**
   * What the competitive view has to show.
   *
   * Empty for now, and empty on purpose: the relationship-map endpoint returns
   * an edge's statuses as words, with no class attached and no status_changed_at,
   * so there is nothing here yet to classify. Wiring it needs a decision this
   * shell should not make quietly — which companies count as competitors, and
   * which end of a directional relationship is the account — and that decision
   * belongs with the grid that depends on it.
   *
   * It goes through deriveSignals rather than around it so the rail is reading
   * the real shape from the first commit. The day the endpoint grows those two
   * fields, this list is the only thing that changes.
   */
  const competitive = useMemo(() => deriveSignals({ relationships: [] }), []);
  const signalCounts = useMemo(() => countSignals(competitive.cells), [competitive]);
  const competitors: CompetitorColumn[] = useMemo(() => [], []);
  // Counted off the cells, so the subtitle can never disagree with the grid.
  const accountCount = useMemo(
    () => new Set(competitive.cells.map(c => c.companyId)).size,
    [competitive],
  );

  const scopeLabel = scope === 'conference'
    ? (conferenceName ?? 'This conference')
    : 'All relationships';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[1360px] h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-brand-primary font-serif">Relationship Map</h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {view === 'competitive'
                  ? `${competitors.length} competitor${competitors.length === 1 ? '' : 's'} · ${accountCount} account${accountCount === 1 ? '' : 's'} · ${scopeLabel}`
                  : (hubNode?.name ?? 'Select a company')}
              </p>
            </div>
            {/* Beside the title rather than beside the scope toggle: this
                chooses what you are looking at, scope chooses how much of it,
                and a row of four buttons reads as one four-way choice.

                Desktop only. The competitive grid is columns across, which has
                no honest rendering at phone width — see BACKLOG.md. Hidden
                outright rather than disabled: a control nobody can reach does
                not need explaining. */}
            <div className="hidden sm:flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
              {(['map', 'competitive'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    view === v ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {v === 'map' ? 'Map' : 'Competitive'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(['conference', 'all'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    scope === s ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s === 'conference'
                    ? (conferenceName ? `At ${conferenceName}` : 'At this conference')
                    : 'All Relationships'}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* ── Mobile layout ──
            The same two panels the pre-conference relationships tab uses: a
            list, then the chosen company's relationships, with a toggle
            between them. No hub and spokes — a canvas you rearrange by
            dragging is of no use on a phone, and the cards are the content. */}
        <div className="flex-1 min-h-0 sm:hidden flex flex-col p-3">
          <div className="flex flex-shrink-0 border-b border-gray-200 mb-3">
            <button
              type="button"
              onClick={() => setMobileTab('companies')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                mobileTab === 'companies'
                  ? 'text-brand-primary border-b-2 border-brand-primary'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Companies
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('relationships')}
              className={`flex-1 py-2 text-sm font-semibold truncate transition-colors ${
                mobileTab === 'relationships'
                  ? 'text-brand-primary border-b-2 border-brand-primary'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {hubNode ? hubNode.name : 'Relationships'}
            </button>
          </div>

          {mobileTab === 'companies' ? (
            <EntityPicker
              companies={connected}
              icpTypes={icpTypes}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setMobileTab('relationships'); }}
              className="flex-1 min-h-0"
            />
          ) : (
            <div className="flex-1 overflow-y-auto pb-4 space-y-6" style={{ scrollbarWidth: 'none' }}>
              {!hubNode ? (
                <p className="text-gray-400 text-sm text-center py-12">Select a company to view its relationships.</p>
              ) : (
                <>
                  {internalCards.length > 0 && (
                    <div>
                      <SectionHead label="Internal" count={internalCards.length} />
                      <div className="space-y-3">
                        {internalCards.map(c => (
                          <RelationshipAttendeeCard
                            key={c.key}
                            attendee={c.attendee}
                            repNames={c.repNames}
                            descriptions={c.descriptions}
                            isTarget={false}
                            onToggleTarget={() => {}}
                            readOnly
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <SectionHead label="Vendor / Other Relationships" count={spokes.length} />
                    {spokes.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">No relationships recorded for this company.</p>
                    ) : (
                      <div className="space-y-3">
                        {spokes.map(s => (
                          <VendorRelationshipCard
                            key={s.id}
                            rel={s.rel}
                            userOptions={userOptions}
                            colorMaps={colorMaps}
                            onUpdated={() => loadRels(hubNode.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 hidden sm:flex gap-3 p-3">
          {view === 'competitive' ? (
            <CompetitiveRail
              signalCounts={signalCounts}
              competitors={competitors}
              hiddenCompetitorIds={hiddenCompetitorIds}
              onToggleCompetitor={toggleCompetitor}
              signalsOnly={signalsOnly}
              onSignalsOnly={setSignalsOnly}
              showConnectors={showConnectors}
              onShowConnectors={setShowConnectors}
              activeSignals={activeSignals}
              onToggleSignal={toggleSignal}
              unclassifiedCount={competitive.unclassifiedCount}
            />
          ) : (
            <EntityPicker
              companies={connected}
              icpTypes={icpTypes}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}

          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {view === 'competitive' ? (
              /* The grid lands here. Until it does this is the empty state it
                 will fall back to anyway, rather than a placeholder that has to
                 be remembered and removed. */
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-400">No competitor relationships to compare.</p>
              </div>
            ) : loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : hubNode ? (
              <MapCanvas
                hub={{
                  id: hubNode.id,
                  name: hubNode.name,
                  types: hubNode.company_types.slice(0, 3),
                  subtitle: loadingRels
                    ? 'Loading…'
                    : `${hubCount} relationship${hubCount === 1 ? '' : 's'}`,
                }}
                spokes={spokes}
                userOptions={userOptions}
                colorMaps={colorMaps}
                onUpdated={() => loadRels(hubNode.id)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-400">No companies with relationships at this conference.</p>
              </div>
            )}

            {/* The legend explains whatever the canvas above it drew. In Map
                that is the edge colours; in Competitive the edges are gone and
                the colours belong to the signal pills instead. */}
            <div className="flex items-center gap-4 px-1 flex-shrink-0">
              {view === 'competitive' ? (
                (Object.keys(SIGNAL_PILL_LABELS) as SignalKey[]).map(key => (
                  <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SIGNAL_TONE[key] }} />
                    {SIGNAL_PILL_LABELS[key]}
                  </span>
                ))
              ) : (
                <>
                  {([['current', 'Current'], ['pilot', 'Pilot / evaluating'], ['former', 'Former'], ['competitor', 'Competitor']] as const).map(([tone, label]) => (
                    <span key={tone} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                      <span className="w-4 h-0.5 rounded" style={{ backgroundColor: TONE_COLOR[tone] }} />
                      {label}
                    </span>
                  ))}
                  <span className="text-[11px] text-gray-400 ml-auto">Drag the grip on a card to rearrange</span>
                </>
              )}
            </div>
          </div>

          {/* Internal relationships, when the selected company has any.
              Absent entirely when it does not, rather than an empty column
              taking width from the map.

              Map only. These cards are the SELECTED company's contacts, and
              Competitive has no selected company — the column would show the
              last hub's people beside a grid of everybody else's, which reads
              as the grid's own contacts. Dropping the column takes its collapse
              chevron with it. */}
          {view === 'map' && internalCards.length > 0 && (
            <div
              className="flex-shrink-0 flex flex-col min-h-0 overflow-hidden transition-[width] duration-300 ease-in-out"
              style={{ width: internalOpen ? 320 : 40 }}
            >
              <button
                type="button"
                onClick={() => setInternalOpen(v => !v)}
                aria-expanded={internalOpen}
                title={internalOpen ? 'Collapse internal relationships' : 'Internal relationships'}
                className="flex items-center gap-1.5 px-2 py-2 text-left text-gray-500 hover:text-brand-secondary transition-colors flex-shrink-0"
              >
                <svg className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${internalOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {internalOpen && (
                  <span className="text-sm font-bold text-brand-primary font-serif whitespace-nowrap">
                    Attendee Relationships
                  </span>
                )}
              </button>
              {/* Kept mounted while collapsed so reopening does not refetch
                  every timeline the cards load for themselves. */}
              <div className={`flex-1 min-h-0 overflow-y-auto scrollbar-desktop-thin space-y-3 pr-1 ${internalOpen ? '' : 'invisible'}`}>
                {internalCards.map(c => (
                  <RelationshipAttendeeCard
                    key={c.key}
                    attendee={c.attendee}
                    repNames={c.repNames}
                    descriptions={c.descriptions}
                    isTarget={false}
                    onToggleTarget={() => {}}
                    readOnly
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
