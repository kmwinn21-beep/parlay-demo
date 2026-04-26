'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DisplayType } from './customColumnDefs';

export interface CustomColumnDef {
  id: number;
  table_name: string;
  column_key: string;
  label: string;
  data_key: string;
  config_category: string | null;
  is_user_field: boolean;
  display_type: DisplayType;
  display_config: { prefix?: string; icon_color?: string; name_format?: 'full' | 'initials' | 'first_last_initial' } | null;
  sort_order: number;
  visible: boolean;
}

export interface ColumnDef {
  key: string;
  label: string;
}

export interface ColumnEntry {
  visible: boolean;
  sort_order: number | null;
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
    { key: 'name',          label: 'Company Name' },
    { key: 'type',          label: 'Type' },
    { key: 'sfowner',       label: 'SF Owner' },
    { key: 'status',        label: 'Status' },
    { key: 'attendees',     label: 'Attendees' },
    { key: 'conferences',   label: 'Conferences' },
    { key: 'wse',           label: "Unit Type" },
    { key: 'updated_on',    label: 'Updated On' },
    { key: 'relationships', label: 'Relationships' },
  ],
  follow_ups: [
    { key: 'name',       label: 'Name' },
    { key: 'title',      label: 'Title' },
    { key: 'company',    label: 'Company' },
    { key: 'next_step',  label: 'Next Step' },
    { key: 'conference', label: 'Conference' },
    { key: 'rep',        label: 'Rep' },
    { key: 'notes',      label: 'Notes' },
    { key: 'status',     label: 'Status' },
  ],
  meetings: [
    { key: 'name',         label: 'Name' },
    { key: 'title',        label: 'Title' },
    { key: 'rep',          label: 'Rep' },
    { key: 'company',      label: 'Company' },
    { key: 'datetime',     label: 'Date/Time' },
    { key: 'conference',   label: 'Conference' },
    { key: 'meeting_type', label: 'Meeting Type' },
    { key: 'outcome',      label: 'Outcome' },
    { key: 'info',         label: 'Info' },
  ],
  attendee_meetings: [
    { key: 'name',         label: 'Name' },
    { key: 'title',        label: 'Title' },
    { key: 'rep',          label: 'Rep' },
    { key: 'datetime',     label: 'Date/Time' },
    { key: 'conference',   label: 'Conference' },
    { key: 'meeting_type', label: 'Meeting Type' },
    { key: 'outcome',      label: 'Outcome' },
    { key: 'info',         label: 'Info' },
  ],
  attendee_follow_ups: [
    { key: 'name',       label: 'Name' },
    { key: 'title',      label: 'Title' },
    { key: 'company',    label: 'Company' },
    { key: 'next_step',  label: 'Next Step' },
    { key: 'conference', label: 'Conference' },
    { key: 'rep',        label: 'Rep' },
    { key: 'notes',      label: 'Notes' },
    { key: 'status',     label: 'Status' },
  ],
  company_meetings: [
    { key: 'name',         label: 'Name' },
    { key: 'title',        label: 'Title' },
    { key: 'rep',          label: 'Rep' },
    { key: 'datetime',     label: 'Date/Time' },
    { key: 'conference',   label: 'Conference' },
    { key: 'meeting_type', label: 'Meeting Type' },
    { key: 'outcome',      label: 'Outcome' },
    { key: 'info',         label: 'Info' },
  ],
  conference_meetings: [
    { key: 'name',         label: 'Name' },
    { key: 'title',        label: 'Title' },
    { key: 'rep',          label: 'Rep' },
    { key: 'company',      label: 'Company' },
    { key: 'datetime',     label: 'Date/Time' },
    { key: 'meeting_type', label: 'Meeting Type' },
    { key: 'outcome',      label: 'Outcome' },
    { key: 'info',         label: 'Info' },
  ],
  company_follow_ups: [
    { key: 'name',       label: 'Name' },
    { key: 'title',      label: 'Title' },
    { key: 'company',    label: 'Company' },
    { key: 'next_step',  label: 'Next Step' },
    { key: 'conference', label: 'Conference' },
    { key: 'rep',        label: 'Rep' },
    { key: 'notes',      label: 'Notes' },
    { key: 'status',     label: 'Status' },
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
    { key: 'name',          label: 'Company Name' },
    { key: 'type',          label: 'Type' },
    { key: 'sfowner',       label: 'SF Owner' },
    { key: 'status',        label: 'Status' },
    { key: 'attendees',     label: 'Attendees' },
    { key: 'conferences',   label: 'Conferences' },
    { key: 'wse',           label: "Unit Type" },
    { key: 'updated_on',    label: 'Updated On' },
    { key: 'relationships', label: 'Relationships' },
  ],
};

// Module-level cache so all table instances share the same fetched config
const _cache: Record<string, Record<string, ColumnEntry>> = {};
const _pending: Record<string, Promise<Record<string, ColumnEntry>> | undefined> = {};

function fetchConfig(tableName: string): Promise<Record<string, ColumnEntry>> {
  if (_cache[tableName]) return Promise.resolve(_cache[tableName]);
  if (_pending[tableName]) return _pending[tableName]!;
  _pending[tableName] = fetch(`/api/admin/table-config?table=${tableName}`, { credentials: 'include' })
    .then(r => (r.ok ? r.json() : {}))
    .then((data: Record<string, ColumnEntry>) => {
      _cache[tableName] = data;
      delete _pending[tableName];
      return data;
    })
    .catch(() => ({}));
  return _pending[tableName]!;
}

export function invalidateTableColumnConfig(tableName?: string) {
  if (tableName) {
    delete _cache[tableName];
  } else {
    for (const k of Object.keys(_cache)) delete _cache[k];
  }
}

export function useTableColumnConfig(tableName: string) {
  const [config, setConfig] = useState<Record<string, ColumnEntry>>(_cache[tableName] ?? {});

  useEffect(() => {
    fetchConfig(tableName).then(setConfig);
  }, [tableName]);

  const isVisible = useCallback(
    (columnKey: string): boolean => config[columnKey]?.visible !== false,
    [config]
  );

  const orderedColumns = useMemo((): ColumnDef[] => {
    const defs = TABLE_COLUMN_DEFS[tableName] ?? [];
    return [...defs].sort((a, b) => {
      const ia = defs.findIndex(d => d.key === a.key);
      const ib = defs.findIndex(d => d.key === b.key);
      const oa = config[a.key]?.sort_order ?? ia;
      const ob = config[b.key]?.sort_order ?? ib;
      return oa - ob;
    });
  }, [tableName, config]);

  return { isVisible, orderedColumns };
}

// ── Custom columns ────────────────────────────────────────────────────────────

const _customCache: Record<string, CustomColumnDef[] | undefined> = {};
const _customPending: Record<string, Promise<CustomColumnDef[]> | undefined> = {};

function fetchCustomColumns(tableName: string): Promise<CustomColumnDef[]> {
  if (_customCache[tableName]) return Promise.resolve(_customCache[tableName]!);
  if (_customPending[tableName]) return _customPending[tableName]!;
  _customPending[tableName] = fetch(`/api/admin/custom-columns?table=${tableName}`, { credentials: 'include' })
    .then(r => (r.ok ? r.json() : []))
    .then((data: CustomColumnDef[]) => {
      _customCache[tableName] = data;
      delete _customPending[tableName];
      return data;
    })
    .catch(() => []);
  return _customPending[tableName]!;
}

export function invalidateCustomColumns(tableName?: string) {
  if (tableName) {
    delete _customCache[tableName];
  } else {
    for (const k of Object.keys(_customCache)) delete _customCache[k];
  }
}

export function useCustomColumns(tableName: string): CustomColumnDef[] {
  const [columns, setColumns] = useState<CustomColumnDef[]>(_customCache[tableName] ?? []);
  useEffect(() => {
    fetchCustomColumns(tableName).then(setColumns);
  }, [tableName]);
  return columns;
}
