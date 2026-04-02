'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { classifySeniority } from '@/lib/parsers';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_type?: string;
  company_name?: string;
}

interface AnalyticsChartsProps {
  attendees: Attendee[];
}

const SENIORITY_COLORS: Record<string, string> = {
  'C-Suite': '#0B3C62',
  'VP Level': '#1B76BC',
  'Director': '#FFCB3F',
  'Manager': '#E7DED9',
  'Other': '#9ca3af',
};

const COMPANY_TYPE_COLORS: Record<string, string> = {
  '3rd Party Operator': '#0B3C62',
  'Owner/Operator': '#1B76BC',
  'Capital Partner': '#FFCB3F',
  'Vendor': '#E7DED9',
  'Partner': '#34d399',
  'Other': '#9ca3af',
};

function buildSeniorityData(attendees: Attendee[]) {
  const counts: Record<string, number> = {};
  for (const a of attendees) {
    const level = classifySeniority(a.title);
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

export function AnalyticsCharts({ attendees }: AnalyticsChartsProps) {
  const thirdPartyAttendees = attendees.filter(
    (a) => a.company_type === '3rd Party Operator'
  );
  const ownerOperatorAttendees = attendees.filter(
    (a) => a.company_type === 'Owner/Operator'
  );

  const seniorityAll = buildSeniorityData(attendees);
  const seniorityThirdParty = buildSeniorityData(thirdPartyAttendees);
  const seniorityOwnerOp = buildSeniorityData(ownerOperatorAttendees);
  const companyTypeData = buildCompanyTypeData(attendees);

  return (
    <div className="space-y-8">
      {/* Company Type Breakdown */}
      <div className="card">
        <h3 className="text-lg font-semibold text-procare-dark-blue mb-4 font-serif">
          Attendee Type Breakdown
        </h3>
        {companyTypeData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No company type data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={companyTypeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={100}
                dataKey="value"
              >
                {companyTypeData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={COMPANY_TYPE_COLORS[entry.name] || '#9ca3af'}
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

      {/* Seniority Distribution - All */}
      <div className="card">
        <h3 className="text-lg font-semibold text-procare-dark-blue mb-4 font-serif">
          Seniority Distribution — All Attendees
        </h3>
        {seniorityAll.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No attendee data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={seniorityAll}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={100}
                dataKey="value"
              >
                {seniorityAll.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={SENIORITY_COLORS[entry.name] || '#9ca3af'}
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

      {/* Side by side: 3rd Party vs Owner/Operator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-base font-semibold text-procare-dark-blue mb-4 font-serif">
            Seniority — 3rd Party Operators
            <span className="text-xs text-gray-500 ml-2 font-normal font-sans">
              ({thirdPartyAttendees.length} attendees)
            </span>
          </h3>
          {seniorityThirdParty.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No 3rd Party Operator attendees.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={seniorityThirdParty}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={90}
                  dataKey="value"
                >
                  {seniorityThirdParty.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={SENIORITY_COLORS[entry.name] || '#9ca3af'}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 className="text-base font-semibold text-procare-dark-blue mb-4 font-serif">
            Seniority — Owner/Operators
            <span className="text-xs text-gray-500 ml-2 font-normal font-sans">
              ({ownerOperatorAttendees.length} attendees)
            </span>
          </h3>
          {seniorityOwnerOp.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No Owner/Operator attendees.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={seniorityOwnerOp}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={90}
                  dataKey="value"
                >
                  {seniorityOwnerOp.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={SENIORITY_COLORS[entry.name] || '#9ca3af'}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
