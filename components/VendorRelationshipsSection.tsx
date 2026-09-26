'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MobileFormSheet } from '@/components/MobileFormSheet';
import { SectionAddButton } from '@/components/SectionAddButton';
import { useConfigColors } from '@/lib/useConfigColors';
import { type UserOption } from '@/lib/useUserOptions';
import { useCollapsibleSection } from '@/lib/sectionExpansion';
import {
  SingleSelect, MultiSelect, CompanyPicker, resolveOther,
  OTHER_COMPANY, OTHER_VALUE_MAX,
  type CompanyOption, type ConfigOption,
} from '@/components/VendorRelationshipFields';
import { VendorRelationshipCard, type VendorRelationship } from '@/components/VendorRelationshipCard';
import { useRelationshipStatusOptions } from '@/lib/useRelationshipStatusOptions';

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
  // Both halves of every pair — "Current Vendor" and "Customer" are the same
  // fact from opposite ends, and either is a reasonable thing to reach for.
  const statusOptions = useRelationshipStatusOptions();
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
      setCompanies(list.filter(c => c.id !== companyId).map(c => ({ id: c.id, name: c.name, sub_types: Array.isArray(c.sub_types) ? c.sub_types : [] })));
    }).catch(() => {});
    const loadCat = (cat: string, set: (v: ConfigOption[]) => void) =>
      fetch(`/api/config?category=${cat}`).then(r => r.ok ? r.json() : []).then((d: ConfigOption[]) =>
        set(Array.isArray(d) ? d.map(o => ({ id: o.id, value: o.value })) : [])).catch(() => {});
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
      // The vendor's own Sub Type(s) follow what was chosen here, so the fact
      // lives on the company rather than only on this relationship. Written
      // after the relationship saves, and only when it actually differs.
      const chosenTypes = resolveOther(formVendorType, otherVendorType);
      if (relatedId && chosenTypes.length > 0) {
        const existing = companies.find(c => c.id === relatedId)?.sub_types ?? [];
        const same = existing.length === chosenTypes.length
          && existing.every(t => chosenTypes.includes(t));
        if (!same) {
          await fetch(`/api/companies/${relatedId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sub_types: chosenTypes }),
          }).catch(() => {});
          setCompanies(prev => prev.map(c => (c.id === relatedId ? { ...c, sub_types: chosenTypes } : c)));
        }
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
                onChange={id => {
                  setFormCompanyId(id);
                  setFormNewCompanyName('');
                  // The company already says what kind of vendor it is, so
                  // start from that rather than making it be re-picked. Only
                  // when nothing has been chosen here yet — this shouldn't
                  // overwrite a deliberate choice.
                  const picked = companies.find(c => c.id === id);
                  if (picked?.sub_types?.length && formVendorType.length === 0) {
                    setFormVendorType(picked.sub_types);
                  }
                }}
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
                  onUpdated={load}
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
