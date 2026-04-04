'use client';

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
import { getHex } from '@/lib/colors';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_id?: number;
  company_type?: string;
  company_name?: string;
  seniority?: string;
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
  const counts: Record<string, number> = {};
  for (const a of attendees) {
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
}

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: CustomLabelProps) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

const ACTION_LABELS = [
  'Meeting Scheduled',
  'Meeting Held',
  'Social Conversation',
  'Meeting No-Show',
];

const NEXT_STEPS_LABELS = [
  'Schedule Follow Up Meeting',
  'General Follow Up',
  'Other',
];

export function AnalyticsCharts({ attendees, conferenceDetails }: AnalyticsChartsProps) {
  const colorMaps = useConfigColors();
  const seniorityAll = buildSeniorityData(attendees);
  const companyTypeData = buildCompanyTypeData(attendees);

  // Count actions — action field may contain comma-separated multiple values
  const actionCounts: Record<string, number> = {};
  for (const label of ACTION_LABELS) actionCounts[label] = 0;
  for (const d of conferenceDetails) {
    if (d.action) {
      const actions = d.action.split(',').map(s => s.trim()).filter(Boolean);
      for (const a of actions) {
        if (ACTION_LABELS.includes(a)) {
          actionCounts[a] = (actionCounts[a] || 0) + 1;
        }
      }
    }
  }

  // Count next steps
  const nextStepsCounts: Record<string, number> = {};
  for (const label of NEXT_STEPS_LABELS) nextStepsCounts[label] = 0;
  for (const d of conferenceDetails) {
    if (d.next_steps && NEXT_STEPS_LABELS.includes(d.next_steps)) {
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
      {/* Three charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company Type Breakdown */}
        <div className="card">
          <h3 className="text-base font-semibold text-procare-dark-blue mb-4 font-serif">
            Attendee Type Breakdown
          </h3>
          {companyTypeData.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No company type data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={companyTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={90}
                  dataKey="value"
                >
                  {companyTypeData.map((entry) => (
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
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Seniority Distribution */}
        <div className="card">
          <h3 className="text-base font-semibold text-procare-dark-blue mb-4 font-serif">
            Seniority Distribution — All Attendees
          </h3>
          {seniorityAll.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No attendee data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={seniorityAll}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={90}
                  dataKey="value"
                >
                  {seniorityAll.map((entry) => (
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
                <Legend />
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</p>
            {ACTION_LABELS.map((label) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{label}</span>
                <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-bold bg-procare-bright-blue text-white">
                  {actionCounts[label] || 0}
                </span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Next Steps</p>
              {NEXT_STEPS_LABELS.map((label) => (
                <div key={label} className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">{label}</span>
                  <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-bold bg-procare-dark-blue text-white">
                    {nextStepsCounts[label] || 0}
                  </span>
                </div>
              ))}
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Next Step</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activityRows.map(({ attendee, detail }) => (
                  <tr key={attendee.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/attendees/${attendee.id}`} className="text-procare-bright-blue hover:underline">
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
                            <span key={a} className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">{a}</span>
                          ))}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {detail.next_steps ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          {detail.next_steps}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                      {detail.notes || detail.next_steps_notes || <span className="text-gray-300">—</span>}
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
