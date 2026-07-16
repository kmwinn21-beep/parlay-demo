'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { buildAccentBackground } from '@/components/ExpandedFormModal';
import { resolveVideoEmbed } from '@/lib/videoEmbed';

export const dynamic = 'force-dynamic';

interface FormFieldOption { id: number; value: string }
interface FormField {
  id: number;
  field_type: string;
  field_key: string | null;
  label: string;
  placeholder: string | null;
  required: boolean;
  options_source: string | null;
  options: FormFieldOption[];
}
interface FormElement {
  id: number;
  element_type: string;
  x: number; y: number; width: number; height: number; z_index: number;
  content: string | null;
  object_fit: 'contain' | 'cover';
  focal_x: number; focal_y: number;
  corner_style: 'square' | 'rounded';
}
interface PublicForm {
  id: number;
  conference_id: number;
  conference_name: string;
  name: string;
  conference_logo_url: string | null;
  background_color: string | null;
  accent_color: string | null;
  accent_gradient: string | null;
  form_width: number | null;
  form_height: number | null;
  form_offset_y: number | null;
  form_x: number | null;
  form_z_index: number;
  background_image_url: string | null;
  background_image_opacity: number | null;
  background_video_url: string | null;
  background_video_opacity: number | null;
  eyebrow_color: string | null;
  submit_button_color: string | null;
  field_background_color: string | null;
  panel_logo_url: string | null;
  fields: FormField[];
  elements: FormElement[];
}

function isColorLight(hex: string): boolean {
  const c = (hex || '#000000').replace('#', '').padEnd(6, '0');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script').forEach(el => el.remove());
  doc.querySelectorAll<HTMLElement>('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on') || attr.value.toLowerCase().includes('javascript:')) el.removeAttribute(attr.name);
    });
  });
  return doc.body.innerHTML;
}

function ElementView({ el }: { el: FormElement }) {
  const cornerClass = el.corner_style === 'rounded' ? 'rounded-xl' : 'rounded-none';
  const [errored, setErrored] = useState(false);
  const src = el.content || '';

  if (el.element_type === 'text') {
    return (
      <div
        className="absolute overflow-hidden"
        style={{ left: el.x, top: el.y, width: el.width, height: el.height, zIndex: el.z_index }}
      >
        <div className="prose prose-sm max-w-none h-full overflow-y-auto" dangerouslySetInnerHTML={{ __html: sanitizeHtml(src) }} />
      </div>
    );
  }

  if (el.element_type === 'video') {
    const embed = resolveVideoEmbed(src, { autoplay: true, controls: true });
    return (
      <div
        className={`absolute overflow-hidden ${cornerClass}`}
        style={{ left: el.x, top: el.y, width: el.width, height: el.height, zIndex: el.z_index }}
      >
        {embed.type === 'iframe' ? (
          <iframe src={embed.src} className="w-full h-full" style={{ border: 0 }} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        ) : (
          <video
            src={src}
            className="w-full h-full"
            style={{ objectFit: el.object_fit, objectPosition: `${el.focal_x}% ${el.focal_y}%` }}
            controls autoPlay loop muted playsInline
          />
        )}
      </div>
    );
  }

  // image
  if (!src || errored) return null;
  return (
    <div
      className={`absolute overflow-hidden ${cornerClass}`}
      style={{ left: el.x, top: el.y, width: el.width, height: el.height, zIndex: el.z_index }}
    >
      <img
        src={src}
        alt=""
        onError={() => setErrored(true)}
        className="w-full h-full pointer-events-none"
        style={{ objectFit: el.object_fit, objectPosition: `${el.focal_x}% ${el.focal_y}%` }}
      />
    </div>
  );
}

function PublicFormInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const aid = searchParams.get('aid') || '';

  const [state, setState] = useState<'loading' | 'not_found' | 'ready' | 'submitted' | 'error'>('loading');
  const [form, setForm] = useState<PublicForm | null>(null);
  const [values, setValues] = useState<Record<number, string | string[]>>({});
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!token || !aid) { setState('not_found'); return; }
    fetch(`/api/public/conference-forms?token=${encodeURIComponent(token)}&aid=${encodeURIComponent(aid)}`)
      .then(async r => (r.ok ? r.json() : Promise.reject()))
      .then((data: PublicForm) => { setForm(data); setState('ready'); })
      .catch(() => setState('not_found'));
  }, [token, aid]);

  const setValue = (fieldId: number, val: string | string[]) => setValues(prev => ({ ...prev, [fieldId]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!firstName.trim() || !lastName.trim()) { toast.error('First and last name are required'); return; }
    for (const f of form.fields) {
      if (f.field_key === 'attendee_name') continue;
      if (f.required) {
        const v = values[f.id];
        if (!v || (Array.isArray(v) ? v.length === 0 : !String(v).trim())) {
          toast.error(`"${f.label}" is required`);
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
      const res = await fetch('/api/public/form-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, aid,
          honeypot: honeypotRef.current?.value || '',
          manual_first_name: firstName.trim(),
          manual_last_name: lastName.trim(),
          values: submissionValues,
        }),
      });
      if (!res.ok) throw new Error();
      setState('submitted');
    } catch {
      setState('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  if (state === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm text-center">
          <h1 className="text-lg font-bold text-gray-800 mb-1">Form not available</h1>
          <p className="text-sm text-gray-500">This link is invalid or the form is no longer accepting responses.</p>
        </div>
      </div>
    );
  }

  if (!form) return null;

  const bgColor = form.background_color || '#0B3C62';
  const cardIsLight = isColorLight(bgColor);
  const textColor = cardIsLight ? '#1a1a1a' : '#ffffff';
  const fieldIsLight = form.field_background_color ? isColorLight(form.field_background_color) : cardIsLight;
  const inputBg = form.field_background_color || (cardIsLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)');
  const inputBorder = fieldIsLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)';
  const fieldTextColor = fieldIsLight ? '#1a1a1a' : '#ffffff';
  const eyebrowColor = form.eyebrow_color || textColor;
  const submitBg = form.submit_button_color || (cardIsLight ? '#0B3C62' : '#ffffff');
  const submitTextColor = isColorLight(submitBg) ? '#0B3C62' : '#ffffff';

  const accentColor = form.accent_color || '#FFCB3F';
  const accentBg = buildAccentBackground(accentColor, form.accent_gradient);

  const formWidth = form.form_width ?? 420;
  const formHeight = form.form_height ?? 560;
  const formX = isDesktop ? (form.form_x ?? Math.round((window.innerWidth - formWidth) / 2)) : 0;
  const formY = isDesktop ? (form.form_offset_y ?? Math.round((window.innerHeight - formHeight) / 2)) : 0;

  const renderField = (field: FormField) => {
    if (field.field_key === 'attendee_name') {
      return (
        <div key={field.id} className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: textColor }}>First Name *</label>
            <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: fieldTextColor }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: textColor }}>Last Name *</label>
            <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: fieldTextColor }} />
          </div>
        </div>
      );
    }
    const labelEl = (
      <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
        {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
      </label>
    );
    const inputStyle = { background: inputBg, border: `1px solid ${inputBorder}`, color: fieldTextColor } as React.CSSProperties;

    if (field.field_type === 'text_paragraph') {
      return (
        <div key={field.id}>
          {labelEl}
          <textarea rows={4} required={field.required} value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none" style={inputStyle} />
        </div>
      );
    }
    if (field.field_type === 'number') {
      return (
        <div key={field.id}>
          {labelEl}
          <input type="number" required={field.required} value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle} />
        </div>
      );
    }
    if (field.field_type === 'datetime') {
      return (
        <div key={field.id}>
          {labelEl}
          <input type="datetime-local" required={field.required} value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle} />
        </div>
      );
    }
    if (field.field_type === 'checkbox') {
      return (
        <div key={field.id} className="flex items-center gap-3">
          <input type="checkbox" id={`field-${field.id}`} checked={(values[field.id] as string) === 'true'}
            onChange={e => setValue(field.id, e.target.checked ? 'true' : 'false')} className="w-4 h-4 rounded" />
          <label htmlFor={`field-${field.id}`} className="text-sm font-semibold" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
        </div>
      );
    }
    if (['dropdown', 'single_select'].includes(field.field_type) || (field.field_type === 'searchable_dropdown' && !field.options_source)) {
      return (
        <div key={field.id}>
          {labelEl}
          <select required={field.required} value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle}>
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
          {labelEl}
          <div className="space-y-1.5">
            {field.options.map(o => (
              <label key={o.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selected.includes(o.value)}
                  onChange={e => setValue(field.id, e.target.checked ? [...selected, o.value] : selected.filter(v => v !== o.value))}
                  className="w-4 h-4 rounded" />
                <span className="text-sm" style={{ color: textColor }}>{o.value}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }
    // text_single, and searchable_dropdown with an internal options_source (downgraded — that
    // source data is internal CRM state, not safe/meaningful to expose on a public form)
    return (
      <div key={field.id}>
        {labelEl}
        <input type="text" required={field.required} value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
          placeholder={field.placeholder || ''} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle} />
      </div>
    );
  };

  const formCard = (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <div className="px-6 pt-6 pb-3 text-center">
        <h2 className="text-xl font-bold font-serif" style={{ color: textColor }}>{form.name}</h2>
        <p className="text-xs mt-0.5 opacity-70" style={{ color: eyebrowColor }}>{form.conference_name}</p>
        {form.conference_logo_url && (
          <div className="flex justify-center mt-3">
            <img src={form.conference_logo_url} alt="Conference Logo" className="h-14 w-auto object-contain" />
          </div>
        )}
      </div>
      <div className="h-px mx-6 mb-1 opacity-20" style={{ background: textColor }} />
      <div className="px-6 py-4 space-y-5">
        {form.fields.map(renderField)}
      </div>
      {/* Honeypot — visually hidden, real users never see or fill it in */}
      <div style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input ref={honeypotRef} id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="px-6 pb-6">
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: submitBg, color: submitTextColor }}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </form>
  );

  if (state === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: accentBg }}>
        <div className="rounded-2xl shadow-2xl p-8 max-w-sm text-center" style={{ background: bgColor }}>
          <div className="w-12 h-12 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-lg font-bold mb-1" style={{ color: textColor }}>Thank you!</h1>
          <p className="text-sm opacity-70" style={{ color: textColor }}>Your response has been submitted.</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm text-center">
          <h1 className="text-lg font-bold text-gray-800 mb-1">Something went wrong</h1>
          <p className="text-sm text-gray-500 mb-4">We couldn&apos;t submit your response. Please try again.</p>
          <button type="button" onClick={() => setState('ready')} className="text-sm font-semibold text-brand-secondary hover:underline">Try again</button>
        </div>
      </div>
    );
  }

  if (isDesktop) {
    return (
      <div className="relative min-h-screen overflow-hidden" style={{ background: accentBg }}>
        {form.background_video_url ? (
          resolveVideoEmbed(form.background_video_url, { autoplay: true, controls: false }).type === 'iframe' ? (
            <iframe
              src={resolveVideoEmbed(form.background_video_url, { autoplay: true, controls: false }).src}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ border: 0, opacity: (form.background_video_opacity ?? 100) / 100 }}
              allow="autoplay; encrypted-media; picture-in-picture"
            />
          ) : (
            <video
              src={form.background_video_url}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ opacity: (form.background_video_opacity ?? 100) / 100 }}
              autoPlay muted loop playsInline
            />
          )
        ) : form.background_image_url && (
          <img
            src={form.background_image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ opacity: (form.background_image_opacity ?? 100) / 100 }}
          />
        )}
        {form.panel_logo_url && (
          <img src={form.panel_logo_url} alt="Logo" className="absolute top-6 left-6 h-12 w-auto object-contain z-10 pointer-events-none" />
        )}
        {form.elements.map(el => <ElementView key={el.id} el={el} />)}
        <div
          className="absolute rounded-2xl shadow-2xl overflow-y-auto"
          style={{ left: formX, top: formY, width: formWidth, height: formHeight, zIndex: form.form_z_index, background: bgColor }}
        >
          {formCard}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-6 py-12 overflow-y-auto" style={{ background: accentBg }}>
      <div className="my-auto mx-auto w-full max-w-[480px] rounded-2xl shadow-2xl overflow-hidden" style={{ background: bgColor, border: '2px solid rgba(255,255,255,0.2)' }}>
        {formCard}
      </div>
    </div>
  );
}

export default function PublicFormPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <PublicFormInner />
    </Suspense>
  );
}
