'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ColumnDef {
  key: string;
  label: string;
}

export const TABLE_COLUMN_DEFS: Record<string, ColumnDef[]> = {
  attendees: [
    { key: 'name',         label: 'Name' },
    { key: 'title',        label: 'Title' },
    { key: 'company',      label: 'Company' },
    { key: 'company_type', label: 'Type' },
    { key: 'status',       label: 'Status' },
    { key: 'seniority',    label: 'Seniority' },
    { key: 'conferences',  label: 'Conferences' },
    { key: 'notes',        label: 'Notes' },
    { key: 'updated_on',   label: 'Updated On' },
    { key: 'date_added',   label: 'Date Added' },
  ],
  companies: [
    { key: 'name',        label: 'Company Name' },
    { key: 'type',        label: 'Type' },
    { key: 'sfowner',     label: 'SF Owner' },
    { key: 'status',      label: 'Status' },
    { key: 'attendees',   label: 'Attendees' },
    { key: 'conferences', label: 'Conferences' },
    { key: 'wse',         label: "WSE's" },
    { key: 'updated_on',  label: 'Updated On' },
  ],
  follow_ups: [
    { key: 'name',      label: 'Name' },
    { key: 'title',     label: 'Title' },
    { key: 'company',   label: 'Company' },
    { key: 'next_step', label: 'Next Step' },
    { key: 'conference', label: 'Conference' },
    { key: 'rep',       label: 'Rep' },
    { key: 'notes',     label: 'Notes' },
    { key: 'status',    label: 'Status' },
  ],
  meetings: [
    { key: 'name',       label: 'Name' },
    { key: 'title',      label: 'Title' },
    { key: 'rep',        label: 'Rep' },
    { key: 'company',    label: 'Company' },
    { key: 'datetime',   label: 'Date/Time' },
    { key: 'conference', label: 'Conference' },
    { key: 'outcome',    label: 'Outcome' },
    { key: 'info',       label: 'Info' },
  ],
  social_events: [
    { key: 'entered_by',  label: 'Entered By' },
    { key: 'internal',    label: 'Internal' },
    { key: 'event_name',  label: 'Name' },
    { key: 'event_type',  label: 'Type' },
    { key: 'host',        label: 'Host' },
    { key: 'location',    label: 'Location' },
    { key: 'date',        label: 'Date' },
    { key: 'time',        label: 'Time' },
    { key: 'invite_only', label: 'Invite Only' },
    { key: 'guest_list',  label: 'Guest List' },
  ],
  conference_attendees: [
    { key: 'name',        label: 'Name' },
    { key: 'title',       label: 'Title' },
    { key: 'company',     label: 'Company' },
    { key: 'type',        label: 'Type' },
    { key: 'seniority',   label: 'Seniority' },
    { key: 'conferences', label: 'Conferences' },
    { key: 'notes',       label: 'Notes' },
    { key: 'date_added',  label: 'Date Added' },
  ],
  conference_companies: [
    { key: 'name',        label: 'Company Name' },
    { key: 'type',        label: 'Type' },
    { key: 'sfowner',     label: 'SF Owner' },
    { key: 'status',      label: 'Status' },
    { key: 'attendees',   label: 'Attendees' },
    { key: 'conferences', label: 'Conferences' },
    { key: 'wse',         label: "WSE's" },
    { key: 'updated_on',  label: 'Updated On' },
  ],
};

// Module-level cache so all table instances share the same fetched config
const _cache: Record<string, Record<string, boolean>> = {};
const _pending: Record<string, Promise<Record<string, boolean>> | undefined> = {};

function fetchConfig(tableName: string): Promise<Record<string, boolean>> {
  if (_cache[tableName]) return Promise.resolve(_cache[tableName]);
  if (_pending[tableName]) return _pending[tableName];
  _pending[tableName] = fetch(`/api/admin/table-config?table=${tableName}`, { credentials: 'include' })
    .then(r => (r.ok ? r.json() : {}))
    .then((data: Record<string, boolean>) => {
      _cache[tableName] = data;
      delete _pending[tableName];
      return data;
    })
    .catch(() => ({}));
  return _pending[tableName];
}

export function invalidateTableColumnConfig(tableName?: string) {
  if (tableName) {
    delete _cache[tableName];
  } else {
    for (const k of Object.keys(_cache)) delete _cache[k];
  }
}

export function useTableColumnConfig(tableName: string) {
  const [config, setConfig] = useState<Record<string, boolean>>(_cache[tableName] ?? {});

  useEffect(() => {
    fetchConfig(tableName).then(setConfig);
  }, [tableName]);

  // Columns default to visible when not explicitly stored as false
  const isVisible = useCallback(
    (columnKey: string): boolean => config[columnKey] !== false,
    [config]
  );

  return { isVisible };
}
