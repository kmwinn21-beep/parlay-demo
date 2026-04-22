'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  accent_color: string | null;
  accent_gradient: string | null;
  image_url: string | null;
  image_max_width: number | null;
  html_content: string | null;
  image_offset_y: number | null;
  html_offset_y: number | null;
  form_width: number | null;
  form_height: number | null;
  form_offset_y: number | null;
  panel_logo_url: string | null;
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

function adjustHex(hex: string, amount: number): string {
  const clean = (hex || '#808080').replace('#', '').padEnd(6, '0');
  const r = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) + amount * 255)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) + amount * 255)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) + amount * 255)));
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
}

export function buildAccentBackground(color: string, gradient: string | null): string {
  const c = color || '#FFCB3F';
  switch (gradient) {
    case 'radial-light':
      return `radial-gradient(ellipse at center, ${adjustHex(c, 0.25)} 0%, ${c} 100%)`;
    case 'radial-dark':
      return `radial-gradient(ellipse at center, ${c} 0%, ${adjustHex(c, -0.2)} 100%)`;
    case 'linear-top':
      return `linear-gradient(to bottom, ${adjustHex(c, 0.2)} 0%, ${c} 100%)`;
    case 'linear-bottom':
      return `linear-gradient(to bottom, ${c} 0%, ${adjustHex(c, -0.2)} 100%)`;
    default:
      return c;
  }
}

function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\s+on\w+="[^"]*"/gi, '')
      .replace(/\s+on\w+='[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script').forEach(el => el.remove());
  doc.querySelectorAll<HTMLElement>('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on') || attr.value.toLowerCase().includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
    });
    el.style.background = '';
    el.style.backgroundColor = '';
  });
  return doc.body.innerHTML;
}

function isColorLight(hex: string): boolean {
  const c = (hex || '#000000').replace('#', '').padEnd(6, '0');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
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
  const [isLandscape, setIsLandscape] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanBanner, setScanBanner] = useState(false);
  const [scanCompanyMatches, setScanCompanyMatches] = useState<{ id: number; name: string }[]>([]);
  const attendeeDropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Portal SSR safety — document.body is only available client-side
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (min-width: 768px)');
    setIsLandscape(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Lock body + html scroll to cover full viewport while form is open
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

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
      form.fields.forEach(f => {
        if (['title', 'company', 'email'].includes(f.field_key || '')) setValue(f.id, '');
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

  const handleScanFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same photo can be retried
    setScanLoading(true);
    setScanBanner(false);
    setScanCompanyMatches([]);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: file.type }),
      });
      if (!res.ok) throw new Error('scan failed');
      const data: {
        first_name: string | null; last_name: string | null; title: string | null;
        company: string | null; email: string | null; phone: string | null; extra_text: string | null;
      } = await res.json();

      // ── Name → populate attendee search + default to "Other" path ──
      if (data.first_name || data.last_name) {
        const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ');
        setAttendeeSearch(fullName);
        setAttendeeDropOpen(true);
        setIsOther(true); // fallback — user can pick a match to override
        setManualFirst(data.first_name || '');
        setManualLast(data.last_name || '');
      }

      // ── Map detected values to matching form fields by field_key ──
      form.fields.forEach(f => {
        if (f.field_key === 'title' && data.title) setValue(f.id, data.title);
        if (f.field_key === 'company' && data.company) setValue(f.id, data.company);
        if (f.field_key === 'email' && data.email) setValue(f.id, data.email);
        if (f.field_key === 'phone' && data.phone) setValue(f.id, data.phone);
        // Extra text → first notes field found
        if (data.extra_text && (f.field_key === 'notes' || f.label.toLowerCase().includes('note'))) {
          setValue(f.id, data.extra_text);
        }
      });

      // ── Company name search → inline suggestions ──
      if (data.company) {
        const srRes = await fetch(`/api/search?q=${encodeURIComponent(data.company)}`);
        if (srRes.ok) {
          const sr = await srRes.json();
          if (sr.companies?.length) setScanCompanyMatches(sr.companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
        }
      }

      setScanBanner(true);
    } catch {
      toast.error('Could not read card — try again with better lighting');
    } finally {
      setScanLoading(false);
    }
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
      // Reset form for next attendee — keep form open at the booth
      setValues({});
      setAttendeeSearch('');
      setIsOther(false);
      setManualFirst('');
      setManualLast('');
    } catch {
      toast.error('Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  // Form card colors
  const bgColor = form.background_color || '#0B3C62';
  const cardIsLight = isColorLight(bgColor);
  const textColor = cardIsLight ? '#1a1a1a' : '#ffffff';
  const inputBg = cardIsLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)';
  const inputBorder = cardIsLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)';
  const inputText = cardIsLight ? '#1a1a1a' : '#ffffff';

  // Page accent colors
  const accentColor = form.accent_color || '#FFCB3F';
  const accentBg = buildAccentBackground(accentColor, form.accent_gradient);
  const accentIsLight = isColorLight(accentColor);
  const imageMaxWidth = form.image_max_width ?? 80;
  const imageOffsetY = form.image_offset_y ?? 0;
  const htmlOffsetY = form.html_offset_y ?? 0;
  const formWidth = form.form_width ?? 420;
  const formHeight = form.form_height ?? null;
  const formOffsetY = form.form_offset_y ?? 0;

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
                <input type="text" value={manualFirst} onChange={e => setManualFirst(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
                  placeholder="First name" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: textColor }}>Last Name *</label>
                <input type="text" value={manualLast} onChange={e => setManualLast(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
                  placeholder="Last name" />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (field.field_type === 'text_single') {
      const isCompanyField = field.field_key === 'company';
      const showCompanySuggestions = isCompanyField && scanCompanyMatches.length > 0;
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <div className="relative">
            <input type="text" value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
              placeholder={field.placeholder || ''} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }} />
            {showCompanySuggestions && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
                  Companies in system — tap to confirm
                </p>
                {scanCompanyMatches.slice(0, 5).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-blue-50 flex items-center gap-2"
                    onClick={() => { setValue(field.id, c.name); setScanCompanyMatches([]); }}
                  >
                    <svg className="w-3.5 h-3.5 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    {c.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100"
                  onClick={() => setScanCompanyMatches([])}
                >
                  Keep scanned value — will be created on submit if new
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (field.field_type === 'text_paragraph') {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <textarea rows={4} value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }} />
        </div>
      );
    }

    if (field.field_type === 'number') {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <input type="number" value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }} />
        </div>
      );
    }

    if (field.field_type === 'datetime') {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <input type="datetime-local" value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }} />
        </div>
      );
    }

    if (field.field_type === 'checkbox') {
      return (
        <div key={field.id} className="flex items-center gap-3">
          <input type="checkbox" id={`field-${field.id}`} checked={(values[field.id] as string) === 'true'}
            onChange={e => setValue(field.id, e.target.checked ? 'true' : 'false')} className="w-4 h-4 rounded accent-white" />
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
          <select value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}>
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
                <input type="checkbox" checked={selected.includes(o.value)}
                  onChange={e => {
                    const next = e.target.checked ? [...selected, o.value] : selected.filter(v => v !== o.value);
                    setValue(field.id, next);
                  }} className="w-4 h-4 rounded" />
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

  // Shared form card interior used in both layouts
  const formCardInterior = (
    <form onSubmit={handleSubmit} className="flex flex-col">
      {/* Card header */}
      <div className="px-6 pt-6 pb-3 text-center">
        {/* Portrait: brand logo top-left for brand continuity */}
        {!isLandscape && brandLogoUrl && (
          <div className="flex justify-start mb-3">
            <img src={brandLogoUrl} alt="Brand" className="h-8 w-auto object-contain" />
          </div>
        )}
        <h2 className="text-xl font-bold font-serif" style={{ color: textColor }}>{form.name}</h2>
        <p className="text-xs mt-0.5 opacity-70" style={{ color: textColor }}>{conferenceName}</p>
        {form.conference_logo_url && (
          <div className="flex justify-center mt-3">
            <img src={form.conference_logo_url} alt="Conference Logo" className="h-14 w-auto object-contain" />
          </div>
        )}
      </div>
      <div className="h-px mx-6 mb-1 opacity-20" style={{ background: textColor }} />

      {/* ── Card / Badge scanner ── */}
      <div className="px-6 pt-3 pb-1">
        <button
          type="button"
          disabled={scanLoading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{
            background: cardIsLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.13)',
            color: textColor,
            border: `1px solid ${inputBorder}`,
          }}
        >
          {scanLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Scanning…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Scan Business Card / Badge
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleScanFile}
        />
        {scanBanner && (
          <div
            className="mt-2 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: cardIsLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)', color: textColor }}
          >
            <span className="opacity-80">✓ Card scanned — review fields and select any matches below</span>
            <button type="button" onClick={() => setScanBanner(false)} className="opacity-50 hover:opacity-100 flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="px-6 py-4 space-y-5">
        {form.fields.map(renderField)}
      </div>
      {/* Submit */}
      <div className="px-6 pb-6">
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: cardIsLight ? '#0B3C62' : '#ffffff', color: cardIsLight ? '#ffffff' : '#0B3C62' }}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </form>
  );

  if (!mounted) return null;

  const overlay = (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        width: '100vw', height: '100vh',
        zIndex: 9999,
        overflow: 'hidden',
        background: accentBg,
        transition: 'background 0.3s ease',
      }}
    >
      {/* Floating close button */}
      <button
        type="button"
        onClick={onClose}
        className="rounded-full w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-70 shadow-md"
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 10000,
          background: accentIsLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)',
          color: accentIsLight ? '#1a1a1a' : '#ffffff',
        }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {isLandscape ? (
        /* ── Landscape: 2-column layout ── */
        <div className="flex h-full">

          {/* Left panel — grid: logo (auto) + image (1fr) + html (3fr), no scrollbar */}
          <div className="flex-1 flex flex-col overflow-hidden p-8" style={{ height: '100%' }}>
            {/* Panel logo — per-form configurable, falls back to global brand logo */}
            {(form.panel_logo_url || brandLogoUrl) && (
              <div className="mb-4 flex-shrink-0">
                <img src={form.panel_logo_url || brandLogoUrl!} alt="Logo" className="h-12 w-auto object-contain" />
              </div>
            )}
            {/* 4-row grid: image (1fr) + html text (3fr) */}
            <div style={{ display: 'grid', gridTemplateRows: '1fr 3fr', flex: 1, minHeight: 0, gap: '1rem' }}>

              {/* Image cell — row 1 (1fr = 25%) */}
              <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {form.image_url && !imgError ? (
                  <img
                    src={form.image_url}
                    alt=""
                    onError={() => setImgError(true)}
                    className="rounded-lg shadow-lg"
                    style={{
                      maxWidth: `${imageMaxWidth}%`,
                      height: 'auto',
                      objectFit: 'contain',
                      transform: `translateY(${imageOffsetY}px)`,
                    }}
                  />
                ) : (
                  <div
                    className="w-full h-full rounded-xl flex items-center justify-center"
                    style={{
                      border: `2px dashed ${accentIsLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.35)'}`,
                      color: accentIsLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)',
                      transform: `translateY(${imageOffsetY}px)`,
                    }}
                  >
                    <span className="text-lg font-semibold tracking-wide">Image Element</span>
                  </div>
                )}
              </div>

              {/* HTML text cell — rows 2-4 (3fr = 75%) */}
              <div style={{ overflow: 'hidden', position: 'relative' }}>
                <div style={{ transform: `translateY(${htmlOffsetY}px)` }}>
                  {form.html_content ? (
                    <div
                      className="prose prose-sm max-w-none"
                      style={{ color: accentIsLight ? '#1a1a1a' : '#ffffff' }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.html_content) }}
                    />
                  ) : (
                    <div
                      className="rounded-xl flex items-center justify-center py-12"
                      style={{
                        border: `2px dashed ${accentIsLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.35)'}`,
                        color: accentIsLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      <span className="text-lg font-semibold tracking-wide">HTML Text Element</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Right panel — column is formHeight tall (or 100% if unset), form card fills it */}
          <div
            className="flex-shrink-0 flex flex-col justify-center overflow-hidden"
            style={{ width: formWidth, minWidth: 280, height: '100%' }}
          >
            {/* Inner container: sized to formHeight; form card stretches to fill it */}
            <div
              className="flex flex-col px-6 py-6"
              style={{
                height: formHeight != null ? formHeight : '100%',
                flexShrink: 0,
                transform: formOffsetY !== 0 ? `translateY(${formOffsetY}px)` : undefined,
              }}
            >
              <div
                className="w-full rounded-2xl shadow-2xl overflow-hidden"
                style={{
                  background: bgColor,
                  flex: formHeight != null ? 1 : undefined,
                }}
              >
                {formCardInterior}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Portrait: centered card ── */
        <div className="flex flex-col p-6 py-12 overflow-y-auto" style={{ height: '100%' }}>
          <div
            className="my-auto mx-auto w-full max-w-[480px] rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: bgColor, border: '2px solid rgba(255,255,255,0.2)' }}
          >
            {formCardInterior}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
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
