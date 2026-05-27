'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRecordDrawer } from './RecordDrawerContext';
import type { ProductIcpV2Product, ProductIcpV2Attendee, TargetEntry } from '../PreConferenceReview';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductMeta {
  functions: Record<string, 'high' | 'med' | 'ignore'>;
  seniority: Record<string, 'decision_maker' | 'influencer' | 'target_title'>;
  industries: number[];
  keywords: string[];
  aliases: string;
  active: boolean;
}

type BuyerRole = 'decision_maker' | 'influencer' | 'target_title' | null;

interface AttendeeSignals {
  buyerRole: BuyerRole;
  functionMatches: Array<{ fn: string; level: 'high' | 'med' }>;
  keywordMatches: string[];
}

interface BoardAttendee extends ProductIcpV2Attendee {
  signals: AttendeeSignals;
}

interface BoardCompany {
  companyId: number | null;
  companyName: string;
  assignedUserNames: string[];
  attendees: BoardAttendee[];
  allUnmapped: boolean;
}

interface BoardColumn {
  product: ProductIcpV2Product;
  meta: ProductMeta;
  companies: BoardCompany[];
  totalAttendees: number;
  hasBuyerRole: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMeta(s: string | null | undefined): ProductMeta {
  try {
    const p = JSON.parse(s ?? '');
    return {
      functions: p.functions ?? {},
      seniority: p.seniority ?? {},
      industries: Array.isArray(p.industries) ? p.industries : [],
      keywords: Array.isArray(p.keywords) ? p.keywords : [],
      aliases: p.aliases ?? '',
      active: p.active !== false,
    };
  } catch {
    return { functions: {}, seniority: {}, industries: [], keywords: [], aliases: '', active: true };
  }
}

function computeSignals(a: ProductIcpV2Attendee, meta: ProductMeta): AttendeeSignals {
  const buyerRole: BuyerRole = a.seniority
    ? ((meta.seniority[a.seniority] as BuyerRole) ?? null)
    : null;

  const functionMatches: Array<{ fn: string; level: 'high' | 'med' }> = [];
  if (a.function) {
    const level = meta.functions[a.function];
    if (level === 'high' || level === 'med') functionMatches.push({ fn: a.function, level });
  }

  const titleLower = (a.title ?? '').toLowerCase();
  const keywordMatches = meta.keywords.filter(kw => kw && titleLower.includes(kw.toLowerCase()));

  return { buyerRole, functionMatches, keywordMatches };
}

function isRelevant(signals: AttendeeSignals): boolean {
  return signals.buyerRole !== null || signals.functionMatches.length > 0 || signals.keywordMatches.length > 0;
}

const BUYER_ROLE_ORDER: Record<string, number> = { decision_maker: 0, influencer: 1, target_title: 2 };

function sortAttendees(attendees: BoardAttendee[], mode: string): BoardAttendee[] {
  return [...attendees].sort((a, b) => {
    if (mode === 'buyer_role') {
      const oa = a.signals.buyerRole ? (BUYER_ROLE_ORDER[a.signals.buyerRole] ?? 3) : 3;
      const ob = b.signals.buyerRole ? (BUYER_ROLE_ORDER[b.signals.buyerRole] ?? 3) : 3;
      if (oa !== ob) return oa - ob;
    }
    if (mode === 'function') {
      const la = a.signals.functionMatches[0]?.level;
      const lb = b.signals.functionMatches[0]?.level;
      const oa = la === 'high' ? 0 : la === 'med' ? 1 : 2;
      const ob = lb === 'high' ? 0 : lb === 'med' ? 1 : 2;
      if (oa !== ob) return oa - ob;
    }
    return `${a.companyName}${a.lastName}${a.firstName}`.localeCompare(`${b.companyName}${b.lastName}${b.firstName}`);
  });
}

// Category color palette — consistent soft tints
const CAT_PALETTE = [
  { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' }, // blue
  { bg: '#F5F3FF', border: '#DDD6FE', text: '#5B21B6' }, // purple
  { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' }, // teal
  { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' }, // amber
  { bg: '#FFF1F2', border: '#FECDD3', text: '#9F1239' }, // rose
  { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' }, // green
];

function getCatStyle(catLabel: string, catColor: string | null): { bg: string; border: string; text: string } {
  if (catColor) {
    return { bg: `${catColor}18`, border: `${catColor}55`, text: catColor };
  }
  // Deterministic hash
  let h = 0;
  for (let i = 0; i < catLabel.length; i++) h = (h * 31 + catLabel.charCodeAt(i)) & 0xffff;
  return CAT_PALETTE[h % CAT_PALETTE.length];
}

// ── Pill components ────────────────────────────────────────────────────────────

function BuyerRolePill({ role }: { role: BuyerRole }) {
  if (!role) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
        not mapped
      </span>
    );
  }
  const config = {
    decision_maker: { label: 'Decision maker', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
    influencer: { label: 'Influencer', bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
    target_title: { label: 'Target title', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  }[role];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.bg} ${config.text} border ${config.border}`}>
      {config.label}
    </span>
  );
}

function FunctionPill({ fn, level }: { fn: string; level: 'high' | 'med' }) {
  const isHigh = level === 'high';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${isHigh ? 'bg-teal-100 text-teal-700 border border-teal-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
      {fn} — {level}
    </span>
  );
}

function KeywordPill({ keyword }: { keyword: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
      &quot;{keyword}&quot;
    </span>
  );
}

function BuyerDot({ role }: { role: BuyerRole }) {
  const color = !role ? '#9CA3AF'
    : role === 'decision_maker' ? '#7C3AED'
    : role === 'influencer' ? '#0D9488'
    : '#D97706';
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: color }} />;
}

// ── AttendeeRow ────────────────────────────────────────────────────────────────

function AttendeeRow({ attendee }: { attendee: BoardAttendee }) {
  const openRecord = useRecordDrawer();
  const { signals } = attendee;
  return (
    <div className="flex gap-2 py-1.5 border-t border-gray-50 first:border-t-0">
      <BuyerDot role={signals.buyerRole} />
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => openRecord('attendee', attendee.id)}
          className="font-medium text-xs text-gray-800 hover:text-brand-secondary transition-colors text-left w-full truncate block"
        >
          {attendee.firstName} {attendee.lastName}
        </button>
        {attendee.title && (
          <p className="text-[11px] text-gray-400 truncate leading-tight">{attendee.title}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          <BuyerRolePill role={signals.buyerRole} />
          {signals.functionMatches.map(fm => (
            <FunctionPill key={fm.fn} fn={fm.fn} level={fm.level} />
          ))}
          {signals.keywordMatches.map(kw => (
            <KeywordPill key={kw} keyword={kw} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CompanyCard ────────────────────────────────────────────────────────────────

function CompanyCard({ company, sortMode }: { company: BoardCompany; sortMode: string }) {
  const openRecord = useRecordDrawer();
  const sorted = sortAttendees(company.attendees, sortMode);
  return (
    <div className={`border rounded-xl p-3 bg-white transition-all ${company.allUnmapped ? 'opacity-60 border-gray-150' : 'border-gray-200 hover:shadow-sm'}`}>
      <div className="mb-2">
        {company.companyId != null && company.companyId > 0 ? (
          <button
            type="button"
            onClick={() => openRecord('company', company.companyId!)}
            className="font-semibold text-sm text-gray-900 hover:text-brand-secondary transition-colors text-left w-full truncate block"
          >
            {company.companyName}
          </button>
        ) : (
          <span className="font-semibold text-sm text-gray-900 block truncate">{company.companyName || 'Unknown Company'}</span>
        )}
        <p className="text-[11px] text-gray-400 mt-0.5">
          {company.attendees.length} {company.attendees.length === 1 ? 'attendee' : 'attendees'}
        </p>
      </div>
      <div className="space-y-0">
        {sorted.map(a => <AttendeeRow key={a.id} attendee={a} />)}
      </div>
    </div>
  );
}

// ── ProductColumn ─────────────────────────────────────────────────────────────

function ProductColumn({ col, sortMode, catStyle }: { col: BoardColumn; sortMode: string; catStyle: { bg: string; border: string; text: string } }) {
  return (
    <div className="flex-shrink-0 w-80 flex flex-col gap-3">
      {/* Header */}
      <div
        className="rounded-xl px-4 py-3 border"
        style={{ backgroundColor: catStyle.bg, borderColor: catStyle.border }}
      >
        <h3 className="font-semibold text-sm" style={{ color: catStyle.text }}>{col.product.name}</h3>
        {col.product.categoryLabel && col.product.categoryLabel !== 'General' && (
          <p className="text-[11px] mt-0.5 opacity-70" style={{ color: catStyle.text }}>{col.product.categoryLabel}</p>
        )}
        <p className="text-[11px] mt-1 opacity-60" style={{ color: catStyle.text }}>
          {col.companies.length} {col.companies.length === 1 ? 'company' : 'companies'} · {col.totalAttendees} {col.totalAttendees === 1 ? 'attendee' : 'attendees'}
        </p>
      </div>

      {/* No buyer role warning */}
      {!col.hasBuyerRole && (
        <div className="rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
          No buyer roles resolved —{' '}
          <Link href="/admin?tab=products" className="underline hover:text-amber-900">
            check seniority mapping
          </Link>
        </div>
      )}

      {/* Company cards */}
      {col.companies.map(company => (
        <CompanyCard key={company.companyId ?? `unknown-${company.companyName}`} company={company} sortMode={sortMode} />
      ))}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function ProductIcpTab({
  productCatalog,
  icpAttendees,
  targetMap: _targetMap,
  onToggleTarget: _onToggleTarget,
  readOnly: _readOnly = false,
}: {
  productCatalog: ProductIcpV2Product[];
  icpAttendees: ProductIcpV2Attendee[];
  industryOptions: Array<{ id: number; value: string }>;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  readOnly?: boolean;
}) {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'buyer_role' | 'function' | 'company_name'>('buyer_role');

  const boardData = useMemo<BoardColumn[]>(() => {
    const columns: BoardColumn[] = [];
    for (const product of productCatalog) {
      const meta = parseMeta(product.meta);
      if (!meta.active) continue;

      const relevantAttendees: BoardAttendee[] = [];
      for (const a of icpAttendees) {
        const signals = computeSignals(a, meta);
        if (isRelevant(signals)) relevantAttendees.push({ ...a, signals });
      }
      if (relevantAttendees.length === 0) continue;

      const companyMap = new Map<number | null, BoardAttendee[]>();
      for (const a of relevantAttendees) {
        const key = a.companyId;
        if (!companyMap.has(key)) companyMap.set(key, []);
        companyMap.get(key)!.push(a);
      }

      const companies: BoardCompany[] = Array.from(companyMap.entries())
        .map(([cid, atts]) => ({
          companyId: cid,
          companyName: atts[0].companyName,
          assignedUserNames: atts[0].companyAssignedUserNames,
          attendees: atts,
          allUnmapped: atts.every((att: BoardAttendee) => !att.signals.buyerRole && att.signals.functionMatches.length === 0),
        }))
        .sort((a, b) => a.companyName.localeCompare(b.companyName));

      columns.push({
        product,
        meta,
        companies,
        totalAttendees: relevantAttendees.length,
        hasBuyerRole: relevantAttendees.some(a => a.signals.buyerRole !== null),
      });
    }
    return columns.sort((a, b) => {
      const catCmp = a.product.categoryLabel.localeCompare(b.product.categoryLabel);
      return catCmp !== 0 ? catCmp : a.product.name.localeCompare(b.product.name);
    });
  }, [productCatalog, icpAttendees]);

  // Category list for filter chips
  const categoryLabels = useMemo(() => {
    const seen = new Set<string>();
    return boardData
      .map(col => col.product.categoryLabel)
      .filter(l => { if (seen.has(l)) return false; seen.add(l); return true; });
  }, [boardData]);

  const visibleColumns = useMemo(() => (
    categoryFilter ? boardData.filter(col => col.product.categoryLabel === categoryFilter) : boardData
  ), [boardData, categoryFilter]);

  // Summary stats
  const totalCompanies = useMemo(() => {
    const ids = new Set<number | null>();
    visibleColumns.forEach(col => col.companies.forEach(co => ids.add(co.companyId)));
    return ids.size;
  }, [visibleColumns]);
  const totalAttendees = useMemo(() => {
    const ids = new Set<number>();
    visibleColumns.forEach(col => col.companies.forEach(co => co.attendees.forEach(a => ids.add(a.id))));
    return ids.size;
  }, [visibleColumns]);

  if (boardData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-gray-500 font-medium text-sm">No product ICP matches found for this conference</p>
        <p className="text-gray-400 text-xs mt-1 mb-4">Configure products and their function/seniority mappings to see matches here.</p>
        <Link href="/admin?tab=products" className="text-xs text-brand-secondary hover:underline">
          Configure products in admin settings →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
        {/* Category filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!categoryFilter ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
          >
            All products
          </button>
          {categoryLabels.map(label => (
            <button
              key={label}
              type="button"
              onClick={() => setCategoryFilter(prev => prev === label ? null : label)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${categoryFilter === label ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as typeof sortMode)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 bg-white text-gray-600 ml-auto"
        >
          <option value="buyer_role">Sort: Buyer role</option>
          <option value="function">Sort: Function match</option>
          <option value="company_name">Sort: Company A–Z</option>
        </select>

        {/* Summary */}
        <p className="text-xs text-gray-400 flex-shrink-0">
          {visibleColumns.length} product{visibleColumns.length !== 1 ? 's' : ''} · {totalCompanies} {totalCompanies === 1 ? 'company' : 'companies'} · {totalAttendees} attendee{totalAttendees !== 1 ? 's' : ''} matched
        </p>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 items-start">
        {visibleColumns.map(col => {
          const catStyle = getCatStyle(col.product.categoryLabel, col.product.categoryColor);
          return (
            <ProductColumn
              key={col.product.id}
              col={col}
              sortMode={sortMode}
              catStyle={catStyle}
            />
          );
        })}
      </div>
    </div>
  );
}
