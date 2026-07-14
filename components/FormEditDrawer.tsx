'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { BRAND_COLOR_DEFAULTS, BRAND_COLOR_META, type BrandColorKey } from '@/lib/brand';

const BRAND_SWATCH_KEYS: BrandColorKey[] = ['brand_dark_blue', 'brand_bright_blue', 'brand_beige', 'brand_gold'];

interface Props {
  formId: number;
  isEditMode: boolean;
  onToggleEditMode: () => void;
  name: string;
  onNameChange: (v: string) => void;
  backgroundColor: string;
  onBackgroundColorChange: (v: string) => void;
  accentColor: string;
  onAccentColorChange: (v: string) => void;
  backgroundImageUrl: string | null;
  onBackgroundImageChange: (url: string | null) => void;
  backgroundImageOpacity: number;
  onBackgroundImageOpacityChange: (v: number) => void;
  backgroundVideoUrl: string | null;
  onBackgroundVideoChange: (url: string | null) => void;
  backgroundVideoOpacity: number;
  onBackgroundVideoOpacityChange: (v: number) => void;
  eyebrowColor: string | null;
  onEyebrowColorChange: (v: string | null) => void;
  submitButtonColor: string | null;
  onSubmitButtonColorChange: (v: string | null) => void;
  onAddImage: (url: string) => void;
  onAddVideo: (url: string) => void;
  onAddText: () => void;
}

type DockSide = 'left' | 'right' | 'top' | 'bottom';

const DOCK_OPTIONS: { side: DockSide; label: string; path: string }[] = [
  { side: 'left', label: 'Dock left', path: 'M11 19l-7-7 7-7m-7 7h18' },
  { side: 'top', label: 'Dock top', path: 'M5 11l7-7 7 7m-7-7v18' },
  { side: 'right', label: 'Dock right', path: 'M13 5l7 7-7 7M20 12H2' },
  { side: 'bottom', label: 'Dock bottom', path: 'M19 13l-7 7-7-7m7 7V2' },
];

const DOCK_PANEL_CLASS: Record<DockSide, string> = {
  left: 'inset-y-0 left-0 w-full sm:w-[340px]',
  right: 'inset-y-0 right-0 w-full sm:w-[340px]',
  top: 'inset-x-0 top-0 h-full sm:h-[320px]',
  bottom: 'inset-x-0 bottom-0 h-full sm:h-[320px]',
};

const DOCK_ANIM: Record<DockSide, string> = {
  left: 'slideInLeft 200ms ease-out',
  right: 'slideInRight 200ms ease-out',
  top: 'slideInTop 200ms ease-out',
  bottom: 'slideInBottom 200ms ease-out',
};

export function FormEditDrawer({
  formId,
  isEditMode,
  onToggleEditMode,
  name,
  onNameChange,
  backgroundColor,
  onBackgroundColorChange,
  accentColor,
  onAccentColorChange,
  backgroundImageUrl,
  onBackgroundImageChange,
  backgroundImageOpacity,
  onBackgroundImageOpacityChange,
  backgroundVideoUrl,
  onBackgroundVideoChange,
  backgroundVideoOpacity,
  onBackgroundVideoOpacityChange,
  eyebrowColor,
  onEyebrowColorChange,
  submitButtonColor,
  onSubmitButtonColorChange,
  onAddImage,
  onAddVideo,
  onAddText,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingBgVideo, setUploadingBgVideo] = useState(false);
  const [dockSide, setDockSide] = useState<DockSide>('left');
  const [brandColorsOpen, setBrandColorsOpen] = useState(false);
  const [brandColors, setBrandColors] = useState<Record<BrandColorKey, string>>({ ...BRAND_COLOR_DEFAULTS });
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const bgVideoFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<string, string>) => {
        const colors: Record<BrandColorKey, string> = { ...BRAND_COLOR_DEFAULTS };
        for (const key of BRAND_SWATCH_KEYS) {
          if (data[key]) colors[key] = data[key];
        }
        setBrandColors(colors);
      })
      .catch(() => {});
  }, []);

  const uploadFile = async (file: File, kind: 'image' | 'video'): Promise<string | null> => {
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/conference-forms/${formId}/upload-${kind}`, { method: 'POST', body });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      return url as string;
    } catch {
      toast.error(`Failed to upload ${kind}`);
      return null;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    const url = await uploadFile(file, 'image');
    if (url) onAddImage(url);
    setUploading(false);
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingVideo(true);
    const url = await uploadFile(file, 'video');
    if (url) onAddVideo(url);
    setUploadingVideo(false);
  };

  const handleBgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingBg(true);
    const url = await uploadFile(file, 'image');
    if (url) onBackgroundImageChange(url);
    setUploadingBg(false);
  };

  const handleBgVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingBgVideo(true);
    const url = await uploadFile(file, 'video');
    if (url) onBackgroundVideoChange(url);
    setUploadingBgVideo(false);
  };

  return (
    <>
      {/* Gray "Edit Form" trigger — bottom-left corner */}
      <button
        type="button"
        onClick={onToggleEditMode}
        className="fixed bottom-4 left-4 z-[10001] flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold shadow-md transition-colors"
        style={{
          background: isEditMode ? '#374151' : 'rgba(107,114,128,0.85)',
          color: '#fff',
        }}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        {isEditMode ? 'Done Editing' : 'Edit Form'}
      </button>

      {/* Relocatable settings drawer — docks to any screen edge while editing */}
      {isEditMode && (
        <div
          key={dockSide}
          className={`fixed z-[10000] bg-white shadow-2xl overflow-y-auto ${DOCK_PANEL_CLASS[dockSide]}`}
          style={{ animation: DOCK_ANIM[dockSide] }}
        >
          <style>{`
            @keyframes slideInLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
            @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes slideInTop { from { transform: translateY(-100%); } to { transform: translateY(0); } }
            @keyframes slideInBottom { from { transform: translateY(100%); } to { transform: translateY(0); } }
          `}</style>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-brand-primary font-serif">Edit Form</h3>
            <div className="flex items-center gap-2">
              {/* Relocate drawer to another screen edge */}
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                {DOCK_OPTIONS.map(opt => (
                  <button
                    key={opt.side}
                    type="button"
                    onClick={() => setDockSide(opt.side)}
                    title={opt.label}
                    className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${dockSide === opt.side ? 'bg-white shadow-sm text-brand-secondary' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.path} /></svg>
                  </button>
                ))}
              </div>
              <button type="button" onClick={onToggleEditMode} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Form Name</label>
              <input
                type="text"
                value={name}
                onChange={e => onNameChange(e.target.value)}
                className="input-field text-sm w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Form Card Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={backgroundColor} onChange={e => onBackgroundColorChange(e.target.value)} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                <input type="text" value={backgroundColor} onChange={e => onBackgroundColorChange(e.target.value)} className="input-field text-sm flex-1" placeholder="#0B3C62" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Page Background Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={accentColor} onChange={e => onAccentColorChange(e.target.value)} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                <input type="text" value={accentColor} onChange={e => onAccentColorChange(e.target.value)} className="input-field text-sm flex-1" placeholder="#FFCB3F" />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setBrandColorsOpen(v => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
              >
                Brand Colors
                <svg className={`w-3.5 h-3.5 transition-transform ${brandColorsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {brandColorsOpen && (
                <div className="mt-2 space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Apply to Form Card Color</p>
                    <div className="flex gap-2">
                      {BRAND_SWATCH_KEYS.map(key => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onBackgroundColorChange(brandColors[key])}
                          title={BRAND_COLOR_META[key].label}
                          className="w-8 h-8 rounded-full border border-gray-300 hover:ring-2 hover:ring-brand-secondary transition-all flex-shrink-0"
                          style={{ backgroundColor: brandColors[key] }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Apply to Page Background Color</p>
                    <div className="flex gap-2">
                      {BRAND_SWATCH_KEYS.map(key => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onAccentColorChange(brandColors[key])}
                          title={BRAND_COLOR_META[key].label}
                          className="w-8 h-8 rounded-full border border-gray-300 hover:ring-2 hover:ring-brand-secondary transition-all flex-shrink-0"
                          style={{ backgroundColor: brandColors[key] }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-500">Eyebrow Text Color</label>
                  {eyebrowColor && (
                    <button type="button" onClick={() => onEyebrowColorChange(null)} className="text-xs text-gray-400 hover:text-gray-600">Reset</button>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <input type="color" value={eyebrowColor || '#ffffff'} onChange={e => onEyebrowColorChange(e.target.value)} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                  <input type="text" value={eyebrowColor || ''} onChange={e => onEyebrowColorChange(e.target.value)} className="input-field text-sm flex-1" placeholder="Matches Form Card Color text" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-500">Submit Button Color</label>
                  {submitButtonColor && (
                    <button type="button" onClick={() => onSubmitButtonColorChange(null)} className="text-xs text-gray-400 hover:text-gray-600">Reset</button>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <input type="color" value={submitButtonColor || '#0B3C62'} onChange={e => onSubmitButtonColorChange(e.target.value)} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                  <input type="text" value={submitButtonColor || ''} onChange={e => onSubmitButtonColorChange(e.target.value)} className="input-field text-sm flex-1" placeholder="Auto (contrasts Form Card Color)" />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Background Image</label>
              {backgroundImageUrl && (
                <div className="relative">
                  <img src={backgroundImageUrl} alt="Background preview" className="w-full h-20 object-cover rounded-lg border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => onBackgroundImageChange(null)}
                    title="Remove background image"
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={uploadingBg}
                onClick={() => bgFileRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {uploadingBg ? 'Uploading…' : backgroundImageUrl ? 'Replace Background Image' : '+ Add Background Image'}
              </button>
              <input ref={bgFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleBgFileChange} />
              {backgroundImageUrl && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-gray-500 whitespace-nowrap">Opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={backgroundImageOpacity}
                    onChange={e => onBackgroundImageOpacityChange(Number(e.target.value))}
                    className="flex-1 accent-brand-secondary"
                  />
                  <span className="text-xs text-gray-500 w-9 text-right tabular-nums">{backgroundImageOpacity}%</span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Background Video
                {backgroundVideoUrl && <span className="font-normal text-gray-400 ml-1">(takes precedence over Background Image)</span>}
              </label>
              {backgroundVideoUrl && (
                <div className="relative">
                  <video src={backgroundVideoUrl} className="w-full h-20 object-cover rounded-lg border border-gray-200" muted loop autoPlay playsInline />
                  <button
                    type="button"
                    onClick={() => onBackgroundVideoChange(null)}
                    title="Remove background video"
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={uploadingBgVideo}
                onClick={() => bgVideoFileRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                {uploadingBgVideo ? 'Uploading…' : backgroundVideoUrl ? 'Replace Background Video' : '+ Add Background Video'}
              </button>
              <input ref={bgVideoFileRef} type="file" accept="video/*" className="hidden" onChange={handleBgVideoFileChange} />
              {backgroundVideoUrl && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-gray-500 whitespace-nowrap">Opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={backgroundVideoOpacity}
                    onChange={e => onBackgroundVideoOpacityChange(Number(e.target.value))}
                    className="flex-1 accent-brand-secondary"
                  />
                  <span className="text-xs text-gray-500 w-9 text-right tabular-nums">{backgroundVideoOpacity}%</span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500">Add Elements</p>
              <p className="text-xs text-gray-400">Drag to reposition, drag the corners/edges to resize. Applies to the form card too.</p>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {uploading ? 'Uploading…' : '+ Add Image'}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleFileChange} />
              <button
                type="button"
                disabled={uploadingVideo}
                onClick={() => videoFileRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                {uploadingVideo ? 'Uploading…' : '+ Add Video'}
              </button>
              <input ref={videoFileRef} type="file" accept="video/*" className="hidden" onChange={handleVideoFileChange} />
              <button
                type="button"
                onClick={onAddText}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                + Add Text
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
