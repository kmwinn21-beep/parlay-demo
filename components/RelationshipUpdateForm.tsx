'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { MobileFormSheet } from '@/components/MobileFormSheet';
import { MultiSelect, type ConfigOption } from '@/components/VendorRelationshipFields';
import type { VendorRelationship } from '@/components/VendorRelationshipCard';

/**
 * Saying something new about a relationship that already exists.
 *
 * One form rather than two buttons. "Update" and "Update and mark stale" are
 * the same action with a checkbox, and two buttons on a card is two things to
 * keep in step across every surface that renders it.
 *
 * The toggle is the whole point of the form:
 *
 *   off  — you looked, and it still holds. Stamps the relationship confirmed
 *          as of today and clears any stale flag.
 *   on   — you have reason to think it has moved on, but not what to. Flags
 *          the card and deliberately does NOT stamp it confirmed, because
 *          saying "I am not sure this is current" and "this is current as of
 *          today" are opposite claims.
 *
 * The status is optional and separate. Learning a company left a vendor is a
 * status change (to Former Vendor) and is not stale at all — it is the
 * freshest the record has ever been.
 */
export function RelationshipUpdateForm({ rel, statusOptions, onClose, onSaved }: {
  rel: VendorRelationship;
  statusOptions: ConfigOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<string[]>(rel.relationship_status);
  const [markStale, setMarkStale] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!body.trim()) {
      toast.error('Add a note saying what changed.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/vendor-relationships/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationship_id: rel.id,
          body: body.trim(),
          status_after: status,
          mark_stale: markStale,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save update');
        return;
      }
      toast.success(markStale ? 'Flagged as possibly out of date' : 'Relationship confirmed');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileFormSheet title={`Update · ${rel.related_company_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            What changed? <span className="text-red-500">*</span>
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Heard at the conference that they're evaluating alternatives…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/40"
          />
          {/* Said plainly because the thread is append-only and people expect a
              notes field to be a draft. */}
          <p className="text-[11px] text-gray-400 mt-1">
            Added to this relationship&apos;s history. Earlier entries are kept.
          </p>
        </div>

        <MultiSelect
          label="Relationship Status"
          options={statusOptions}
          values={status}
          onChange={setStatus}
          placeholder="Unchanged"
        />

        <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            checked={markStale}
            onChange={e => setMarkStale(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-800">Mark as possibly out of date</span>
            <span className="block text-[11px] text-gray-500 mt-0.5">
              The card is kept and greyed out. Use this when you suspect it has changed but
              don&apos;t know what to. If you know, set the status above instead.
            </span>
          </span>
        </label>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-lg bg-brand-secondary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : markStale ? 'Save & mark stale' : 'Save & confirm'}
          </button>
        </div>
      </div>
    </MobileFormSheet>
  );
}
