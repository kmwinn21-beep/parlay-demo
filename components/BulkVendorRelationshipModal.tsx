'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  SingleSelect, MultiSelect, CompanyPicker, resolveOther,
  OTHER_COMPANY, OTHER_VALUE_MAX,
  type CompanyOption, type ConfigOption,
} from '@/components/VendorRelationshipFields';
import type { UserOption } from '@/lib/useUserOptions';

/**
 * The Vendor / Other Relationship form, applied across a table selection.
 *
 * Same fields and same rules as the one on a company's detail page — one
 * relationship is written per selected company, all pointing at the single
 * related company chosen here. A company selected in the table that happens to
 * BE that related company is skipped rather than failed: the API rejects a
 * company related to itself, and one nonsensical pair shouldn't sink the rest.
 */
export function BulkVendorRelationshipModal({
  isOpen, onClose, onSuccess, companyIds, title, userOptions, currentUserConfigId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  companyIds: number[];
  /** The section's label from Section Management, so the two agree. */
  title: string;
  userOptions: UserOption[];
  currentUserConfigId: number | null;
}) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<ConfigOption[]>([]);
  const [vendorTypeOptions, setVendorTypeOptions] = useState<ConfigOption[]>([]);
  const [strengthOptions, setStrengthOptions] = useState<ConfigOption[]>([]);
  const [saving, setSaving] = useState(false);

  const [formRepId, setFormRepId] = useState('');
  const [formCompanyId, setFormCompanyId] = useState<number | null>(null);
  const [formNewCompanyName, setFormNewCompanyName] = useState('');
  const [formStatus, setFormStatus] = useState<string[]>([]);
  const [formStrength, setFormStrength] = useState('');
  const [formVendorType, setFormVendorType] = useState<string[]>([]);
  const [formNotes, setFormNotes] = useState('');
  const [otherStatus, setOtherStatus] = useState('');
  const [otherVendorType, setOtherVendorType] = useState('');
  const [keepPrompt, setKeepPrompt] = useState<{ category: string; label: string; value: string }[] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFormRepId(currentUserConfigId != null ? String(currentUserConfigId) : '');
    fetch('/api/companies?limit=2000').then(r => r.ok ? r.json() : []).then((d: CompanyOption[]) => {
      setCompanies(Array.isArray(d) ? d.map(c => ({ id: c.id, name: c.name })) : []);
    }).catch(() => {});
    const loadCat = (cat: string, set: (v: ConfigOption[]) => void) =>
      fetch(`/api/config?category=${cat}`).then(r => r.ok ? r.json() : []).then((d: ConfigOption[]) =>
        set(Array.isArray(d) ? d.map(o => ({ id: o.id, value: o.value })) : [])).catch(() => {});
    loadCat('other_relationship_status', setStatusOptions);
    loadCat('vendor_type', setVendorTypeOptions);
    loadCat('rep_relationship_type', setStrengthOptions);
  }, [isOpen, currentUserConfigId]);

  const reset = () => {
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

      for (const cat of keepCategories) {
        const value = cat === 'other_relationship_status' ? otherStatus.trim() : otherVendorType.trim();
        if (!value) continue;
        await fetch('/api/config', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, value }),
        }).catch(() => {});
      }

      const shared = {
        related_company_id: relatedId,
        rep_id: Number(formRepId),
        relationship_status: resolveOther(formStatus, otherStatus),
        strength: formStrength || null,
        vendor_type: resolveOther(formVendorType, otherVendorType),
        notes: formNotes.trim(),
      };

      const targets = companyIds.filter(id => id !== relatedId);
      const skipped = companyIds.length - targets.length;
      let written = 0;
      for (const companyId of targets) {
        const res = await fetch('/api/vendor-relationships', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...shared, company_id: companyId }),
        });
        if (res.ok) written += 1;
      }

      if (written === 0) {
        toast.error('Failed to add the relationships.');
        return;
      }
      const failed = targets.length - written;
      toast.success(
        `Relationship added to ${written} compan${written === 1 ? 'y' : 'ies'}.` +
        (skipped > 0 ? ' The related company itself was skipped.' : '') +
        (failed > 0 ? ` ${failed} failed.` : '')
      );
      reset();
      onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-brand-highlight p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-brand-primary font-serif mb-1">Add {title}</h3>
        <p className="text-xs text-gray-500 mb-4">
          Applied to {companyIds.length} selected compan{companyIds.length === 1 ? 'y' : 'ies'}
        </p>

        <div className="space-y-3">
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

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { reset(); onClose(); }} className="btn-secondary text-sm">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {keepPrompt && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => e.stopPropagation()}
        >
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
              <button type="button" onClick={() => { setKeepPrompt(null); void save([]); }} className="btn-secondary text-sm">
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
