'use client';

import { useEffect, useMemo, useState } from 'react';
import { EntityPicker } from '@/components/relationship-map/EntityPicker';
import { MapCanvas, TONE_COLOR, type SpokeCard } from '@/components/relationship-map/MapCanvas';
import { statusesFor, type InverseMap } from '@/lib/relationshipDirection';
import { toneFor, type PickerCompany } from '@/lib/relationshipPicker';

interface GraphNode extends PickerCompany {
  company_type: string | null;
  kind: 'operator' | 'vendor';
}
interface GraphEdge {
  id: number;
  from: number;
  to: number;
  relationship_status: string[];
  strength: string | null;
  vendor_type: string[];
  stale: boolean;
  implies_vendor: boolean;
}

/**
 * The relationship map, over the conference's companies.
 *
 * Opened from the Insights tab rather than replacing it: the charts answer
 * "who came", this answers "what are they connected to", and neither is the
 * other's summary.
 */
export function RelationshipMapModal({ conferenceId, onClose }: {
  conferenceId: number;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<'conference' | 'all'>('conference');
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [icpTypes, setIcpTypes] = useState<string[]>([]);
  const [inverses, setInverses] = useState<InverseMap>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/conferences/${conferenceId}/relationship-map?scope=${scope}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { nodes?: GraphNode[]; edges?: GraphEdge[]; icpTypes?: string[] } | null) => {
        if (cancelled || !d) return;
        setNodes(d.nodes ?? []);
        setEdges(d.edges ?? []);
        setIcpTypes(d.icpTypes ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conferenceId, scope]);

  // The words for the other end of a status, so a spoke reads from the hub's
  // side rather than from whoever happened to log the row.
  useEffect(() => {
    fetch('/api/config?category=other_relationship_status')
      .then(r => (r.ok ? r.json() : []))
      .then((d: { value?: string; inverse_value?: string | null }[]) => {
        const map: InverseMap = {};
        for (const o of Array.isArray(d) ? d : []) {
          if (o.value) map[o.value] = o.inverse_value ?? null;
        }
        setInverses(map);
      })
      .catch(() => {});
  }, []);

  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // The most connected company, so the map opens on something worth looking at
  // rather than on whatever sorts first.
  useEffect(() => {
    if (selectedId !== null || nodes.length === 0) return;
    setSelectedId(nodes.reduce((a, b) => (b.relationshipCount > a.relationshipCount ? b : a)).id);
  }, [nodes, selectedId]);

  const hubNode = selectedId != null ? byId.get(selectedId) ?? null : null;

  const spokes: SpokeCard[] = useMemo(() => {
    if (!hubNode) return [];
    return edges
      .filter(e => e.from === hubNode.id || e.to === hubNode.id)
      .map(e => {
        const otherId = e.from === hubNode.id ? e.to : e.from;
        const other = byId.get(otherId);
        if (!other) return null;
        // The row is stored from `from`'s side. When the hub is the `to` end
        // the reader is looking at it from the other side, so the words invert
        // — the same rule the company record uses.
        const inbound = e.to === hubNode.id;
        const shown = statusesFor(e.relationship_status, inbound ? 'inbound' : 'outbound', inverses);
        return {
          id: otherId,
          name: other.name,
          statusLabel: shown.join(', ') || 'Related',
          tone: toneFor(shown, other.company_types),
          units: other.units,
          attendeeCount: other.attendeeCount,
          relationshipCount: other.relationshipCount,
          stale: e.stale,
        } as SpokeCard;
      })
      .filter((s): s is SpokeCard => s !== null);
  }, [hubNode, edges, byId, inverses]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col"
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
                  {s === 'conference' ? 'At this conference' : 'All accounts'}
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
            companies={nodes}
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
                  subtitle: `${hubNode.relationshipCount} relationship${hubNode.relationshipCount === 1 ? '' : 's'}`,
                }}
                spokes={spokes}
                onSelectSpoke={setSelectedId}
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
              <span className="text-[11px] text-gray-400 ml-auto">Drag cards to rearrange</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
