'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { effectiveSeniority } from '@/lib/parsers';
import { useConfigColors } from '@/lib/useConfigColors';
import { getHex, getBadgeClass, type ColorMap } from '@/lib/colors';
import { parseRepIds } from '@/lib/useUserOptions';
import { useUser } from '@/components/UserContext';
import { NotesPopover } from './NotesPopover';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_id?: number;
  company_type?: string;
  company_name?: string;
  company_icp?: string | null;
  company_assigned_user?: string | null;
  seniority?: string;
  function?: string;
  entity_notes_count?: number;
}

interface ConferenceDetail {
  attendee_id: number;
  conference_id?: number;
  action?: string;
  next_steps?: string;
  next_steps_notes?: string;
  notes?: string;
  assigned_rep?: string;
}

interface ActionConfig {
  id: number;
  value: string;
  action_key: string | null;
}

interface AnalyticsChartsProps {
  attendees: Attendee[];
  conferenceDetails: ConferenceDetail[];
  conferenceName: string;
  actionConfigs: ActionConfig[];
}

function buildSeniorityData(attendees: Attendee[]) {
  const counts: Record<string, number> = {};
  for (const a of attendees) {
    const level = effectiveSeniority(a.seniority, a.title);
    counts[level] = (counts[level] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Attendees by function.
 *
 * Everyone is counted, including those with no function recorded — the chart
 * is a breakdown of the attendee list, and quietly dropping the blanks would
 * make the slices add up to fewer people than the tab's own header claims.
 */
function buildFunctionData(attendees: Attendee[]) {
  const counts: Record<string, number> = {};
  for (const a of attendees) {
    const name = (a.function ?? '').trim() || 'Unspecified';
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildCompanyTypeData(attendees: Attendee[]) {
  const seen = new Set<number>();
  const counts: Record<string, number> = {};
  for (const a of attendees) {
    // Count each company only once (by company_id)
    if (a.company_id != null) {
      if (seen.has(a.company_id)) continue;
      seen.add(a.company_id);
    }
    const type = a.company_type || 'Other';
    counts[type] = (counts[type] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

interface CustomLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  value: number;
}

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }: CustomLabelProps) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {value}
    </text>
  );
}

interface Slice { name: string; value: number }
interface ExpandedChart { title: string; data: Slice[]; colorMap: ColorMap; filters: string[] }

const LEGEND_STYLE = {
  fontSize: 'clamp(12px, 1vw, 14px)',
  lineHeight: '1.8',
  paddingTop: '14px',
  marginTop: '14px',
} as const;

/**
 * One donut, sized to sit three-across.
 *
 * The key is left off here — three legends side by side take more room than
 * the charts do, and at this width they wrap into an unreadable block. The
 * chart is a button instead: opening it gives the larger version with its key.
 */
function DonutCard({ title, filterTitle, data, allNames, visible, onToggle, showFilter, onToggleFilter, colorMap, onExpand }: {
  title: string;
  filterTitle: string;
  data: Slice[];
  allNames: string[];
  visible: Set<string>;
  onToggle: (name: string) => void;
  showFilter: boolean;
  onToggleFilter: () => void;
  colorMap: ColorMap;
  onExpand: () => void;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-base font-semibold text-brand-primary font-serif truncate">{title}</h3>
        <button
          type="button"
          onClick={onToggleFilter}
          className="text-sm text-brand-secondary hover:text-brand-primary flex items-center gap-1 flex-shrink-0"
          title={filterTitle}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filter
        </button>
      </div>
      {showFilter && (
        <div className="bg-gray-50 rounded-lg p-2 space-y-1 mb-3">
          {allNames.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
              <input
                type="checkbox"
                checked={visible.has(name)}
                onChange={() => onToggle(name)}
                className="rounded border-gray-300 text-brand-secondary focus:ring-brand-secondary h-3.5 w-3.5"
              />
              {name}
            </label>
          ))}
        </div>
      )}
      {data.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No attendee data available.</p>
      ) : (
        <button
          type="button"
          onClick={onExpand}
          className="w-full rounded-lg hover:bg-gray-50 transition-colors"
          title={`Expand ${title}`}
        >
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" labelLine={false} label={renderCustomLabel} innerRadius={45} outerRadius={92} dataKey="value" isAnimationActive={false}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={getHex(entry.name, colorMap)} />
                ))}
              </Pie>
              {/* Without the key on the card, this is the only way to read a
                  slice without opening it. */}
              <Tooltip
                formatter={(value: number, name: string) => [value, name]}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </button>
      )}
    </div>
  );
}

/** The same donut with room to breathe, and the key that the card omits. */
function DonutModal({ chart, onClose }: { chart: ExpandedChart; onClose: () => void }) {
  const total = chart.data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-brand-primary font-serif">{chart.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{total} attendees</p>
            {/* What the numbers are counting. Without this the expanded chart
                looks like the whole conference when it is a slice of it. */}
            {chart.filters.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {chart.filters.map(f => (
                  <span key={f} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-accent/20 text-brand-primary border border-brand-accent">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-4 pb-5">
          <ResponsiveContainer width="100%" height={440}>
            <PieChart>
              <Pie data={chart.data} cx="50%" cy="50%" labelLine={false} label={renderCustomLabel} innerRadius={80} outerRadius={160} dataKey="value">
                {chart.data.map((entry) => (
                  <Cell key={entry.name} fill={getHex(entry.name, chart.colorMap)} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number, name: string) => [value, name]} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Legend align="center" wrapperStyle={LEGEND_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsCharts({ attendees, conferenceDetails, conferenceName, actionConfigs }: AnalyticsChartsProps) {
  const colorMaps = useConfigColors();
  const { user: currentUser } = useUser();

  // Quick filters over the whole tab. Same meanings as the attendee table's
  // chips, so a filter reads the same wherever it is applied: ICP is the
  // company's ICP flag, My Accounts is the signed-in rep on the company, and
  // the type buttons match the company's type.
  const [quickIcp, setQuickIcp] = useState(false);
  const [quickMyAccounts, setQuickMyAccounts] = useState(false);
  const [quickTypes, setQuickTypes] = useState<Set<string>>(new Set());
  const [icpTypeOptions, setIcpTypeOptions] = useState<string[]>([]);
  const defaultsApplied = useRef(false);

  useEffect(() => {
    fetch('/api/admin/icp-rules', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { rules?: { category: string; conditions: { option_value: string }[] }[] } | null) => {
        const rule = data?.rules?.find(r => r.category === 'company_type');
        setIcpTypeOptions(rule ? rule.conditions.map(c => c.option_value).filter(Boolean) : []);
      })
      .catch(() => {});
  }, []);

  // The account's own target audience is the view worth opening on, so the ICP
  // company types start selected. Applied once: re-applying would undo the
  // reader's own choices every time this list resolved again.
  useEffect(() => {
    if (defaultsApplied.current || icpTypeOptions.length === 0) return;
    defaultsApplied.current = true;
    setQuickTypes(new Set(icpTypeOptions));
  }, [icpTypeOptions]);

  const typeButtons = useMemo(() => {
    const dynamic = icpTypeOptions.filter(t => t !== 'Customer');
    return [...dynamic, 'Customer'];
  }, [icpTypeOptions]);

  const filteredAttendees = useMemo(() => attendees.filter(a => {
    if (quickIcp && a.company_icp !== 'Yes') return false;
    if (quickMyAccounts && !(currentUser?.configId != null && parseRepIds(a.company_assigned_user).includes(currentUser.configId))) return false;
    if (quickTypes.size > 0 && !quickTypes.has(a.company_type || '')) return false;
    return true;
  }), [attendees, quickIcp, quickMyAccounts, quickTypes, currentUser]);

  /** What is being counted, for the pill on an expanded chart. */
  const activeFilters = useMemo(() => {
    const out: string[] = [];
    if (quickMyAccounts) out.push('My Accounts');
    if (quickIcp) out.push('ICP');
    for (const t of typeButtons) if (quickTypes.has(t)) out.push(t === 'Customer' ? 'Customers' : t);
    return out;
  }, [quickMyAccounts, quickIcp, quickTypes, typeButtons]);

  const showingAll = !quickIcp && !quickMyAccounts && quickTypes.size === 0;
  const toggleType = (type: string) => setQuickTypes(prev => {
    const next = new Set(prev);
    if (next.has(type)) next.delete(type); else next.add(type);
    return next;
  });
  const clearFilters = () => { setQuickIcp(false); setQuickMyAccounts(false); setQuickTypes(new Set()); };

  const seniorityAll = buildSeniorityData(filteredAttendees);
  const companyTypeData = buildCompanyTypeData(filteredAttendees);
  const functionAll = buildFunctionData(filteredAttendees);

  // Visibility toggles for company type and seniority charts
  const [visibleCompanyTypes, setVisibleCompanyTypes] = useState<Set<string> | null>(null);
  const [showCompanyTypeFilter, setShowCompanyTypeFilter] = useState(false);
  const [visibleSeniorities, setVisibleSeniorities] = useState<Set<string> | null>(null);
  const [showSeniorityFilter, setShowSeniorityFilter] = useState(false);
  const [visibleFunctions, setVisibleFunctions] = useState<Set<string> | null>(null);
  const [showFunctionFilter, setShowFunctionFilter] = useState(false);
  const [expandedChart, setExpandedChart] = useState<ExpandedChart | null>(null);

  const allCompanyTypeNames = companyTypeData.map(d => d.name);
  const allSeniorityNames = seniorityAll.map(d => d.name);
  const allFunctionNames = functionAll.map(d => d.name);

  const effectiveVisibleCompanyTypes = visibleCompanyTypes ?? new Set(allCompanyTypeNames);
  const effectiveVisibleSeniorities = visibleSeniorities ?? new Set(allSeniorityNames);
  const effectiveVisibleFunctions = visibleFunctions ?? new Set(allFunctionNames);

  const filteredCompanyTypeData = companyTypeData.filter(d => effectiveVisibleCompanyTypes.has(d.name));
  const filteredSeniorityData = seniorityAll.filter(d => effectiveVisibleSeniorities.has(d.name));
  const filteredFunctionData = functionAll.filter(d => effectiveVisibleFunctions.has(d.name));

  const toggleCompanyType = (name: string) => {
    const current = new Set(effectiveVisibleCompanyTypes);
    if (current.has(name)) current.delete(name); else current.add(name);
    setVisibleCompanyTypes(current);
  };

  const toggleSeniority = (name: string) => {
    const current = new Set(effectiveVisibleSeniorities);
    if (current.has(name)) current.delete(name); else current.add(name);
    setVisibleSeniorities(current);
  };

  const toggleFunction = (name: string) => {
    const current = new Set(effectiveVisibleFunctions);
    if (current.has(name)) current.delete(name); else current.add(name);
    setVisibleFunctions(current);
  };

  // Build attendee activity table (attendees with action OR next_steps)
  const detailMap = new Map<number, ConferenceDetail>();
  for (const d of conferenceDetails) {
    if (d.action || d.next_steps) {
      detailMap.set(Number(d.attendee_id), d);
    }
  }
  const attendeeMap = new Map<number, Attendee>();
  for (const a of attendees) attendeeMap.set(a.id, a);

  const activityRows: Array<{ attendee: Attendee; detail: ConferenceDetail }> = [];
  detailMap.forEach((detail, aid) => {
    const attendee = attendeeMap.get(aid);
    if (attendee) activityRows.push({ attendee, detail });
  });

  // Meetings Summary chart — resolve meeting actions by action_key (ID-based) from config
  // Each action_key stably identifies a meeting action regardless of display name changes
  const MEETING_KEYS = ['meeting_scheduled', 'meeting_held', 'rescheduled', 'cancelled', 'no_show'] as const;
  const MEETING_CHART_LABELS: Record<string, string> = {
    meeting_scheduled: 'Scheduled/Pending',
    meeting_held: 'Held',
    rescheduled: 'Rescheduled',
    cancelled: 'Cancelled',
    no_show: 'No-Show',
  };

  // Fallback name patterns for matching when action_key is not yet set
  const MEETING_KEY_PATTERNS: Record<string, RegExp> = {
    meeting_scheduled: /meeting\s*scheduled/i,
    meeting_held: /meeting\s*held/i,
    rescheduled: /reschedul/i,
    cancelled: /cancel/i,
    no_show: /no[\s-]*show/i,
  };

  // Build lookup: action_key → { id, displayName } using config option IDs
  // Primary: match by action_key field; Fallback: match by name pattern
  const keyToConfig: Record<string, { id: number; displayName: string }> = {};
  for (const key of MEETING_KEYS) {
    // First try exact action_key match
    const byKey = actionConfigs.find(cfg => cfg.action_key === key);
    if (byKey) {
      keyToConfig[key] = { id: byKey.id, displayName: byKey.value };
    } else {
      // Fallback: match by name pattern against action configs
      const byPattern = actionConfigs.find(cfg => MEETING_KEY_PATTERNS[key]?.test(cfg.value));
      if (byPattern) {
        keyToConfig[key] = { id: byPattern.id, displayName: byPattern.value };
      }
    }
  }

  // Map display names for chart labels and legend
  const meetingActionDisplayNames: Record<string, string> = {};
  for (const key of MEETING_KEYS) {
    if (keyToConfig[key]) {
      meetingActionDisplayNames[keyToConfig[key].displayName] = MEETING_CHART_LABELS[key];
    }
  }

  // Count conference details by matching action text against resolved display names
  const resolvedKeys = MEETING_KEYS.filter(k => keyToConfig[k]);
  const meetingCounts: Record<string, number> = {};
  for (const key of resolvedKeys) meetingCounts[key] = 0;

  for (const d of conferenceDetails) {
    if (d.action) {
      const actions = d.action.split(',').map(s => s.trim()).filter(Boolean);
      for (const a of actions) {
        for (const key of resolvedKeys) {
          if (a === keyToConfig[key].displayName) {
            meetingCounts[key]++;
            break;
          }
        }
      }
    }
  }

  const meetingsScheduledTotal = meetingCounts['meeting_scheduled'] || 0;
  const allMeetingKeys = MEETING_KEYS.filter(k => keyToConfig[k]);
  const totalMeetingActions = allMeetingKeys.reduce((sum, k) => sum + (meetingCounts[k] || 0), 0);
  // For the bar chart, "Meetings Scheduled" = total scheduled minus all outcome counts
  const outcomeKeys = ['meeting_held', 'rescheduled', 'cancelled', 'no_show'] as const;
  const outcomeSum = outcomeKeys.reduce((sum, k) => sum + (meetingCounts[k] || 0), 0);
  const scheduledBarValue = Math.max(0, meetingsScheduledTotal - outcomeSum);
  const meetingSummaryData: Record<string, string | number>[] = totalMeetingActions > 0
    ? [{
        name: 'Meetings',
        ...Object.fromEntries(allMeetingKeys.map(key => [
          keyToConfig[key].displayName,
          key === 'meeting_scheduled' ? scheduledBarValue : (meetingCounts[key] || 0),
        ])),
      }]
    : [];
  const meetingOutcomeKeys = allMeetingKeys.map(k => keyToConfig[k].displayName);

  const meetingsChartTitle = conferenceName
    ? `${conferenceName} Meetings Summary`
    : 'Meetings Summary';

  const makeMeetingLabel = (dataKey: string) => {
    const MeetingLabel = (props: any) => {
      const { x, y, width, height, index } = props;
      const entry = meetingSummaryData[index];
      const segmentValue = entry ? (entry[dataKey] as number) : 0;
      if (!segmentValue || segmentValue < 1) return <text />;
      const text = `${segmentValue}`;
      const textWidth = text.length * 7;
      if (width < textWidth + 4 || height < 14) return <text />;
      return (
        <text
          x={x + width / 2}
          y={y + height / 2}
          fill="white"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fontWeight={600}
        >
          {text}
        </text>
      );
    };
    MeetingLabel.displayName = `MeetingLabel(${dataKey})`;
    return MeetingLabel;
  };

  return (
    <div className="space-y-8">
      {/* Charts */}
      {/* One row of filters over all three charts, so they always describe the
          same population — reading a seniority split against one audience and a
          function split against another would be worse than no filter at all. */}
      <div className="flex flex-wrap items-center gap-2">
        {currentUser && (
          <button
            type="button"
            onClick={() => setQuickMyAccounts(v => !v)}
            aria-pressed={quickMyAccounts}
            className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors border-brand-secondary bg-brand-secondary/10 text-brand-secondary${!showingAll && !quickMyAccounts ? ' opacity-40 grayscale' : ''}`}
          >
            My Accounts
          </button>
        )}
        <button
          type="button"
          onClick={() => setQuickIcp(v => !v)}
          aria-pressed={quickIcp}
          className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            quickIcp ? 'border-brand-accent bg-brand-accent/20 text-brand-primary' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
          }${!showingAll && !quickIcp ? ' opacity-40 grayscale' : ''}`}
        >
          ICP
        </button>
        {typeButtons.map(type => (
          <button
            key={type}
            type="button"
            onClick={() => toggleType(type)}
            aria-pressed={quickTypes.has(type)}
            className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              quickTypes.has(type) ? 'border-brand-accent bg-brand-accent/20 text-brand-primary' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
            }${!showingAll && !quickTypes.has(type) ? ' opacity-40 grayscale' : ''}`}
          >
            {type === 'Customer' ? 'Customers' : type}
          </button>
        ))}
        <button
          type="button"
          onClick={clearFilters}
          aria-pressed={showingAll}
          className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            showingAll ? 'border-brand-secondary bg-brand-secondary text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
          }`}
        >
          All
        </button>
        <span className="text-xs text-gray-400 ml-1">
          {filteredAttendees.length} of {attendees.length} attendees
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DonutCard
          title="Company Type Breakdown"
          filterTitle="Filter visible company types"
          data={filteredCompanyTypeData}
          allNames={allCompanyTypeNames}
          visible={effectiveVisibleCompanyTypes}
          onToggle={toggleCompanyType}
          showFilter={showCompanyTypeFilter}
          onToggleFilter={() => setShowCompanyTypeFilter(!showCompanyTypeFilter)}
          colorMap={colorMaps.company_type || {}}
          onExpand={() => setExpandedChart({ title: 'Company Type Breakdown', data: filteredCompanyTypeData, colorMap: colorMaps.company_type || {}, filters: activeFilters })}
        />
        <DonutCard
          title="Attendee Seniority"
          filterTitle="Filter visible seniority levels"
          data={filteredSeniorityData}
          allNames={allSeniorityNames}
          visible={effectiveVisibleSeniorities}
          onToggle={toggleSeniority}
          showFilter={showSeniorityFilter}
          onToggleFilter={() => setShowSeniorityFilter(!showSeniorityFilter)}
          colorMap={colorMaps.seniority || {}}
          onExpand={() => setExpandedChart({ title: 'Attendee Seniority', data: filteredSeniorityData, colorMap: colorMaps.seniority || {}, filters: activeFilters })}
        />
        <DonutCard
          title="Attendee Function"
          filterTitle="Filter visible functions"
          data={filteredFunctionData}
          allNames={allFunctionNames}
          visible={effectiveVisibleFunctions}
          onToggle={toggleFunction}
          showFilter={showFunctionFilter}
          onToggleFilter={() => setShowFunctionFilter(!showFunctionFilter)}
          colorMap={colorMaps.function || {}}
          onExpand={() => setExpandedChart({ title: 'Attendee Function', data: filteredFunctionData, colorMap: colorMaps.function || {}, filters: activeFilters })}
        />
      </div>

      {expandedChart && (
        <DonutModal chart={expandedChart} onClose={() => setExpandedChart(null)} />
      )}

      {/* Horizontal Stacked Bar Chart — Meetings Summary */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-brand-primary font-serif">
            {meetingsChartTitle}
          </h3>
          <span className="text-sm text-gray-500">
            Total Meetings Scheduled: {meetingsScheduledTotal}
          </span>
        </div>
        {meetingSummaryData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No meetings data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={meetingSummaryData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              barSize={36}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12 }}
                width={80}
              />
              <Tooltip
                formatter={(value: any, name: any) => {
                  return [value, meetingActionDisplayNames[name] || name];
                }}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <Legend
                align="center"
                formatter={(value: string) => meetingActionDisplayNames[value] || value}
                wrapperStyle={{
                  fontSize: 'clamp(12px, 1vw, 14px)',
                  lineHeight: '1.8',
                  paddingTop: '14px',
                  marginTop: '14px',
                }}
              />
              {meetingOutcomeKeys.map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="meetings"
                  fill={getHex(key, colorMaps.action || {})}
                  name={key}
                  label={makeMeetingLabel(key)}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Attendee Activity Table */}
      {activityRows.length > 0 && (
        <div className="card">
          <h3 className="text-base font-semibold text-brand-primary mb-4 font-serif">
            Attendee Activity
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activityRows.map(({ attendee, detail }) => (
                  <tr key={attendee.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium overflow-hidden" style={{ maxWidth: 220 }}>
                      <Link href={`/attendees/${attendee.id}`} className="text-brand-secondary hover:underline block break-word" title={`${attendee.first_name} ${attendee.last_name}`}>
                        {attendee.first_name} {attendee.last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[140px] break-word">
                      {attendee.title || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 max-w-[140px] break-word">
                      {attendee.company_name ? (
                        attendee.company_id ? (
                          <Link href={`/companies/${attendee.company_id}`} className="text-brand-secondary hover:underline">{attendee.company_name}</Link>
                        ) : <span className="text-gray-600">{attendee.company_name}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {detail.action ? (
                        <div className="flex flex-wrap gap-1">
                          {detail.action.split(',').map(a => a.trim()).filter(Boolean).map(a => (
                            <span key={a} className={getBadgeClass(a, colorMaps.action || {})}>{a}</span>
                          ))}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {detail.next_steps ? (
                        <span className={getBadgeClass(detail.next_steps, colorMaps.next_steps || {})}>
                          {detail.next_steps}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {Number(attendee.entity_notes_count ?? 0) > 0 ? (
                        <NotesPopover attendeeId={attendee.id} notesCount={Number(attendee.entity_notes_count)} />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
