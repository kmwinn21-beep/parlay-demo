'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { effectiveSeniority } from '@/lib/parsers';
import { useConfigColors } from '@/lib/useConfigColors';
import { useConfigOptions } from '@/lib/useConfigOptions';
import { getHex, getBadgeClass } from '@/lib/colors';
import { NotesPopover } from './NotesPopover';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_id?: number;
  company_type?: string;
  company_name?: string;
  seniority?: string;
  entity_notes_count?: number;
}

interface ConferenceDetail {
  attendee_id: number;
  conference_id?: number;
  action?: string;
  next_steps?: string;
  next_steps_notes?: string;
  notes?: string;
}

interface AnalyticsChartsProps {
  attendees: Attendee[];
  conferenceDetails: ConferenceDetail[];
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

export function AnalyticsCharts({ attendees, conferenceDetails }: AnalyticsChartsProps) {
  const colorMaps = useConfigColors();
  const configOptions = useConfigOptions();
  const seniorityAll = buildSeniorityData(attendees);
  const companyTypeData = buildCompanyTypeData(attendees);

  // Visibility toggles for company type and seniority charts
  const [visibleCompanyTypes, setVisibleCompanyTypes] = useState<Set<string> | null>(null);
  const [showCompanyTypeFilter, setShowCompanyTypeFilter] = useState(false);
  const [visibleSeniorities, setVisibleSeniorities] = useState<Set<string> | null>(null);
  const [showSeniorityFilter, setShowSeniorityFilter] = useState(false);

  const allCompanyTypeNames = companyTypeData.map(d => d.name);
  const allSeniorityNames = seniorityAll.map(d => d.name);

  const effectiveVisibleCompanyTypes = visibleCompanyTypes ?? new Set(allCompanyTypeNames);
  const effectiveVisibleSeniorities = visibleSeniorities ?? new Set(allSeniorityNames);

  const filteredCompanyTypeData = companyTypeData.filter(d => effectiveVisibleCompanyTypes.has(d.name));
  const filteredSeniorityData = seniorityAll.filter(d => effectiveVisibleSeniorities.has(d.name));

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

  // Dynamic labels from Admin Panel config
  const actionLabels = configOptions.action || [];
  const nextStepsLabels = configOptions.next_steps || [];

  // Visibility toggles — all visible by default
  const [visibleActions, setVisibleActions] = useState<Set<string> | null>(null);
  const [visibleNextSteps, setVisibleNextSteps] = useState<Set<string> | null>(null);
  const [showActionFilter, setShowActionFilter] = useState(false);
  const [showNextStepsFilter, setShowNextStepsFilter] = useState(false);

  // Initialize visibility sets once options load
  const effectiveVisibleActions = visibleActions ?? new Set(actionLabels);
  const effectiveVisibleNextSteps = visibleNextSteps ?? new Set(nextStepsLabels);

  const toggleAction = (label: string) => {
    const current = new Set(effectiveVisibleActions);
    if (current.has(label)) {
      current.delete(label);
    } else {
      current.add(label);
    }
    setVisibleActions(current);
  };

  const toggleNextStep = (label: string) => {
    const current = new Set(effectiveVisibleNextSteps);
    if (current.has(label)) {
      current.delete(label);
    } else {
      current.add(label);
    }
    setVisibleNextSteps(current);
  };

  // Filtered labels based on visibility selection
  const filteredActionLabels = actionLabels.filter(l => effectiveVisibleActions.has(l));
  const filteredNextStepsLabels = nextStepsLabels.filter(l => effectiveVisibleNextSteps.has(l));

  // Count actions — action field may contain comma-separated multiple values
  const actionCounts: Record<string, number> = {};
  for (const label of actionLabels) actionCounts[label] = 0;
  for (const d of conferenceDetails) {
    if (d.action) {
      const actions = d.action.split(',').map(s => s.trim()).filter(Boolean);
      for (const a of actions) {
        if (actionLabels.includes(a)) {
          actionCounts[a] = (actionCounts[a] || 0) + 1;
        }
      }
    }
  }

  // Count next steps
  const nextStepsCounts: Record<string, number> = {};
  for (const label of nextStepsLabels) nextStepsCounts[label] = 0;
  for (const d of conferenceDetails) {
    if (d.next_steps && nextStepsLabels.includes(d.next_steps)) {
      nextStepsCounts[d.next_steps] = (nextStepsCounts[d.next_steps] || 0) + 1;
    }
  }

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

  return (
    <div className="space-y-8">
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company Type Breakdown */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-procare-dark-blue font-serif">
              Company Type Breakdown
            </h3>
            <button
              type="button"
              onClick={() => setShowCompanyTypeFilter(!showCompanyTypeFilter)}
              className="text-sm text-procare-bright-blue hover:text-procare-dark-blue flex items-center gap-1"
              title="Filter visible company types"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filter
            </button>
          </div>
          {showCompanyTypeFilter && (
            <div className="bg-gray-50 rounded-lg p-2 space-y-1 mb-3">
              {allCompanyTypeNames.map((name) => (
                <label key={name} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                  <input
                    type="checkbox"
                    checked={effectiveVisibleCompanyTypes.has(name)}
                    onChange={() => toggleCompanyType(name)}
                    className="rounded border-gray-300 text-procare-bright-blue focus:ring-procare-bright-blue h-3.5 w-3.5"
                  />
                  {name}
                </label>
              ))}
            </div>
          )}
          {filteredCompanyTypeData.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No company type data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={filteredCompanyTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  innerRadius={50}
                  outerRadius={90}
                  dataKey="value"
                >
                  {filteredCompanyTypeData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={getHex(entry.name, colorMaps.company_type || {})}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [value, name]}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Legend   align="center"   className="text-xs sm:text-sm"   wrapperStyle={{     fontSize: 'clamp(10px, 1vw, 12px)',     lineHeight: '1.8',     paddingTop: '14px',     marginTop: '14px',   }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Seniority Distribution */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-procare-dark-blue font-serif">
              Attendee Seniority
            </h3>
            <button
              type="button"
              onClick={() => setShowSeniorityFilter(!showSeniorityFilter)}
              className="text-sm text-procare-bright-blue hover:text-procare-dark-blue flex items-center gap-1"
              title="Filter visible seniority levels"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filter
            </button>
          </div>
          {showSeniorityFilter && (
            <div className="bg-gray-50 rounded-lg p-2 space-y-1 mb-3">
              {allSeniorityNames.map((name) => (
                <label key={name} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                  <input
                    type="checkbox"
                    checked={effectiveVisibleSeniorities.has(name)}
                    onChange={() => toggleSeniority(name)}
                    className="rounded border-gray-300 text-procare-bright-blue focus:ring-procare-bright-blue h-3.5 w-3.5"
                  />
                  {name}
                </label>
              ))}
            </div>
          )}
          {filteredSeniorityData.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No attendee data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={filteredSeniorityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  innerRadius={50}
                  outerRadius={90}
                  dataKey="value"
                >
                  {filteredSeniorityData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={getHex(entry.name, colorMaps.seniority || {})}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [value, name]}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Legend   align="center"   className="text-xs sm:text-sm"   wrapperStyle={{     fontSize: 'clamp(10px, 1vw, 12px)',     lineHeight: '1.8',     paddingTop: '14px',     marginTop: '14px',   }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Actions & Next Steps */}
        <div className="card">
          <h3 className="text-base font-semibold text-procare-dark-blue mb-4 font-serif">
            Actions &amp; Next Steps
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Actions</p>
              <button
                type="button"
                onClick={() => setShowActionFilter(!showActionFilter)}
                className="text-sm text-procare-bright-blue hover:text-procare-dark-blue flex items-center gap-1"
                title="Filter visible actions"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filter
              </button>
            </div>
            {showActionFilter && (
              <div className="bg-gray-50 rounded-lg p-2 space-y-1">
                {actionLabels.map((label) => (
                  <label key={label} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                    <input
                      type="checkbox"
                      checked={effectiveVisibleActions.has(label)}
                      onChange={() => toggleAction(label)}
                      className="rounded border-gray-300 text-procare-bright-blue focus:ring-procare-bright-blue h-3.5 w-3.5"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
            {filteredActionLabels.map((label) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{label}</span>
                <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-sm font-bold bg-procare-bright-blue text-white">
                  {actionCounts[label] || 0}
                </span>
              </div>
            ))}
            {filteredActionLabels.length === 0 && (
              <p className="text-sm text-gray-400 italic">No actions selected</p>
            )}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Next Steps</p>
                <button
                  type="button"
                  onClick={() => setShowNextStepsFilter(!showNextStepsFilter)}
                  className="text-sm text-procare-bright-blue hover:text-procare-dark-blue flex items-center gap-1"
                  title="Filter visible next steps"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filter
                </button>
              </div>
              {showNextStepsFilter && (
                <div className="bg-gray-50 rounded-lg p-2 space-y-1 mb-2">
                  {nextStepsLabels.map((label) => (
                    <label key={label} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                      <input
                        type="checkbox"
                        checked={effectiveVisibleNextSteps.has(label)}
                        onChange={() => toggleNextStep(label)}
                        className="rounded border-gray-300 text-procare-bright-blue focus:ring-procare-bright-blue h-3.5 w-3.5"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}
              {filteredNextStepsLabels.map((label) => (
                <div key={label} className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">{label}</span>
                  <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-sm font-bold bg-procare-dark-blue text-white">
                    {nextStepsCounts[label] || 0}
                  </span>
                </div>
              ))}
              {filteredNextStepsLabels.length === 0 && (
                <p className="text-sm text-gray-400 italic">No next steps selected</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Attendee Activity Table */}
      {activityRows.length > 0 && (
        <div className="card">
          <h3 className="text-base font-semibold text-procare-dark-blue mb-4 font-serif">
            Attendee Activity
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Next Step</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activityRows.map(({ attendee, detail }) => (
                  <tr key={attendee.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium overflow-hidden" style={{ maxWidth: 220 }}>
                      <Link href={`/attendees/${attendee.id}`} className="text-procare-bright-blue hover:underline block truncate" title={`${attendee.first_name} ${attendee.last_name}`}>
                        {attendee.first_name} {attendee.last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">
                      {attendee.title || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 max-w-[140px] truncate">
                      {attendee.company_name ? (
                        attendee.company_id ? (
                          <Link href={`/companies/${attendee.company_id}`} className="text-procare-bright-blue hover:underline">{attendee.company_name}</Link>
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
                        <span className="inline-flex px-2 py-0.5 rounded-full text-sm font-semibold bg-green-100 text-green-800">
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
