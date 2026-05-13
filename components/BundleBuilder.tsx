'use client';

import { useState, useRef } from 'react';
import type { BundleId } from '@/lib/constants';

// ── Bundle ID mapping: marketing IDs → app BundleId ───────────────────────────
const BUNDLE_ID_MAP: Record<string, BundleId> = {
  intelligence: 'intelligence_core',
  floor:        'floor_capture',
  collab:       'team_collaboration',
  revenue:      'revenue_intelligence',
  program:      'program_intelligence',
  org:          'org_infrastructure',
  crm:          'crm_export',
};

// ── Constants ─────────────────────────────────────────────────────────────────
const ESSENTIALS_PRICE = { annual: 239, monthly: 299 };
const ENTERPRISE_PRICE = { annual: 1119, monthly: 1399 };
const BLOCK_HEIGHT = 72;
const BLOCK_GAP = 6;

const BUNDLES = [
  {
    id: 'intelligence',
    name: 'Intelligence Core',
    annual: 399, monthly: 499,
    bullets: [
      'ICP rules engine and company qualification',
      'Target priority scoring (0–100 per company)',
      'AI-powered prospect recommendations',
      'Internal relationship mapping (20% of scoring weight)',
    ],
    shortBullets: ['ICP Rules Engine', 'Target Priority Scoring', 'Prospect Recommendations', 'Internal Relationship Mapping'],
  },
  {
    id: 'floor',
    name: 'Floor Capture',
    annual: 239, monthly: 299,
    bullets: [
      'AI card and badge scanning — single and batch',
      'Floor Notes — capture now, assign later',
      'Auto follow-up triggers on touchpoint creation',
    ],
    shortBullets: ['AI Card & Badge Scanning', 'Floor Notes', 'Auto Follow-up Triggers'],
  },
  {
    id: 'collab',
    name: 'Team Collaboration',
    annual: 159, monthly: 199,
    bullets: [
      'Direct and group messaging',
      'Rich notes with @mentions, comments, and emoji reactions',
    ],
    shortBullets: ['Direct & group messaging', 'Rich notes'],
  },
  {
    id: 'revenue',
    name: 'Revenue Intelligence',
    annual: 319, monthly: 399,
    bullets: [
      'Conference Effectiveness analytics (all 5 tabs)',
      'Budget tracking and ROI modeling',
      'Configurable effectiveness benchmarks',
    ],
    shortBullets: ['Effectiveness Analytics', 'Budget Tracking & ROI', 'Configurable Benchmarks'],
  },
  {
    id: 'program',
    name: 'Program Intelligence',
    annual: 239, monthly: 299,
    requires: 'revenue' as const,
    bullets: [
      'Cross-conference reporting and annual trends',
      'Rep performance across all conferences',
      'Pipeline attribution by conference',
    ],
    shortBullets: ['Global Reporting', 'Rep Performance', 'Pipeline Attribution'],
  },
  {
    id: 'org',
    name: 'Org Infrastructure',
    annual: 159, monthly: 199,
    bullets: [
      'Brand customization and white-label',
      'Form builder and lead capture',
      'Role scope configuration matrix',
    ],
    shortBullets: ['Brand Customization', 'Form Builder & Lead Capture', 'Role Scope Matrix'],
  },
  {
    id: 'crm',
    name: 'CRM Export',
    annual: 79, monthly: 99,
    bullets: [
      'HubSpot and Salesforce import-ready CSV export',
      'Campaign attribution mapping',
      'Company type filtering on export',
    ],
    shortBullets: ['HubSpot & Salesforce CSV', 'Campaign Attribution'],
  },
] as const;

type BundleId2 = (typeof BUNDLES)[number]['id'];
type Mode = 'build' | 'modify';
type Billing = 'annual' | 'monthly';

function isInPlan(id: BundleId2, mode: Mode, selected: Set<string>): boolean {
  return mode === 'build' ? selected.has(id) : !selected.has(id);
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="rgba(52,211,153,0.15)" />
      <path d="M5 8l2 2 4-4" stroke="#34D399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MiniCheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
      <circle cx="6" cy="6" r="5.5" fill="rgba(52,211,153,0.15)" />
      <path d="M3.5 6l1.5 1.5 3-3" stroke="#34D399" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Mode toggle ───────────────────────────────────────────────────────────────
function ModeToggle({ mode, onSwitch }: { mode: Mode; onSwitch: (m: Mode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Calculator mode"
      style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3, gap: 2, marginBottom: 14 }}
    >
      <style>{`@media (max-width: 400px) { .mode-toggle-inner { flex-direction: column !important; } }`}</style>
      <div className="mode-toggle-inner" style={{ display: 'flex', flex: 1, gap: 2 }}>
        {(['build', 'modify'] as Mode[]).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={active}
              onClick={() => onSwitch(m)}
              style={{
                flex: 1, fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? '#223A5E' : '#94a3b8',
                background: active ? 'white' : 'transparent',
                border: 'none', borderRadius: 7, padding: '8px 10px', cursor: 'pointer',
                boxShadow: active ? '0 1px 3px rgba(34,58,94,0.12)' : 'none',
                transition: 'all 150ms', whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.3,
              }}
            >
              {m === 'build' ? 'Build from Essentials' : 'Modify from Enterprise'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Running total ─────────────────────────────────────────────────────────────
function RunningTotal({ mode, planTotal, enterpriseTotal, billing }: {
  mode: Mode; planTotal: number; enterpriseTotal: number; billing: Billing;
}) {
  const diff = enterpriseTotal - planTotal;
  const suffix = billing === 'annual' ? '/mo annual' : '/mo';
  const col3Label = mode === 'build' ? (diff > 0 ? 'to Enterprise' : 'vs Enterprise') : 'monthly savings';
  const col3Value = Math.abs(diff);
  const col3Color = diff <= 0 ? '#059669' : '#64748b';
  const poiThreshold = Math.round(enterpriseTotal * 0.88);
  const showApproaching = mode === 'build' && planTotal >= poiThreshold && diff > 0;
  const showExceeded    = mode === 'build' && diff <= 0;

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', alignItems: 'center',
        background: '#f8fafc', border: '1px solid rgba(34,58,94,0.1)', borderRadius: 12,
        padding: '12px 14px', marginBottom: (showApproaching || showExceeded) ? 8 : 0,
      }}>
        <div>
          <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2, lineHeight: 1 }}>
            {mode === 'build' ? 'Your plan' : 'Modified plan'}
          </p>
          <p style={{ fontSize: 20, fontWeight: 700, color: '#223A5E', lineHeight: 1, letterSpacing: '-0.02em' }}>${planTotal}</p>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{suffix}</p>
        </div>
        <div style={{ width: 1, height: 32, background: 'rgba(34,58,94,0.1)', margin: '0 8px' }} />
        <div>
          <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2, lineHeight: 1 }}>Enterprise</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: '#223A5E', lineHeight: 1, letterSpacing: '-0.02em' }}>${enterpriseTotal}</p>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{suffix}</p>
        </div>
        <div style={{ width: 1, height: 32, background: 'rgba(34,58,94,0.1)', margin: '0 8px' }} />
        <div>
          <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2, lineHeight: 1 }}>{col3Label}</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: col3Color, lineHeight: 1, letterSpacing: '-0.02em' }}>${col3Value}</p>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{suffix}</p>
        </div>
      </div>
      {showApproaching && (
        <div style={{ borderRadius: 8, padding: '9px 12px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <p style={{ fontSize: 11, lineHeight: 1.5, color: '#92400e' }}>
            You&apos;re within ${diff}/mo of Enterprise, which includes all remaining bundles.
          </p>
        </div>
      )}
      {showExceeded && (
        <div style={{ borderRadius: 8, padding: '9px 12px', background: 'rgba(5,150,105,0.07)', border: '1px solid rgba(5,150,105,0.25)' }}>
          <p style={{ fontSize: 11, lineHeight: 1.5, color: '#065f46' }}>
            Enterprise includes everything you&apos;ve selected plus the remaining bundles for <strong>${Math.abs(diff)}/mo less</strong>.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Plan slot card ─────────────────────────────────────────────────────────────
function PlanSlot({ filled, label, price, billingLabel, mode, isBase = false, shortBullets }: {
  filled: boolean; label: string; price?: number; billingLabel: string;
  mode: Mode; isBase?: boolean; shortBullets?: readonly string[];
}) {
  const borderColor = mode === 'build' ? 'rgba(52,211,153,0.5)' : 'rgba(34,58,94,0.25)';
  const baseBorderColor = mode === 'build' ? '#34D399' : '#223A5E';

  if (!filled) {
    return (
      <div style={{
        height: BLOCK_HEIGHT, flexShrink: 0, borderRadius: 8, background: 'rgba(34,58,94,0.03)',
        border: '1.5px dashed rgba(34,58,94,0.12)', display: 'flex', alignItems: 'center', paddingLeft: 14,
      }}>
        <span style={{ fontSize: 11, color: 'rgba(34,58,94,0.28)', fontStyle: 'italic' }}>{label}</span>
      </div>
    );
  }

  const visibleBullets = shortBullets ? shortBullets.slice(0, 4) : [];

  return (
    <div style={{
      flexShrink: 0, background: 'white',
      border: `1.5px solid ${isBase ? baseBorderColor : borderColor}`,
      borderRadius: 8, padding: '10px 14px', boxShadow: '0 1px 3px rgba(34,58,94,0.07)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: visibleBullets.length > 0 ? 8 : 0 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', lineHeight: 1 }}>
          {label}
        </p>
        {price !== undefined && (
          <p style={{ fontSize: 13, fontWeight: 700, color: '#223A5E', lineHeight: 1, letterSpacing: '-0.01em' }}>
            ${price}<span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginLeft: 2 }}>{billingLabel}</span>
          </p>
        )}
      </div>
      {visibleBullets.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
          {visibleBullets.map((bullet) => (
            <div key={bullet} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <MiniCheckIcon />
              <span style={{ fontSize: 10, color: '#475569', lineHeight: 1.4 }}>{bullet}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bundle card ───────────────────────────────────────────────────────────────
function BundleCard({ bundle, active, mode, billing, onToggle, disabled, expanded, onToggleExpand }: {
  bundle: (typeof BUNDLES)[number]; active: boolean; mode: Mode; billing: Billing;
  onToggle: () => void; disabled: boolean; expanded: boolean; onToggleExpand: () => void;
}) {
  const price = bundle[billing];
  const borderColor = mode === 'build' ? 'rgba(52,211,153,0.5)' : 'rgba(34,58,94,0.25)';
  const actionLabel  = mode === 'build' ? (active ? 'Remove' : 'Add') : (active ? 'Remove' : 'Restore');
  const actionColor  = active ? '#ef4444' : '#059669';
  const actionBg     = active ? 'rgba(239,68,68,0.07)' : 'rgba(5,150,105,0.07)';
  const actionBorder = active ? 'rgba(239,68,68,0.25)' : 'rgba(5,150,105,0.25)';

  return (
    <div style={{ background: 'white', border: `1.5px solid ${borderColor}`, borderRadius: 12, padding: '16px 18px', opacity: disabled ? 0.45 : 1, transition: 'opacity 150ms' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#94a3b8', marginBottom: 4, lineHeight: 1 }}>
        {bundle.name}
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 14 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: '#223A5E', letterSpacing: '-0.03em', lineHeight: 1 }}>${price}</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>/mo</span>
        {billing === 'annual' && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 2 }}>annual</span>}
      </div>
      {'requires' in bundle && (
        <p style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginBottom: 10, marginTop: -8 }}>
          Requires Revenue Intelligence
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onToggleExpand} style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#475569', background: '#f8fafc', border: '1px solid rgba(34,58,94,0.12)', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', transition: 'all 150ms', whiteSpace: 'nowrap' }}>
          {expanded ? 'Hide Features' : 'Show Features'}
        </button>
        <button onClick={disabled ? undefined : onToggle} disabled={disabled} style={{ flex: 1, fontSize: 12, fontWeight: 600, color: actionColor, background: actionBg, border: `1px solid ${actionBorder}`, borderRadius: 7, padding: '7px 10px', cursor: disabled ? 'default' : 'pointer', transition: 'all 150ms', whiteSpace: 'nowrap' }}>
          {actionLabel}
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(34,58,94,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bundle.bullets.map((bullet) => (
            <div key={bullet} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <CheckIcon />
              <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.45 }}>{bullet}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function BundleBuilder({ billing }: { billing: 'monthly' | 'annual' }) {
  const [mode, setMode] = useState<Mode>('build');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);

  function toggle(id: string) {
    setSelected((prev: Set<string>) => {
      const next = new Set(prev);
      if (mode === 'build') {
        if (next.has(id)) { next.delete(id); if (id === 'revenue') next.delete('program'); }
        else { next.add(id); if (id === 'program') next.add('revenue'); }
      } else {
        if (next.has(id)) { next.delete(id); }
        else { next.add(id); if (id === 'revenue') next.add('program'); }
      }
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedCards((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleCheckout() {
    const finalBundleIds = BUNDLES
      .filter(b => mode === 'build' ? selected.has(b.id) : !selected.has(b.id))
      .map(b => BUNDLE_ID_MAP[b.id]);

    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'custom', billingInterval: billing, selectedBundles: finalBundleIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed');
      window.location.href = data.url;
    } catch {
      setCheckoutError('Something went wrong. Please try again.');
      setCheckoutLoading(false);
    }
  }

  const enterpriseTotal = ENTERPRISE_PRICE[billing];
  let planTotal: number;
  if (mode === 'build') {
    planTotal = ESSENTIALS_PRICE[billing];
    selected.forEach((id: string) => { const b = BUNDLES.find((x) => x.id === id); if (b) planTotal += b[billing]; });
  } else {
    planTotal = enterpriseTotal;
    selected.forEach((id: string) => { const b = BUNDLES.find((x) => x.id === id); if (b) planTotal -= b[billing]; });
  }

  const billingLabel = billing === 'annual' ? '/mo annual' : '/mo';
  const baseLabel = mode === 'build' ? 'Essentials' : 'Enterprise';
  const basePrice = mode === 'build' ? ESSENTIALS_PRICE[billing] : enterpriseTotal;

  // CTA shows when bundles are toggled in either mode
  const ctaVisible = selected.size > 0;

  return (
    <div style={{ background: 'white', border: '1px solid rgba(34,58,94,0.12)', borderRadius: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div className="grid grid-cols-1 lg:grid-cols-4">
        <div className="lg:col-span-2" style={{ padding: '32px 32px 28px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#34D399', marginBottom: 10 }}>
            Custom Tier
          </p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 700, color: '#223A5E', letterSpacing: '-0.02em', marginBottom: 10 }}>
            Or build your own
          </h2>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.7 }}>
            Not every conference program needs everything. Start with the feature bundles your team actually uses. When your selection reaches the Enterprise threshold, we&apos;ll tell you.
          </p>
        </div>
        <div className="lg:col-span-2 bundle-builder-right" style={{ padding: '32px 32px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <ModeToggle mode={mode} onSwitch={(m: Mode) => { setMode(m); setSelected(new Set()); }} />
          <RunningTotal mode={mode} planTotal={planTotal} enterpriseTotal={enterpriseTotal} billing={billing} />
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(34,58,94,0.08)' }} />

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-4">
        {/* Left: bundle cards */}
        <div className="lg:col-span-2" style={{ padding: '28px 32px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'rgb(34,58,94)', marginBottom: 16 }}>
            {mode === 'build' ? 'Add Feature Bundles' : 'Remove Feature Bundles'}
          </p>

          {/* Desktop grid */}
          <div className="hidden lg:grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
            {BUNDLES.map((bundle) => {
              const active = isInPlan(bundle.id as BundleId2, mode, selected);
              let disabled = false;
              if (bundle.id === 'program') {
                if (mode === 'build'  && !selected.has('revenue')) disabled = true;
                if (mode === 'modify' &&  selected.has('revenue')) disabled = true;
              }
              return (
                <BundleCard key={bundle.id} bundle={bundle} active={active} mode={mode} billing={billing}
                  onToggle={() => toggle(bundle.id)} disabled={disabled}
                  expanded={expandedCards.has(bundle.id)} onToggleExpand={() => toggleExpand(bundle.id)} />
              );
            })}
          </div>

          {/* Mobile carousel */}
          <div className="lg:hidden">
            <div style={{ overflow: 'hidden' }}
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                const delta = touchStartX.current - e.changedTouches[0].clientX;
                if (delta > 40 && carouselIndex < BUNDLES.length - 1) setCarouselIndex(i => i + 1);
                if (delta < -40 && carouselIndex > 0) setCarouselIndex(i => i - 1);
              }}
            >
              <div style={{ display: 'flex', transform: `translateX(-${carouselIndex * 100}%)`, transition: 'transform 220ms ease' }}>
                {BUNDLES.map((bundle) => {
                  const active = isInPlan(bundle.id as BundleId2, mode, selected);
                  let disabled = false;
                  if (bundle.id === 'program') {
                    if (mode === 'build'  && !selected.has('revenue')) disabled = true;
                    if (mode === 'modify' &&  selected.has('revenue')) disabled = true;
                  }
                  return (
                    <div key={bundle.id} style={{ flexShrink: 0, width: '100%' }}>
                      <BundleCard bundle={bundle} active={active} mode={mode} billing={billing}
                        onToggle={() => toggle(bundle.id)} disabled={disabled}
                        expanded={mobileExpanded} onToggleExpand={() => setMobileExpanded((v) => !v)} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
              {BUNDLES.map((_, i) => (
                <button key={i} onClick={() => setCarouselIndex(i)} aria-label={`Go to bundle ${i + 1}`}
                  style={{ width: i === carouselIndex ? 18 : 6, height: 6, borderRadius: 3, background: i === carouselIndex ? '#34D399' : 'rgba(34,58,94,0.2)', border: 'none', padding: 0, cursor: 'pointer', transition: 'width 200ms, background 200ms' }} />
              ))}
            </div>
          </div>

          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 14, lineHeight: 1.5 }}>
            Program Intelligence requires Revenue Intelligence.
          </p>
        </div>

        {/* Right: plan builder */}
        <div className="lg:col-span-2 bundle-builder-right" style={{ padding: '28px 32px' }}>
          <style>{`.bundle-builder-right{border-top:1px solid rgba(34,58,94,0.08)}@media(min-width:1024px){.bundle-builder-right{border-top:none;border-left:1px solid rgba(34,58,94,0.08)}}`}</style>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'rgb(34,58,94)', marginBottom: 16 }}>
            Your Plan
          </p>
          <div style={{ background: '#f1f5f9', borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: BLOCK_GAP }}>
            <PlanSlot filled label={baseLabel} price={basePrice} billingLabel={billingLabel} mode={mode} isBase />
            {BUNDLES.map((bundle) => {
              const active = isInPlan(bundle.id as BundleId2, mode, selected);
              return (
                <PlanSlot key={bundle.id} filled={active} label={bundle.name}
                  price={active ? bundle[billing] : undefined} billingLabel={billingLabel}
                  mode={mode} shortBullets={bundle.shortBullets} />
              );
            })}
          </div>

          {ctaVisible && (
            <div style={{ marginTop: 12 }}>
              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                style={{
                  display: 'block', width: '100%', textAlign: 'center',
                  background: checkoutLoading ? '#a7f3d0' : '#34D399',
                  color: '#0f2d1f', fontWeight: 700, fontSize: 14, borderRadius: 10,
                  padding: '13px 20px', border: 'none', cursor: checkoutLoading ? 'default' : 'pointer',
                  boxShadow: '0 4px 16px rgba(52,211,153,0.35)', transition: 'background 150ms, box-shadow 150ms',
                }}
                onMouseEnter={(e) => {
                  if (!checkoutLoading) {
                    (e.currentTarget as HTMLButtonElement).style.background = '#2ec48a';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(52,211,153,0.45)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!checkoutLoading) {
                    (e.currentTarget as HTMLButtonElement).style.background = '#34D399';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(52,211,153,0.35)';
                  }
                }}
              >
                {checkoutLoading ? 'Redirecting…' : 'Checkout →'}
              </button>
              {checkoutError && (
                <p style={{ fontSize: 11, color: '#ef4444', textAlign: 'center', marginTop: 6 }}>
                  {checkoutError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
