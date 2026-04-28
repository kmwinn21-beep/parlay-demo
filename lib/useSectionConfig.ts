'use client';
import { useEffect, useState } from 'react';

export interface SectionDef {
  key: string;
  label: string;
}

export const SECTION_DEFS: Record<string, SectionDef[]> = {
  attendee: [
    { key: 'status', label: 'Status' },
    { key: 'conferences', label: 'Conferences' },
    { key: 'relationships', label: 'Internal Relationships' },
    { key: 'events', label: 'Events / Social' },
    { key: 'conference_activity', label: 'Conference Activity' },
    { key: 'touchpoints', label: 'Touchpoints' },
  ],
  company: [
    { key: 'status', label: 'Status' },
    { key: 'conferences', label: 'Conferences' },
    { key: 'communities', label: 'Communities' },
    { key: 'relationships', label: 'Internal Relationships' },
    { key: 'operator_capital', label: 'Operator / Capital Relationships' },
  ],
  conference_details: [
    { key: 'targets', label: 'Targets' },
    { key: 'attendees', label: 'Attendees' },
    { key: 'companies', label: 'Companies' },
    { key: 'meetings', label: 'Meetings' },
    { key: 'follow-ups', label: 'Follow Ups' },
    { key: 'social', label: 'Social' },
    { key: 'analytics', label: 'Insights' },
    { key: 'notes', label: 'Notes' },
    { key: 'forms', label: 'Conference Forms' },
  ],
  relationships_page: [
    { key: 'company_relationships', label: 'Company Level Relationships' },
    { key: 'relationship_timeline', label: 'Relationship Timeline' },
  ],
  pre_conference_review: [
    { key: 'landscape', label: 'Landscape' },
    { key: 'icp', label: 'ICP Companies' },
    { key: 'meetings', label: 'Meetings' },
    { key: 'social', label: 'Social Events' },
    { key: 'by-rep', label: 'By Rep' },
    { key: 'relationships', label: 'Relationships' },
    { key: 'conference_targets', label: 'Conference Targets' },
    { key: 'parlay_recommendations', label: 'Parlay Recommendations' },
  ],
  post_conference_review: [
    { key: 'summary', label: 'Summary' },
    { key: 'contacts', label: 'Contacts Captured' },
    { key: 'meetings', label: 'Meetings' },
    { key: 'follow_ups', label: 'Follow-ups' },
    { key: 'relationship_shifts', label: 'Relationship Shifts' },
    { key: 'events_touchpoints', label: 'Events & Touchpoints' },
    { key: 'action_items', label: 'Action Items' },
  ],
};

interface SectionConfig {
  key: string;
  label: string;
  sort_order: number;
  visible: boolean;
}

const _cache: Record<string, SectionConfig[]> = {};
const _pending: Record<string, Promise<SectionConfig[]> | undefined> = {};

export function invalidateSectionConfig(page?: string) {
  if (page) {
    delete _cache[page];
    delete _pending[page];
  } else {
    for (const k of Object.keys(_cache)) delete _cache[k];
    for (const k of Object.keys(_pending)) delete _pending[k];
  }
}

async function fetchSectionConfig(page: string): Promise<SectionConfig[]> {
  try {
    const res = await fetch('/api/admin/section-config', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json() as Record<string, SectionConfig[]>;
    return data[page] ?? [];
  } catch {
    return [];
  }
}

export function useSectionConfig(page: string) {
  const defs = SECTION_DEFS[page] ?? [];
  const [config, setConfig] = useState<SectionConfig[]>([]);

  useEffect(() => {
    if (_cache[page]) {
      setConfig(_cache[page]);
      return;
    }
    if (!_pending[page]) {
      _pending[page] = fetchSectionConfig(page).then(c => {
        _cache[page] = c;
        delete _pending[page];
        return c;
      });
    }
    _pending[page]!.then(c => setConfig(c));
  }, [page]);

  const getLabel = (key: string): string => {
    const cfg = config.find(c => c.key === key);
    if (cfg) return cfg.label;
    return defs.find(d => d.key === key)?.label ?? key;
  };

  const orderedKeys: string[] = (() => {
    if (config.length === 0) return defs.map(d => d.key);
    const configured = [...config].sort((a, b) => a.sort_order - b.sort_order).map(c => c.key);
    const missing = defs.filter(d => !configured.includes(d.key)).map(d => d.key);
    return [...configured, ...missing];
  })();

  const isVisible = (key: string): boolean => {
    const cfg = config.find(c => c.key === key);
    if (!cfg) return true;
    return cfg.visible;
  };

  return { getLabel, orderedKeys, isVisible };
}
