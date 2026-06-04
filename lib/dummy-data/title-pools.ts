export const functions = [
  'Finance', 'Operations', 'IT', 'Clinical', 'HR', 'Marketing', 'Strategy',
  'Supply Chain', 'Procurement',
] as const;

export type OrgFunction = typeof functions[number];

export const titlePools = {
  csuite: {
    Finance:       ['Chief Financial Officer', 'CFO'],
    Operations:    ['Chief Operating Officer', 'COO'],
    IT:            ['Chief Information Officer', 'Chief Technology Officer', 'CIO', 'CTO'],
    Clinical:      ['Chief Medical Officer', 'Chief Nursing Officer', 'CMO', 'CNO', 'Chief Clinical Officer'],
    HR:            ['Chief Human Resources Officer', 'CHRO', 'Chief People Officer'],
    Marketing:     ['Chief Marketing Officer', 'CMO', 'Chief Growth Officer'],
    Strategy:      ['Chief Strategy Officer', 'Chief Executive Officer', 'CEO', 'President'],
    'Supply Chain':['Chief Supply Chain Officer', 'Chief Procurement Officer'],
    Procurement:   ['Chief Procurement Officer', 'Chief Supply Chain Officer'],
  } as Record<string, string[]>,

  vp: {
    Finance:       ['VP of Finance', 'SVP Finance', 'VP Financial Planning', 'SVP Corporate Finance', 'VP Treasury'],
    Operations:    ['VP of Operations', 'SVP Operations', 'VP Operational Excellence', 'SVP Business Operations'],
    IT:            ['VP of Information Technology', 'SVP IT', 'VP Technology', 'SVP Digital Transformation', 'VP Infrastructure'],
    Clinical:      ['VP of Clinical Operations', 'SVP Clinical Services', 'VP Patient Care', 'VP Medical Affairs', 'SVP Quality'],
    HR:            ['VP of Human Resources', 'SVP Human Capital', 'VP Talent Management', 'SVP People & Culture'],
    Marketing:     ['VP of Marketing', 'SVP Marketing', 'VP Growth', 'VP Demand Generation', 'SVP Brand'],
    Strategy:      ['VP of Strategy', 'SVP Corporate Development', 'VP Business Development', 'VP Partnerships'],
    'Supply Chain':['VP of Supply Chain', 'SVP Supply Chain', 'VP Logistics', 'SVP Procurement'],
    Procurement:   ['VP of Procurement', 'SVP Sourcing', 'VP Strategic Sourcing'],
  } as Record<string, string[]>,

  director: {
    Finance:       ['Director of Finance', 'Director of FP&A', 'Director of Accounting', 'Director of Revenue Cycle'],
    Operations:    ['Director of Operations', 'Director of Facilities', 'Director of Process Improvement'],
    IT:            ['Director of IT', 'Director of Information Systems', 'Director of Infrastructure', 'Director of Security'],
    Clinical:      ['Director of Clinical Services', 'Director of Nursing', 'Director of Quality', 'Director of Patient Experience'],
    HR:            ['Director of Human Resources', 'Director of Talent Acquisition', 'Director of Learning & Development'],
    Marketing:     ['Director of Marketing', 'Director of Digital Marketing', 'Director of Content', 'Director of Communications'],
    Strategy:      ['Director of Strategy', 'Director of Corporate Development', 'Director of Partnerships'],
    'Supply Chain':['Director of Supply Chain', 'Director of Procurement', 'Director of Logistics'],
    Procurement:   ['Director of Procurement', 'Director of Sourcing', 'Director of Vendor Management'],
  } as Record<string, string[]>,

  manager: {
    Finance:       ['Finance Manager', 'Accounting Manager', 'Revenue Cycle Manager', 'Budget Manager'],
    Operations:    ['Operations Manager', 'Facilities Manager', 'Process Improvement Manager'],
    IT:            ['IT Manager', 'Systems Manager', 'Infrastructure Manager', 'Security Manager'],
    Clinical:      ['Clinical Services Manager', 'Nursing Manager', 'Quality Manager', 'Care Coordinator Manager'],
    HR:            ['HR Manager', 'Recruiting Manager', 'Benefits Manager', 'Talent Manager'],
    Marketing:     ['Marketing Manager', 'Digital Marketing Manager', 'Content Manager', 'Events Manager'],
    Strategy:      ['Strategy Manager', 'Business Development Manager', 'Partnerships Manager'],
    'Supply Chain':['Supply Chain Manager', 'Procurement Manager', 'Logistics Manager'],
    Procurement:   ['Procurement Manager', 'Sourcing Manager', 'Vendor Manager'],
  } as Record<string, string[]>,
};

export type Seniority = keyof typeof titlePools;

export function pickTitle(seniority: Seniority, fn: string): string {
  const pool = titlePools[seniority]?.[fn] ?? titlePools[seniority]?.['Operations'] ?? [];
  return pool[Math.floor(Math.random() * pool.length)] ?? 'Manager';
}
