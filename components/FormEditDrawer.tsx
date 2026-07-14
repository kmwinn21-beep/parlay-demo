'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';

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
  onAddImage: (url: string) => void;
  onAddText: () => void;
}

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
  onAddImage,
  onAddText,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/conference-forms/${formId}/upload-image`, { method: 'POST', body });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      onAddImage(url);
    } catch {
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
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

      {/* Left-sliding drawer */}
      {isEditMode && (
        <div className="fixed inset-y-0 left-0 z-[10000] w-full sm:w-[340px] bg-white shadow-2xl overflow-y-auto animate-[slideInLeft_200ms_ease-out]">
          <style>{'@keyframes slideInLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }'}</style>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-brand-primary font-serif">Edit Form</h3>
            <button type="button" onClick={onToggleEditMode} className="text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
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
