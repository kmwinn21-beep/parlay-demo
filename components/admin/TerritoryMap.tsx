'use client';

import { useMemo, useState } from 'react';
import { feature } from 'topojson-client';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import statesData from 'us-atlas/states-10m.json';
import type { Feature, Geometry } from 'geojson';

type StateFeature = Feature<Geometry, Record<string, unknown>>;

export interface Territory {
  id: number;
  name: string;
  stateCodes: string[];
  assignedUserIds: number[];
  assignedUsers: Array<{ userId: number; displayName: string; initials: string }>;
  color: string;
  createdAt: string;
}

interface TerritoryMapProps {
  territories: Territory[];
  selectedStates: Set<string>;
  onStateClick: (abbr: string, conflictInfo?: { territoryName: string }) => void;
  editingTerritoryId?: number | null;
}

const FIPS_TO_ABBR: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA',
  '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA',
  '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO',
  '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ',
  '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC',
  '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT',
  '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
};

export const ABBR_TO_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming',
};

// States too small to fit a legible abbreviation label at this map's scale.
const SKIP_LABELS = new Set(['RI', 'DE', 'CT', 'NJ', 'MA', 'NH', 'VT', 'MD', 'HI', 'DC']);

const projection = geoAlbersUsa().scale(900).translate([480, 300]);
const pathGen = geoPath().projection(projection);

// Darkens a hex color by a fraction (0-1) — used for assigned-state borders,
// since the territory color itself would blend into the fill and hide the
// state boundary.
function darken(hex: string, amount = 0.25): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function TerritoryMap({ territories, selectedStates, onStateClick, editingTerritoryId }: TerritoryMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  // us-atlas's bundled JSON typechecks as a broad structural shape rather than
  // the exact Topology<Objects> generic topojson-client's types expect — cast
  // once at the boundary rather than fighting the JSON import's inferred type.
  const stateFeatures: StateFeature[] = useMemo(() => {
    const topology = statesData as any;
    const collection = feature(topology, topology.objects.states) as { features: StateFeature[] } | StateFeature;
    return 'features' in collection ? collection.features : [collection];
  }, []);

  function getStateFill(abbr: string): string {
    if (selectedStates.has(abbr)) return '#185FA5';

    if (editingTerritoryId != null) {
      const editing = territories.find(t => t.id === editingTerritoryId);
      if (editing?.stateCodes.includes(abbr)) return '#185FA5';
    }

    const owner = territories.find(t => t.id !== editingTerritoryId && t.stateCodes.includes(abbr));
    if (owner) return owner.color;

    return 'var(--surface-1)';
  }

  function getOwner(abbr: string) {
    return territories.find(t => t.id !== editingTerritoryId && t.stateCodes.includes(abbr));
  }

  return (
    <svg viewBox="0 0 960 600" style={{ width: '100%', height: 'auto' }}>
      {stateFeatures.map(f => {
        const fipsRaw = f.id != null ? String(f.id).padStart(2, '0') : '';
        const abbr = FIPS_TO_ABBR[fipsRaw];
        if (!abbr) return null;

        const d = pathGen(f);
        if (!d) return null;

        const owner = getOwner(abbr);
        const isBlocked = !!owner;
        const isSelected = selectedStates.has(abbr) || (editingTerritoryId != null && territories.find(t => t.id === editingTerritoryId)?.stateCodes.includes(abbr));

        let fill = getStateFill(abbr);
        if (hoveredState === abbr && !isBlocked && !isSelected) fill = '#B5D4F4';

        const stroke = owner ? darken(owner.color) : 'var(--border)';
        const centroid = pathGen.centroid(f);
        const showLabel = !SKIP_LABELS.has(abbr);

        return (
          <g key={abbr}>
            <path
              d={d}
              fill={fill}
              stroke={stroke}
              strokeWidth={0.5}
              style={{ cursor: isBlocked ? 'not-allowed' : 'pointer' }}
              onClick={() => onStateClick(abbr)}
              onMouseEnter={() => setHoveredState(abbr)}
              onMouseLeave={() => setHoveredState(prev => prev === abbr ? null : prev)}
            >
              <title>{ABBR_TO_NAME[abbr]}{owner ? ` · ${owner.name}` : ''}</title>
            </path>
            {showLabel && (
              <text
                x={centroid[0]}
                y={centroid[1]}
                fontSize={9}
                textAnchor="middle"
                fill="var(--text-secondary)"
                style={{ pointerEvents: 'none' }}
              >
                {abbr}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
