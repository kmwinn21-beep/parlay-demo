'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { EntityPicker } from '@/components/relationship-map/EntityPicker';
import { CompetitiveRail, type CompetitorColumn } from '@/components/relationship-map/CompetitiveRail';
import { CompetitiveGrid, SignalBadge } from '@/components/relationship-map/CompetitiveGrid';
import { QuickViewDrawer } from '@/components/QuickViewDrawer';
import {
  useSidebarCollapse, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH,
} from '@/components/SidebarCollapseContext';
import {
  countSignals, deriveSignals, SIGNAL_FULL_LABELS,
  type SignalKey, type SignalRelationship, type SwitchPair,
} from '@/lib/competitiveSignals';
import { MapCanvas, TONE_COLOR, type Spoke } from '@/components/relationship-map/MapCanvas';
import type { VendorRelationship } from '@/components/VendorRelationshipCard';
import { useConfigColors } from '@/lib/useConfigColors';
import { useUserOptions } from '@/lib/useUserOptions';
import { toneFor, type PickerCompany } from '@/lib/relationshipPicker';
import { RelationshipAttendeeCard } from '@/components/pre-conference/RelationshipsTab';
import type { RelationshipRow } from '@/components/PreConferenceReview';
// The presenter's own shape, which carries company_id. VendorRelationship is
// what the CARD needs and deliberately omits it — the surface rendering one
// already knows whose page it is on, and the grid does not.
import type { RelationshipCard } from '@/lib/relationshipThread';
import { statusesFor, type InverseMap } from '@/lib/relationshipDirection';

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
 * The competitive half of the payload, resolved server-side.
 *
 * Which end of a stored row is the competitor is decided once, in
 * lib/competitiveResolution.ts, because it needs the config the browser does not
 * have. Deciding it again here is how the rail and the grid would come to
 * disagree about the same relationship.
 */
interface CompetitivePayload {
  relationships: SignalRelationship[];
  competitors: CompetitorColumn[];
  /**
   * Companies somebody here already knows somebody at.
   *
   * From the endpoint's own DISTINCT read over internal_relationships, not from
   * the conference-scoped pre-conference load the Map's internal column uses —
   * that one is narrow because it computes a health ring, and inheriting it
   * would leave this signal quietly low at "All Relationships".
   */
  companiesWithInternal: number[];
  /**
   * The cards the grid renders, read from each ACCOUNT's side.
   *
   * The same VendorRelationship shape the company record gets, from the same
   * presenter, so the grid shows the real card rather than a lighter copy of it.
   */
  cards: RelationshipCard[];
  /**
   * value → the words for the other end, or null when the status is symmetric.
   *
   * The grid's cards are titled with the ACCOUNT, so every field on them has to
   * be read from the account's side — including the status, which the stored
   * row writes about the competitor.
   */
  inverses: InverseMap;
  /**
   * Switches a rep recorded on the companies on this map.
   *
   * Read, never derived: "they left A for B" is a claim about cause, and two
   * end-states and a calendar cannot establish one. See lib/vendorSwitch.
   */
  switches: SwitchPair[];
  /** Rows where neither end is a competitor — the partnership landscape's. */
  notCompetitive: number;
  /** Rows folded into a pair already logged from the other side. */
  duplicates: number;
}
/**
 * The left rail's width, open.
 *
 * Used twice and declared once: the strip is this wide, and the header's title
 * block is the same, so the view toggle beside it starts exactly where the
 * canvas does. Two numbers that happen to be equal today are two numbers that
 * disagree after somebody widens the rail.
 */
const RAIL_WIDTH = 288;
/** Folded: enough for the chevron and nothing else. */
const RAIL_FOLDED = 40;

const EMPTY_COMPETITIVE: CompetitivePayload = {
  relationships: [], competitors: [], companiesWithInternal: [], cards: [],
  inverses: {}, switches: [], notCompetitive: 0, duplicates: 0,
};

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
  const { collapsed: sidebarCollapsed } = useSidebarCollapse();
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
  /** The competitive read, already normalised server-side. See competitiveResolution. */
  const [competitiveData, setCompetitiveData] = useState<CompetitivePayload>(EMPTY_COMPETITIVE);
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
  /** The left rail folds away, the way the attendee column on the right does. */
  const [railOpen, setRailOpen] = useState(true);
  /**
   * A company's record, opened from a card's name and shown over this modal.
   *
   * Over, not instead: the grid is what sent you there and losing it to read
   * one record would mean finding your place again afterwards.
   */
  const [quickView, setQuickView] = useState<{ id: number; name: string } | null>(null);
  // ── Competitive view ──
  const [signalsOnly, setSignalsOnly] = useState(false);
  /**
   * Whether every card carrying a signal is lit at once.
   *
   * Plain state, deliberately. Not localStorage, not sessionStorage, not a ref
   * outside the component: the modal unmounts when it closes, so this goes back
   * to unchecked every time it opens. It is a thing you turn on to answer one
   * question, and finding it already on next week — with no memory of asking
   * for it — reads as the grid being broken.
   */
  const [highlightSignals, setHighlightSignals] = useState(false);
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

  /**
   * The map's whole payload — nodes, edges and the competitive read.
   *
   * A callback rather than an effect body, because a relationship changing has
   * to be able to re-run it. Every cell's ROW, every signal and every connector
   * comes from here, so without a refetch an update left the card's own pill
   * correct (it keeps an optimistic copy of what it just wrote) and the grid
   * around it describing the state at the moment the modal opened: the right
   * status sitting in the wrong row.
   *
   * `silent` skips the spinner. A refetch after an update must not unmount the
   * grid — that would collapse every open card and throw away the scroll
   * position of somebody who is mid-read.
   */
  const loadMap = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return fetch(`/api/conferences/${conferenceId}/relationship-map?scope=${scope}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: {
        nodes?: GraphNode[]; edges?: GraphEdge[]; icpTypes?: string[];
        atConference?: number[]; competitive?: Partial<CompetitivePayload>;
      } | null) => {
        if (!d) return;
        setNodes(d.nodes ?? []);
        setEdges(d.edges ?? []);
        setIcpTypes(d.icpTypes ?? []);
        setAtConference(new Set(d.atConference ?? []));
        setCompetitiveData({ ...EMPTY_COMPETITIVE, ...(d.competitive ?? {}) });
      })
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  }, [conferenceId, scope]);

  useEffect(() => { void loadMap(); }, [loadMap]);

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
   * The relationships arrive already normalised — account and competitor
   * resolved, class read off the status's action_key — so all that is left here
   * is the signal derivation, which is the same pure function the tests drive
   * without a browser or a database.
   *
   * Both lists come from the same payload, so the signal is true at either
   * scope. No window on the internal one: somebody here knowing somebody there
   * is a standing fact, not a recent event.
   */
  const competitive = useMemo(() => deriveSignals({
    relationships: competitiveData.relationships,
    companiesWithInternal: competitiveData.companiesWithInternal,
    switches: competitiveData.switches,
  }), [competitiveData]);
  const signalCounts = useMemo(() => countSignals(competitive.cells), [competitive]);
  const competitors = competitiveData.competitors;
  /** Columns the rail has not switched off, in the order it lists them. */
  const shownCompetitors = useMemo(
    () => competitors.filter(c => !hiddenCompetitorIds.has(c.id)),
    [competitors, hiddenCompetitorIds],
  );
  // Keyed on the pair for the same reason the endpoint filters on it: the two
  // sides can name different rows for one relationship, and the pair is what
  // they agree on.
  const cardByPair = useMemo(() => new Map(
    competitiveData.cards.map(c => [`${c.company_id}:${c.related_company_id}`, c]),
  ), [competitiveData]);
  const cardFor = useCallback(
    (companyId: number, competitorId: number) => cardByPair.get(`${companyId}:${competitorId}`),
    [cardByPair],
  );
  // Names for ordering a cell and for naming a card the query did not return.
  // byId covers the map's own nodes; the competitor columns carry their own.
  const nameOf = useCallback((companyId: number) => byId.get(companyId)?.name ?? '', [byId]);
  /**
   * The account's own types, for a card whose subject is the account.
   *
   * Resolved already by the graph endpoint, which turns a company_type holding
   * an option id or a comma-separated list into values. The card would
   * otherwise show the COMPETITOR's type, which is every cell in a column
   * repeating its own heading.
   */
  const typesOf = useCallback(
    (companyId: number) => byId.get(companyId)?.company_types ?? [], [byId],
  );
  /**
   * The statuses as the ACCOUNT reads them.
   *
   * The stored row says what the competitor is — "Current Vendor" — and a card
   * headed with the account's name saying that claims the account is the
   * vendor. 'inbound' is exactly "read this from the other end", which is the
   * same function every other surface uses for the same job.
   */
  const statusesOf = useCallback(
    // Only the statuses, so this takes only what it reads.
    (card: { relationship_status: string[] }) =>
      statusesFor(card.relationship_status, 'inbound', competitiveData.inverses),
    [competitiveData],
  );
  // Counted off the cells, so the subtitle can never disagree with the grid.
  const accountCount = useMemo(
    () => new Set(competitive.cells.map(c => c.companyId)).size,
    [competitive],
  );

  const scopeLabel = scope === 'conference'
    ? (conferenceName ?? 'This conference')
    : 'All relationships';

  return (
    /* Desktop only, and by not rendering rather than by hiding the contents.
       Narrowing the window with it open would otherwise leave the shell of a
       modal with nothing in it. The state survives, so widening brings it
       back — the same rule the view toggle follows across the breakpoint. */
    <div className="fixed inset-0 z-[200] hidden sm:block">
      {/* The backdrop covers everything, sidebar included: a click anywhere
          outside the panel closes, and dimming only part of the screen would
          say the rest was still live. */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Centred in what is LEFT of the screen, not in the screen. The sidebar
          is opaque and permanent, so centring over it put the modal visibly
          left of the content it belongs to.

          A sibling of the backdrop rather than its child, so the panel's clicks
          have nowhere to bubble to — and pointer-events-none lets a click in
          the margin fall through to the backdrop and close.

          The transition matches the sidebar's own 300ms, so the two move
          together instead of the modal jumping after it. */}
      <div
        className="absolute inset-0 sm:left-[var(--sidebar-w)] flex items-center justify-center p-4 pointer-events-none transition-[left] duration-300 ease-in-out"
        style={{ '--sidebar-w': `${sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH}px` } as CSSProperties}
      >
        <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-[1360px] h-[88vh] flex flex-col">
        {/* px-3, not px-5, so the title's left edge sits over the rail's and
            the close button's right edge over the canvas's. */}
        <div className="flex items-center justify-between px-3 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            {/* As wide as the rail, with the same gap after it, so the toggle
                below starts exactly where the canvas does. A number that is
                the rail's width rather than a number that happens to match it:
                RAIL_WIDTH is the one place either is declared. */}
            <div className="min-w-0 flex-1 sm:flex-none" style={{ width: RAIL_WIDTH }}>
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
                  // brand-accent, not the hex. It is #34D399 by default and a
                  // tenant that themes the app themes this with it; a literal
                  // would be the one control that ignored their colours.
                  // brand-primary for the text — white on that green is about
                  // 1.9:1 and unreadable.
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    view === v
                      ? 'bg-brand-accent text-brand-primary'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {v === 'map' ? 'Map' : 'Competition'}
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

        <div className="flex-1 min-h-0 hidden sm:flex gap-3 p-3 overflow-hidden">
          {/* Collapses to a chevron strip, the way Attendee Relationships does
              on the other side of this modal. Same interaction, same widths,
              mirrored — this one folds left, so its chevron points the other
              way and the label goes on the inside.

              Worth having on both views: the grid is four columns wide and the
              rail is 288 of the canvas, so folding it is the difference
              between reading a row and scrolling to it. */}
          <div
            data-map-rail
            className="flex-shrink-0 flex flex-col min-h-0 overflow-hidden transition-[width] duration-300 ease-in-out"
            style={{ width: railOpen ? RAIL_WIDTH : RAIL_FOLDED }}
          >
            <button
              type="button"
              onClick={() => setRailOpen(v => !v)}
              aria-expanded={railOpen}
              title={railOpen
                ? (view === 'competitive' ? 'Collapse signals' : 'Collapse the company list')
                : (view === 'competitive' ? 'Signals' : 'Select an entity')}
              className="flex items-center gap-1.5 px-2 py-2 text-left text-gray-500 hover:text-brand-secondary transition-colors flex-shrink-0"
            >
              <svg className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${railOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {railOpen && (
                <span className="text-sm font-bold text-brand-primary font-serif whitespace-nowrap">
                  {view === 'competitive' ? 'Signals' : 'Select an entity'}
                </span>
              )}
            </button>
            {/* Kept mounted while collapsed, so a search typed into the picker
                and a set of signal filters both survive folding it away. */}
            <div className={`flex-1 min-h-0 flex ${railOpen ? '' : 'invisible'}`}>
              {view === 'competitive' ? (
                <CompetitiveRail
                  signalCounts={signalCounts}
                  competitors={competitors}
                  hiddenCompetitorIds={hiddenCompetitorIds}
                  onToggleCompetitor={toggleCompetitor}
                  signalsOnly={signalsOnly}
                  onSignalsOnly={setSignalsOnly}
                  highlightSignals={highlightSignals}
                  onHighlightSignals={setHighlightSignals}
                  activeSignals={activeSignals}
                  onToggleSignal={toggleSignal}
                  unclassifiedCount={competitive.unclassifiedCount}
                  className="flex-shrink-0"
                  style={{ width: RAIL_WIDTH }}
                />
              ) : (
                <EntityPicker
                  companies={connected}
                  icpTypes={icpTypes}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  className="flex-shrink-0"
                  style={{ width: RAIL_WIDTH }}
                />
              )}
            </div>
          </div>

          {/* Keyed on the view so the animation restarts on every toggle, and
              named for the side the view sits on: Competition is to the right
              of Map, so it enters from the right and Map from the left. The
              direction is read off the view itself — remembering the previous
              one would be a second source of truth for something the toggle
              already says. */}
          <div
            key={view}
            className={`flex-1 min-w-0 flex flex-col gap-2 ${
              view === 'competitive' ? 'view-enter-right' : 'view-enter-left'}`}
          >
            {view === 'competitive' ? (
              <CompetitiveGrid
                cells={competitive.cells}
                competitors={shownCompetitors}
                cardFor={cardFor}
                nameOf={nameOf}
                typesOf={typesOf}
                statusesOf={statusesOf}
                signalsOnly={signalsOnly}
                activeSignals={activeSignals}
                highlightSignals={highlightSignals}
                onOpenCompany={setQuickView}
                userOptions={userOptions}
                colorMaps={colorMaps}
                // The map payload, not the spoke list. loadRels feeds the MAP
                // view; the grid's rows, signals and connectors all come from
                // here, so refreshing the other view's data left this one
                // describing the state the modal opened with.
                onUpdated={() => { void loadMap(true); }}
              />
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
                onUpdated={() => { loadRels(hubNode.id); void loadMap(true); }}
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
                // The badge itself, not a swatch of its colour. This is where a
                // reader who has just met "EA" on a card comes to find out what
                // it means, so it has to be the same mark — and the name is
                // spelled out here because abbreviating it would answer the
                // question with the question.
                (Object.keys(SIGNAL_FULL_LABELS) as SignalKey[]).map(key => (
                  <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                    <SignalBadge signal={key} />
                    {SIGNAL_FULL_LABELS[key]}
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
      {quickView && (
        // Above the modal's own z-[200]: it portals to the body, so without a
        // higher layer it would open behind the thing that opened it.
        <QuickViewDrawer
          target={{ type: 'company', id: quickView.id, name: quickView.name }}
          onClose={() => setQuickView(null)}
          zClass="z-[250]"
        />
      )}
    </div>
  );
}
