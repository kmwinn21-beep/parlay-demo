'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ScrollRow } from '@/components/ScrollRow';
import { KebabMenu } from '@/components/KebabMenu';
import { MobileFormSheet } from '@/components/MobileFormSheet';
import { SectionAddButton } from '@/components/SectionAddButton';
import { useConfigColors } from '@/lib/useConfigColors';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { getRepInitials, type UserOption } from '@/lib/useUserOptions';
import { useCollapsibleSection } from '@/lib/sectionExpansion';
import {
  SingleSelect, MultiSelect, CompanyPicker, resolveOther,
  OTHER_COMPANY, OTHER_VALUE_MAX,
  type CompanyOption, type ConfigOption,
} from '@/components/VendorRelationshipFields';

export interface VendorRelationship {
  id: number;
  related_company_id: number;
  related_company_name: string;
  related_company_type: string | null;
  rep_id: number | null;
  relationship_status: string[];
  strength: string | null;
  vendor_type: string[];
  notes: string;
  created_at?: string | null;
  updated_at?: string | null;
}

/* ─── Card ────────────────────────────────────────────────────────────────── */

/**
 * When the note was last written. Stored as UTC without a zone marker, so the
 * Z is added before parsing — otherwise it reads as local and the stamp drifts
 * by the offset.
 */
function formatStamp(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const d = new Date(value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`);
  // A shape this doesn't parse still gets shown rather than silently dropping
  // the stamp — a raw timestamp reads better than no timestamp at all.
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function StatusPill({ value, colorMaps }: { value: string; colorMaps: Record<string, Record<string, string | null>> }) {
  // Full-strength text and border with a wash of the same colour behind, from
  // whatever hex the option carries in admin settings.
  const hex = getPreset(colorMaps.other_relationship_status?.[value]).hex;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap"
      style={{ color: hex, borderColor: hex, backgroundColor: `${hex}1F` }}
    >
      {value}
    </span>
  );
}

/**
 * Exported so the pre-conference review can show the same card rather than
 * building a second one that drifts. Omitting onEdit/onDelete drops the actions
 * menu, which is what a read-only surface wants.
 */
export function VendorRelationshipCard({ rel, userOptions, colorMaps, onEdit, onDelete, defaultExpanded = false }: {
  rel: VendorRelationship;
  userOptions: UserOption[];
  colorMaps: Record<string, Record<string, string | null>>;
  onEdit?: () => void;
  onDelete?: () => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rep = userOptions.find(u => u.id === rel.rep_id);
  // Last edit rather than creation: the note is what the stamp is heading, and
  // the note can be rewritten.
  const stamp = formatStamp(rel.updated_at || rel.created_at);

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Chevron on the right, matching the internal-relationship card. */}
      <button type="button" onClick={() => setExpanded(v => !v)} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800 truncate">{rel.related_company_name}</p>
            {/* Second row: what this relationship is, then what the company is. */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {rel.relationship_status.map(s => <StatusPill key={s} value={s} colorMaps={colorMaps} />)}
              {rel.related_company_type && (
                <span className={`${getBadgeClass(rel.related_company_type, colorMaps.company_type || {})} whitespace-nowrap`}>
                  {rel.related_company_type}
                </span>
              )}
            </div>
          </div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 mt-0.5 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            {/* flex-1 min-w-0: ScrollRow's scroller is w-0 flex-1 inside, so
                without a width to claim here it collapses to just a chevron. */}
            <ScrollRow className="flex-1 min-w-0" gapClass="gap-1.5">
              {rel.strength && (
                <span className={`${getBadgeClass(rel.strength, colorMaps.rep_relationship_type || {})} flex-shrink-0 whitespace-nowrap`}>
                  {rel.strength}
                </span>
              )}
              {rel.vendor_type.map(v => (
                <span key={v} className={`${getBadgeClass(v, colorMaps.vendor_type || {})} flex-shrink-0 whitespace-nowrap`}>{v}</span>
              ))}
              {!rel.strength && rel.vendor_type.length === 0 && (
                <span className="text-xs text-gray-400 flex-shrink-0">No strength or vendor type set</span>
              )}
            </ScrollRow>
            {rep && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getPreset(colorMaps.user?.[rep.value]).badgeClass}`}>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                  <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                </svg>
                {getRepInitials(rep.value)}
              </span>
            )}
            {/* Sits at the end of this row so it lands directly under the
                header's chevron, rather than floating at the foot of the card. */}
            {(onEdit || onDelete) && (
              <div className="flex-shrink-0">
                <KebabMenu
                  title="Relationship actions"
                  items={[
                    ...(onEdit ? [{ label: 'Edit', onClick: onEdit }] : []),
                    ...(onDelete ? [{ label: 'Delete', onClick: onDelete }] : []),
                  ]}
                />
              </div>
            )}
          </div>

          {rel.notes && (
            <div>
              {stamp && (
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{stamp}</p>
              )}
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{rel.notes}</p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

/* ─── Section ─────────────────────────────────────────────────────────────── */

export function VendorRelationshipsSection({ companyId, userOptions, currentUserConfigId, label }: {
  companyId: number;
  userOptions: UserOption[];
  currentUserConfigId: number | null;
  label: string;
}) {
  const colorMaps = useConfigColors();
  const [expanded, setExpanded] = useCollapsibleSection(false);
  const [relationships, setRelationships] = useState<VendorRelationship[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<ConfigOption[]>([]);
  const [vendorTypeOptions, setVendorTypeOptions] = useState<ConfigOption[]>([]);
  const [strengthOptions, setStrengthOptions] = useState<ConfigOption[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [formRepId, setFormRepId] = useState<string>('');
  const [formCompanyId, setFormCompanyId] = useState<number | null>(null);
  const [formNewCompanyName, setFormNewCompanyName] = useState('');
  const [formStatus, setFormStatus] = useState<string[]>([]);
  const [formStrength, setFormStrength] = useState('');
  const [formVendorType, setFormVendorType] = useState<string[]>([]);
  const [formNotes, setFormNotes] = useState('');
  // Free-text values behind an "Other" selection, one per field.
  const [otherStatus, setOtherStatus] = useState('');
  const [otherVendorType, setOtherVendorType] = useState('');
  // Set while asking whether a typed-in value should become a standing option.
  const [keepPrompt, setKeepPrompt] = useState<{ category: string; label: string; value: string }[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/vendor-relationships?company_id=${companyId}`, { cache: 'no-store' });
    setRelationships(res.ok ? await res.json() : []);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/api/companies?limit=2000').then(r => r.ok ? r.json() : []).then((d: CompanyOption[]) => {
      const list = Array.isArray(d) ? d : [];
      setCompanies(list.filter(c => c.id !== companyId).map(c => ({ id: c.id, name: c.name })));
    }).catch(() => {});
    const loadCat = (cat: string, set: (v: ConfigOption[]) => void) =>
      fetch(`/api/config?category=${cat}`).then(r => r.ok ? r.json() : []).then((d: ConfigOption[]) =>
        set(Array.isArray(d) ? d.map(o => ({ id: o.id, value: o.value })) : [])).catch(() => {});
    loadCat('other_relationship_status', setStatusOptions);
    loadCat('vendor_type', setVendorTypeOptions);
    loadCat('rep_relationship_type', setStrengthOptions);
  }, [companyId]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormRepId(currentUserConfigId != null ? String(currentUserConfigId) : '');
    setFormCompanyId(null);
    setFormNewCompanyName('');
    setFormStatus([]);
    setFormStrength('');
    setFormVendorType([]);
    setFormNotes('');
    setOtherStatus('');
    setOtherVendorType('');
    setKeepPrompt(null);
  };

  const openAdd = () => {
    // Always expands, never collapses: the form lives inside the expanded
    // body, so adding from a collapsed section has to open it to show
    // anything — and the new row lands somewhere the person can see it.
    setExpanded(true);
    resetForm();
    setFormRepId(currentUserConfigId != null ? String(currentUserConfigId) : '');
    setShowForm(true);
  };

  const openEdit = (rel: VendorRelationship) => {
    setEditingId(rel.id);
    setFormRepId(rel.rep_id != null ? String(rel.rep_id) : '');
    setFormCompanyId(rel.related_company_id);
    setFormNewCompanyName('');
    setFormStatus(rel.relationship_status);
    setFormStrength(rel.strength ?? '');
    setFormVendorType(rel.vendor_type);
    setFormNotes(rel.notes);
    setOtherStatus('');
    setOtherVendorType('');
    setShowForm(true);
  };

  const validate = (): string | null => {
    if (!formRepId) return 'Rep is required.';
    if (formCompanyId == null) return 'Company is required.';
    if (formCompanyId === OTHER_COMPANY && !formNewCompanyName.trim()) return 'Enter the new company name.';
    if (formStatus.length === 0) return 'Relationship Status is required.';
    if (formStatus.includes('Other') && !otherStatus.trim()) return 'Enter the other relationship status.';
    if (formVendorType.includes('Other') && !otherVendorType.trim()) return 'Enter the other vendor type.';
    if (!formNotes.trim()) return 'Notes / Context is required.';
    return null;
  };

  const handleSubmit = () => {
    const problem = validate();
    if (problem) { toast.error(problem); return; }

    // A typed-in value is a one-off unless the person says to keep it, so ask
    // before writing anything to the shared option lists.
    const typed: { category: string; label: string; value: string }[] = [];
    if (formStatus.includes('Other') && otherStatus.trim()) {
      typed.push({ category: 'other_relationship_status', label: 'Other Relationship Status', value: otherStatus.trim() });
    }
    if (formVendorType.includes('Other') && otherVendorType.trim()) {
      typed.push({ category: 'vendor_type', label: 'Vendor Type', value: otherVendorType.trim() });
    }
    if (typed.length > 0) { setKeepPrompt(typed); return; }
    void save([]);
  };

  const save = async (keepCategories: string[]) => {
    setSaving(true);
    try {
      let relatedId = formCompanyId;
      if (relatedId === OTHER_COMPANY) {
        const res = await fetch('/api/companies', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formNewCompanyName.trim() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          toast.error(err.error || 'Failed to create the company.');
          return;
        }
        relatedId = Number((await res.json()).id);
      }

      // Anything the person chose to keep becomes a standing option first, so
      // the value the card references exists in the list it came from.
      for (const cat of keepCategories) {
        const value = cat === 'other_relationship_status' ? otherStatus.trim() : otherVendorType.trim();
        if (!value) continue;
        await fetch('/api/config', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, value }),
        }).catch(() => {});
      }

      const payload = {
        company_id: companyId,
        related_company_id: relatedId,
        rep_id: Number(formRepId),
        relationship_status: resolveOther(formStatus, otherStatus),
        strength: formStrength || null,
        vendor_type: resolveOther(formVendorType, otherVendorType),
        notes: formNotes.trim(),
      };

      const res = editingId
        ? await fetch('/api/vendor-relationships', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: editingId }) })
        : await fetch('/api/vendor-relationships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error(err.error || 'Failed to save the relationship.');
        return;
      }
      toast.success(editingId ? 'Relationship updated.' : 'Relationship added.');
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this relationship?')) return;
    const res = await fetch(`/api/vendor-relationships?id=${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to delete the relationship.'); return; }
    toast.success('Relationship deleted.');
    await load();
  };

  return (
    <div className="card">
      {/* Chevron leads the title and the add button sits opposite it, matching
          the internal-relationship section. The add button is a sibling of the
          toggle, not inside it, so tapping it can't collapse the section. */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <h2 className="text-base font-semibold text-brand-primary font-serif truncate">
            {label} ({relationships.length})
          </h2>
        </button>
        <SectionAddButton onClick={openAdd} title="Add relationship" />
      </div>

      {expanded && (
        <div className="mt-3">
          {showForm && (
            <MobileFormSheet title={editingId ? 'Edit Relationship' : 'Add Relationship'} onClose={resetForm}>
              <SingleSelect
                label="Rep *"
                value={formRepId}
                onChange={setFormRepId}
                options={userOptions.map(u => ({ value: String(u.id), label: u.value }))}
                placeholder="Select rep..."
              />

              <CompanyPicker
                companies={companies}
                value={formCompanyId}
                onChange={id => { setFormCompanyId(id); setFormNewCompanyName(''); }}
                onPickOther={() => setFormCompanyId(OTHER_COMPANY)}
                otherName={formNewCompanyName}
              />
              {formCompanyId === OTHER_COMPANY && (
                <input
                  value={formNewCompanyName}
                  onChange={e => setFormNewCompanyName(e.target.value)}
                  placeholder="New company name *"
                  className="input-field w-full"
                />
              )}

              <MultiSelect
                label="Relationship Status *"
                options={statusOptions}
                values={formStatus}
                onChange={setFormStatus}
                placeholder="Select status..."
              />
              {formStatus.includes('Other') && (
                <input
                  value={otherStatus}
                  onChange={e => setOtherStatus(e.target.value.slice(0, OTHER_VALUE_MAX))}
                  placeholder={`Describe the status (max ${OTHER_VALUE_MAX} characters) *`}
                  maxLength={OTHER_VALUE_MAX}
                  className="input-field w-full"
                />
              )}

              <SingleSelect
                label="Strength"
                value={formStrength}
                onChange={setFormStrength}
                options={strengthOptions.map(o => ({ value: o.value, label: o.value }))}
                placeholder="Select strength..."
              />

              <MultiSelect
                label="Vendor Type"
                options={vendorTypeOptions}
                values={formVendorType}
                onChange={setFormVendorType}
                placeholder="Select vendor type..."
              />
              {formVendorType.includes('Other') && (
                <input
                  value={otherVendorType}
                  onChange={e => setOtherVendorType(e.target.value.slice(0, OTHER_VALUE_MAX))}
                  placeholder={`Describe the vendor type (max ${OTHER_VALUE_MAX} characters) *`}
                  maxLength={OTHER_VALUE_MAX}
                  className="input-field w-full"
                />
              )}

              <div>
                <label className="label">Notes / Context *</label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  rows={3}
                  className="input-field w-full"
                  placeholder="Add relationship context here (ie, main point of contact, known contract terms, etc.)"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={resetForm} className="btn-secondary text-sm">Cancel</button>
                <button type="button" onClick={handleSubmit} disabled={saving} className="btn-primary text-sm">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </MobileFormSheet>
          )}

          {relationships.length === 0 && !showForm ? (
            <p className="text-sm text-gray-400 text-center py-3">No related companies yet.</p>
          ) : (
            <div className="space-y-2">
              {relationships.map(rel => (
                <VendorRelationshipCard
                  key={rel.id}
                  rel={rel}
                  userOptions={userOptions}
                  colorMaps={colorMaps}
                  onEdit={() => openEdit(rel)}
                  onDelete={() => handleDelete(rel.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Asked on submit rather than while typing: whether a one-off value
          should join the list everyone picks from. */}
      {keepPrompt && (
        // Centred at every width. As a bottom sheet on a phone it read as part
        // of the form behind it and went unnoticed.
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-sheet-mobile bg-white w-full max-w-md rounded-2xl shadow-2xl">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-brand-primary font-serif">Save for next time?</h2>
              <p className="text-sm text-gray-500 mt-1">
                {keepPrompt.length === 1
                  ? 'You typed in a value that isn’t on the list yet.'
                  : 'You typed in values that aren’t on the list yet.'}
              </p>
            </div>
            <div className="px-4 sm:px-6 py-3 divide-y divide-gray-100">
              {keepPrompt.map(t => (
                <p key={t.category} className="py-2 text-sm text-gray-700">
                  <span className="font-medium">{t.value}</span>
                  <span className="text-gray-400"> — {t.label}</span>
                </p>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-4 border-t border-gray-200">
              <button type="button" onClick={() => { const p = keepPrompt; setKeepPrompt(null); void save([]); void p; }} className="btn-secondary text-sm">
                Just this once
              </button>
              <button
                type="button"
                onClick={() => { const cats = keepPrompt.map(t => t.category); setKeepPrompt(null); void save(cats); }}
                className="btn-primary text-sm"
              >
                Add as an option
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
