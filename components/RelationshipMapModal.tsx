'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EntityPicker } from '@/components/relationship-map/EntityPicker';
import { MapCanvas, TONE_COLOR, type Spoke } from '@/components/relationship-map/MapCanvas';
import type { VendorRelationship } from '@/components/VendorRelationshipCard';
import { useConfigColors } from '@/lib/useConfigColors';
import { useUserOptions } from '@/lib/useUserOptions';
import { toneFor, type PickerCompany } from '@/lib/relationshipPicker';
import { RelationshipAttendeeCard } from '@/components/pre-conference/RelationshipsTab';
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

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[1360px] h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-brand-primary font-serif">Relationship Map</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{hubNode?.name ?? 'Select a company'}</p>
          </div>
          <div className="flex items-center gap-2">
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

        <div className="flex-1 min-h-0 flex gap-3 p-3">
          <EntityPicker
            companies={connected}
            icpTypes={icpTypes}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {loading ? (
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

            <div className="flex items-center gap-4 px-1 flex-shrink-0">
              {([['current', 'Current'], ['pilot', 'Pilot / evaluating'], ['former', 'Former'], ['competitor', 'Competitor']] as const).map(([tone, label]) => (
                <span key={tone} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-4 h-0.5 rounded" style={{ backgroundColor: TONE_COLOR[tone] }} />
                  {label}
                </span>
              ))}
              <span className="text-[11px] text-gray-400 ml-auto">Drag the grip on a card to rearrange</span>
            </div>
          </div>

          {/* Internal relationships, when the selected company has any.
              Absent entirely when it does not, rather than an empty column
              taking width from the map. */}
          {internalCards.length > 0 && (
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
