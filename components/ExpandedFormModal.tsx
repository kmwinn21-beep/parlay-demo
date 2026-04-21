'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

export interface FormField {
  id: number;
  field_type: string;
  field_key: string | null;
  label: string;
  placeholder: string | null;
  required: boolean;
  sort_order: number;
  options_source: string | null;
  options: { id: number; value: string; sort_order: number }[];
  is_template_field?: boolean;
}

export interface ConferenceForm {
  id: number;
  name: string;
  conference_logo_url: string | null;
  background_color: string | null;
  created_by: string | null;
  created_at: string;
  fields: FormField[];
  submission_count?: number;
  template_id?: number | null;
}

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_name?: string;
  email?: string;
}

interface Props {
  form: ConferenceForm;
  conferenceId: number;
  conferenceName: string;
  brandLogoUrl?: string | null;
  attendees: AttendeeOption[];
  onClose: () => void;
  onSubmitted: () => void;
}

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

type FieldValues = Record<number | string, string | string[]>;

export function ExpandedFormModal({ form, conferenceId, conferenceName, brandLogoUrl, attendees, onClose, onSubmitted }: Props) {
  const [values, setValues] = useState<FieldValues>({});
  const [isOther, setIsOther] = useState(false);
  const [manualFirst, setManualFirst] = useState('');
  const [manualLast, setManualLast] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeeDropOpen, setAttendeeDropOpen] = useState(false);
  const attendeeDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (attendeeDropRef.current && !attendeeDropRef.current.contains(e.target as Node)) {
        setAttendeeDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setValue = useCallback((fieldId: number | string, val: string | string[]) => {
    setValues(prev => ({ ...prev, [fieldId]: val }));
  }, []);

  const handleAttendeeSelect = useCallback((attendee: AttendeeOption | null) => {
    if (!attendee) {
      setIsOther(true);
      setAttendeeSearch('Other');
      setAttendeeDropOpen(false);
      // Clear auto-populated fields
      form.fields.forEach(f => {
        if (['title', 'company', 'email'].includes(f.field_key || '')) {
          setValue(f.id, '');
        }
      });
      return;
    }
    setIsOther(false);
    setManualFirst('');
    setManualLast('');
    setAttendeeSearch(`${attendee.first_name} ${attendee.last_name}`);
    setAttendeeDropOpen(false);

    const namePicker = form.fields.find(f => f.field_key === 'attendee_name');
    if (namePicker) setValue(namePicker.id, String(attendee.id));

    form.fields.forEach(f => {
      if (f.field_key === 'title' && attendee.title) setValue(f.id, attendee.title);
      if (f.field_key === 'company' && attendee.company_name) setValue(f.id, attendee.company_name);
      if (f.field_key === 'email' && attendee.email) setValue(f.id, attendee.email);
    });
  }, [form.fields, setValue]);

  const filteredAttendees = attendees.filter(a => {
    const q = attendeeSearch.toLowerCase();
    if (!q || q === 'other') return true;
    return `${a.first_name} ${a.last_name}`.toLowerCase().includes(q)
      || a.company_name?.toLowerCase().includes(q)
      || a.title?.toLowerCase().includes(q);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate required fields
    for (const field of form.fields) {
      if (field.field_key === 'attendee_name') {
        if (!isOther && !values[field.id]) { toast.error('Name is required'); return; }
        if (isOther && (!manualFirst.trim() || !manualLast.trim())) { toast.error('First and last name are required'); return; }
        continue;
      }
      if (field.required) {
        const val = values[field.id];
        if (!val || (Array.isArray(val) ? val.length === 0 : !String(val).trim())) {
          toast.error(`"${field.label}" is required`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const submissionValues = form.fields
        .filter(f => f.field_key !== 'attendee_name')
        .map(f => ({
          field_id: f.id,
          field_label: f.label,
          field_value: Array.isArray(values[f.id]) ? (values[f.id] as string[]).join(', ') : (values[f.id] as string || ''),
        }));

      // Add Name value entry for notes
      if (isOther) {
        submissionValues.unshift({ field_id: -1, field_label: 'Name', field_value: `${manualFirst} ${manualLast}`.trim() });
      } else {
        const namePicker = form.fields.find(f => f.field_key === 'attendee_name');
        const selectedAtt = attendees.find(a => String(a.id) === String(values[namePicker?.id || '']));
        if (selectedAtt) {
          submissionValues.unshift({ field_id: namePicker!.id, field_label: 'Name', field_value: `${selectedAtt.first_name} ${selectedAtt.last_name}` });
        }
      }

      const attendee_id = isOther ? undefined : values[form.fields.find(f => f.field_key === 'attendee_name')?.id || ''];

      const res = await fetch('/api/form-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conference_form_id: form.id,
          conference_id: conferenceId,
          values: submissionValues,
          attendee_id: attendee_id || null,
          manual_first_name: isOther ? manualFirst.trim() : undefined,
          manual_last_name: isOther ? manualLast.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error('Submission failed');
      toast.success('Form submitted!');
      onSubmitted();
      onClose();
    } catch {
      toast.error('Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  const bgColor = form.background_color || '#0B3C62';
  const isLight = (() => {
    const c = bgColor.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  })();
  const textColor = isLight ? '#1a1a1a' : '#ffffff';
  const inputBg = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)';
  const inputBorder = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)';
  const inputText = isLight ? '#1a1a1a' : '#ffffff';

  const renderField = (field: FormField) => {
    if (field.field_key === 'attendee_name') {
      return (
        <div key={field.id} className="space-y-2">
          <label className="block text-sm font-semibold" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <div ref={attendeeDropRef} className="relative">
            <input
              type="text"
              value={attendeeSearch}
              onChange={e => { setAttendeeSearch(e.target.value); setAttendeeDropOpen(true); setIsOther(false); }}
              onFocus={() => setAttendeeDropOpen(true)}
              placeholder="Search attendees..."
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
            />
            {attendeeDropOpen && (
              <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 border-b border-gray-100 font-medium"
                  onClick={() => handleAttendeeSelect(null)}
                >
                  Other (not in list)
                </button>
                {filteredAttendees.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-800"
                    onClick={() => handleAttendeeSelect(a)}
                  >
                    <span className="font-medium">{a.first_name} {a.last_name}</span>
                    {(a.title || a.company_name) && (
                      <span className="text-gray-400 text-xs ml-1">({[a.title, a.company_name].filter(Boolean).join(' – ')})</span>
                    )}
                  </button>
                ))}
                {filteredAttendees.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">No attendees found</div>
                )}
              </div>
            )}
          </div>
          {isOther && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: textColor }}>First Name *</label>
                <input
                  type="text"
                  value={manualFirst}
                  onChange={e => setManualFirst(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: textColor }}>Last Name *</label>
                <input
                  type="text"
                  value={manualLast}
                  onChange={e => setManualLast(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
                  placeholder="Last name"
                />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (field.field_type === 'text_single') {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <input
            type="text"
            value={(values[field.id] as string) || ''}
            onChange={e => setValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
          />
        </div>
      );
    }

    if (field.field_type === 'text_paragraph') {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <textarea
            rows={4}
            value={(values[field.id] as string) || ''}
            onChange={e => setValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
          />
        </div>
      );
    }

    if (field.field_type === 'number') {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <input
            type="number"
            value={(values[field.id] as string) || ''}
            onChange={e => setValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
          />
        </div>
      );
    }

    if (field.field_type === 'datetime') {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <input
            type="datetime-local"
            value={(values[field.id] as string) || ''}
            onChange={e => setValue(field.id, e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
          />
        </div>
      );
    }

    if (field.field_type === 'checkbox') {
      return (
        <div key={field.id} className="flex items-center gap-3">
          <input
            type="checkbox"
            id={`field-${field.id}`}
            checked={(values[field.id] as string) === 'true'}
            onChange={e => setValue(field.id, e.target.checked ? 'true' : 'false')}
            className="w-4 h-4 rounded accent-white"
          />
          <label htmlFor={`field-${field.id}`} className="text-sm font-semibold" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
        </div>
      );
    }

    if (['dropdown', 'single_select'].includes(field.field_type)) {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <select
            value={(values[field.id] as string) || ''}
            onChange={e => setValue(field.id, e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
          >
            <option value="">— Select —</option>
            {field.options.map(o => <option key={o.id} value={o.value}>{o.value}</option>)}
          </select>
        </div>
      );
    }

    if (field.field_type === 'multi_select') {
      const selected = (values[field.id] as string[] | undefined) || [];
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <div className="space-y-1.5">
            {field.options.map(o => (
              <label key={o.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={e => {
                    const next = e.target.checked ? [...selected, o.value] : selected.filter(v => v !== o.value);
                    setValue(field.id, next);
                  }}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm" style={{ color: textColor }}>{o.value}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (field.field_type === 'searchable_dropdown') {
      return (
        <SearchableDropdownField
          key={field.id}
          field={field}
          value={(values[field.id] as string) || ''}
          onChange={val => setValue(field.id, val)}
          textColor={textColor}
          inputBg={inputBg}
          inputBorder={inputBorder}
          inputText={inputText}
          conferenceId={conferenceId}
          attendees={attendees}
        />
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-auto"
      style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: bgColor, minHeight: 400 }}>

        {/* Header with logos */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div className="flex items-center h-12">
            {brandLogoUrl && (
              <img src={brandLogoUrl} alt="Brand Logo" className="h-10 w-auto object-contain" />
            )}
          </div>
          <div className="flex-1 text-center px-4">
            <h2 className="text-xl font-bold font-serif" style={{ color: textColor }}>{form.name}</h2>
            <p className="text-xs mt-0.5 opacity-70" style={{ color: textColor }}>{conferenceName}</p>
          </div>
          <div className="flex items-center h-12">
            {form.conference_logo_url && (
              <img src={form.conference_logo_url} alt="Conference Logo" className="h-10 w-auto object-contain" />
            )}
          </div>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full w-7 h-7 flex items-center justify-center hover:opacity-70 transition-opacity"
          style={{ background: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)', color: textColor }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">
          <div className="h-px opacity-20 mb-2" style={{ background: textColor }} />
          {form.fields.map(renderField)}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
              style={{
                background: isLight ? '#0B3C62' : '#ffffff',
                color: isLight ? '#ffffff' : '#0B3C62',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SearchableDropdownField({
  field, value, onChange, textColor, inputBg, inputBorder, inputText, conferenceId, attendees,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  textColor: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  conferenceId: number;
  attendees: AttendeeOption[];
}) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  const [dynOptions, setDynOptions] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!field.options_source) return;
    if (field.options_source === 'attendee_name') {
      setDynOptions(attendees.map(a => `${a.first_name} ${a.last_name}${a.title ? ` (${a.title}${a.company_name ? ` – ${a.company_name}` : ''})` : ''}`));
    } else if (field.options_source === 'company_name') {
      fetch('/api/companies').then(r => r.json()).then(cos => setDynOptions(cos.map((c: { name: string }) => c.name))).catch(() => {});
    } else if (field.options_source === 'assigned_user') {
      fetch('/api/config?category=user').then(r => r.json()).then(us => setDynOptions(us.map((u: { value: string }) => u.value))).catch(() => {});
    } else if (field.options_source === 'conference_name') {
      fetch('/api/conferences').then(r => r.json()).then(cs => setDynOptions(cs.map((c: { name: string }) => c.name))).catch(() => {});
    }
  }, [field.options_source, attendees]);

  const allOptions = field.options_source ? dynOptions : field.options.map(o => o.value);
  const filtered = allOptions.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref}>
      <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
        {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          placeholder={field.placeholder || 'Search...'}
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
          style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {filtered.map(o => (
              <button
                key={o}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-800"
                onClick={() => { onChange(o); setSearch(o); setOpen(false); }}
              >
                {o}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
