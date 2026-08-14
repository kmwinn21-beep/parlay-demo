'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

/**
 * Attendee headshot: the avatar that replaces the initials circle, the
 * crop/resize step used before saving one, and the profile card that opens
 * when an existing photo is clicked.
 */

const OUTPUT_SIZE = 512; // square px written back — keeps stored images small

/* ─── Crop / resize ─────────────────────────────────────────────────────────
 * A fixed circular viewport with the image floating behind it: dragging pans,
 * the slider zooms, and the visible circle is what gets written out. That is
 * the whole interaction, so it needs no cropping library.
 */
export function ImageCropModal({ file, onCancel, onConfirm }: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const FRAME = 260; // on-screen diameter of the crop circle

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!src) return;
    const image = new Image();
    image.onload = () => { setImg(image); setZoom(1); setOffset({ x: 0, y: 0 }); };
    image.onerror = () => toast.error('That image could not be read.');
    image.src = src;
  }, [src]);

  // Scale that makes the image just cover the circle at zoom 1.
  const baseScale = img ? Math.max(FRAME / img.width, FRAME / img.height) : 1;
  const scale = baseScale * zoom;

  const clampOffset = useCallback((next: { x: number; y: number }, s: number) => {
    if (!img) return next;
    const halfW = Math.max(0, (img.width * s - FRAME) / 2);
    const halfH = Math.max(0, (img.height * s - FRAME) / 2);
    return {
      x: Math.min(halfW, Math.max(-halfW, next.x)),
      y: Math.min(halfH, Math.max(-halfH, next.y)),
    };
  }, [img]);

  useEffect(() => { setOffset(o => clampOffset(o, scale)); }, [scale, clampOffset]);

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = { x: clientX, y: clientY, ox: offset.x, oy: offset.y };
  };
  const moveDrag = (clientX: number, clientY: number) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clampOffset({ x: d.ox + (clientX - d.x), y: d.oy + (clientY - d.y) }, scale));
  };
  const endDrag = () => { dragRef.current = null; };

  useEffect(() => {
    const onUp = () => endDrag();
    const onMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  });

  const handleConfirm = () => {
    if (!img) return;
    setSaving(true);
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setSaving(false); return; }
    // Map the on-screen circle onto the output square.
    const ratio = OUTPUT_SIZE / FRAME;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const drawW = img.width * scale * ratio;
    const drawH = img.height * scale * ratio;
    ctx.drawImage(
      img,
      OUTPUT_SIZE / 2 - drawW / 2 + offset.x * ratio,
      OUTPUT_SIZE / 2 - drawH / 2 + offset.y * ratio,
      drawW,
      drawH,
    );
    canvas.toBlob(blob => {
      setSaving(false);
      if (blob) onConfirm(blob);
      else toast.error('Could not process that image.');
    }, 'image/jpeg', 0.85);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-brand-primary font-serif mb-1">Crop photo</h3>
        <p className="text-xs text-gray-400 mb-4">Drag to reposition, and use the slider to zoom.</p>

        <div
          ref={frameRef}
          onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
          onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={e => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={endDrag}
          style={{ width: FRAME, height: FRAME }}
          className="relative mx-auto rounded-full overflow-hidden bg-gray-100 cursor-move touch-none select-none"
        >
          {img && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src ?? ''}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: img.width * scale,
                height: img.height * scale,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                maxWidth: 'none',
              }}
            />
          )}
          <div className="absolute inset-0 rounded-full ring-2 ring-white/70 pointer-events-none" />
        </div>

        <div className="flex items-center gap-2 mt-4">
          <span className="text-xs text-gray-400">Zoom</span>
          <input
            type="range" min={1} max={3} step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 accent-brand-secondary"
          />
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          <button type="button" onClick={handleConfirm} disabled={!img || saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save photo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Read an image off the system clipboard on demand, for a "Paste photo"
 * button. Distinct from handling a paste event: this needs the Clipboard Read
 * permission, a secure context, and browser support (Chromium and Safari —
 * Firefox does not implement it), so the caller gets a thrown reason to show.
 */
export async function readImageFromClipboard(): Promise<File> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
    throw new Error('This browser can\u2019t read the clipboard directly — press \u2318/Ctrl+V instead.');
  }
  let items: ClipboardItem[];
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error('Clipboard access was blocked — allow it, or press \u2318/Ctrl+V instead.');
  }
  for (const item of items) {
    const type = item.types.find(t => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    const ext = type.split('/')[1] || 'png';
    return new File([blob], `pasted.${ext}`, { type });
  }
  throw new Error('No image on the clipboard — copy one first.');
}

/**
 * Asks how to supply a photo. Shown when an avatar with no photo is clicked,
 * offering the same two routes the edit form does.
 */
export function PhotoSourceModal({ name, onUpload, onPaste, onClose }: {
  name: string;
  onUpload: () => void;
  onPaste: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-xs px-6 py-6 text-center">
        <h3 className="text-base font-semibold text-brand-primary font-serif">Add a photo</h3>
        <p className="text-xs text-gray-400 mt-1">for {name}</p>
        <div className="flex flex-col gap-2 mt-5">
          <button type="button" onClick={() => { onClose(); onUpload(); }} className="btn-primary text-sm w-full">
            Upload photo
          </button>
          <button type="button" onClick={() => { onClose(); onPaste(); }} className="btn-secondary text-sm w-full">
            Paste photo
          </button>
        </div>
        <button type="button" onClick={onClose} className="mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Profile card ───────────────────────────────────────────────────────── */
export function AttendeePhotoModal({ name, title, companyName, photoUrl, onClose }: {
  name: string;
  title?: string | null;
  companyName?: string | null;
  photoUrl: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);
  if (!mounted) return null;

  const subtitle = [title, companyName].filter(Boolean).join(' | ');

  return createPortal(
    // Below sm the card drops in from the top; from sm it is a centred modal.
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="attendee-photo-card bg-white rounded-2xl shadow-2xl w-full max-w-sm px-6 py-6 text-center mt-6 sm:mt-0"
      >
        <h3 className="text-lg font-bold text-brand-primary font-serif">{name}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        <div className="mt-5 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={name}
            className="w-56 h-56 rounded-full object-cover border-4 border-white shadow-lg"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Avatar ─────────────────────────────────────────────────────────────── */
export function AttendeeAvatar({
  firstName, lastName, title, companyName, photoUrl, onUploadRequest, onPasteRequest,
  className = 'w-16 h-16 text-2xl',
}: {
  firstName: string;
  lastName: string;
  title?: string | null;
  companyName?: string | null;
  photoUrl?: string | null;
  /** Opens the file picker from the "Add a photo" prompt. */
  onUploadRequest?: () => void;
  /** Reads the clipboard from the "Add a photo" prompt. */
  onPasteRequest?: () => void;
  className?: string;
}) {
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const name = `${firstName} ${lastName}`.trim();

  const handleClick = () => {
    if (photoUrl) { setShowPhoto(true); return; }
    if (!onUploadRequest && !onPasteRequest) return;
    setShowSource(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={photoUrl ? `View ${name}'s photo` : 'Add a photo'}
        className={`${className} rounded-full bg-brand-primary flex items-center justify-center text-white font-bold font-serif flex-shrink-0 overflow-hidden transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-secondary`}
      >
        {photoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
          : <>{firstName[0]}{lastName[0]}</>}
      </button>
      {showPhoto && photoUrl && (
        <AttendeePhotoModal
          name={name}
          title={title}
          companyName={companyName}
          photoUrl={photoUrl}
          onClose={() => setShowPhoto(false)}
        />
      )}
      {showSource && (
        <PhotoSourceModal
          name={name}
          onUpload={() => onUploadRequest?.()}
          onPaste={() => onPasteRequest?.()}
          onClose={() => setShowSource(false)}
        />
      )}
    </>
  );
}
