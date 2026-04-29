'use client';

import { useRef } from 'react';
import { Editor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { Color } from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';

// ─── Font Size Extension ───────────────────────────────────────────────────────

export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types as string[],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.fontSize || null,
          renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.fontSize) return {};
            return { style: `font-size: ${attributes.fontSize}` };
          },
        },
      },
    }];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addCommands(): Record<string, any> {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFontSize: (fontSize: string) => ({ chain }: { chain: any }) =>
        chain().setMark('textStyle', { fontSize }).run(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unsetFontSize: () => ({ chain }: { chain: any }) =>
        chain().setMark('textStyle', { fontSize: null }).run(),
    };
  },
});

// ─── Constants ────────────────────────────────────────────────────────────────

export const FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
];

export const FONT_SIZES = ['8px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px'];

// ─── Extension Factory ────────────────────────────────────────────────────────

export function getEditorExtensions({ withImage = false }: { withImage?: boolean } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exts: any[] = [
    StarterKit,
    Underline,
    Link.configure({ openOnClick: false }),
    TextStyle,
    FontFamily,
    Color,
    FontSize,
  ];
  if (withImage) exts.push(Image.configure({ inline: false, allowBase64: true }));
  return exts;
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarButton({ onClick, active, title, children }: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-brand-secondary text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

interface RichTextToolbarProps {
  editor: Editor | null;
  withImage?: boolean;
}

export function RichTextToolbar({ editor, withImage = false }: RichTextToolbarProps) {
  const colorRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor.chain().focus() as any).setImage({ src }).run();
    };
    reader.readAsDataURL(file);
    if (imageRef.current) imageRef.current.value = '';
  };

  const attrs = editor.getAttributes('textStyle') as Record<string, string>;
  const activeFontFamily = attrs.fontFamily ?? '';
  const activeFontSize = attrs.fontSize ?? '';
  const activeColor = attrs.color ?? '#000000';

  return (
    <div className="flex flex-wrap items-center gap-1 border border-gray-200 border-b-0 rounded-t-lg px-2 py-1.5 bg-gray-50">
      {/* Font Family */}
      <select
        title="Font family"
        value={activeFontFamily}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => {
          if (e.target.value) {
            editor.chain().focus().setFontFamily(e.target.value).run();
          } else {
            editor.chain().focus().unsetFontFamily().run();
          }
        }}
        className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700 h-7"
        style={{ maxWidth: '110px' }}
      >
        <option value="">Font</option>
        {FONT_FAMILIES.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Font Size */}
      <select
        title="Font size"
        value={activeFontSize}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => {
          if (e.target.value) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (editor.chain().focus() as any).setFontSize(e.target.value).run();
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (editor.chain().focus() as any).unsetFontSize().run();
          }
        }}
        className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700 h-7 w-16"
      >
        <option value="">Size</option>
        {FONT_SIZES.map(s => (
          <option key={s} value={s}>{s.replace('px', '')}</option>
        ))}
      </select>

      {/* Font Color */}
      <div className="relative flex items-center">
        <button
          type="button"
          title="Font color"
          onMouseDown={e => { e.preventDefault(); colorRef.current?.click(); }}
          className="flex items-center justify-center w-7 h-7 rounded border border-gray-200 bg-white hover:bg-gray-100 transition-colors"
        >
          <span
            className="text-sm font-bold leading-none select-none"
            style={{ color: activeColor, textDecoration: 'underline', textDecorationColor: activeColor }}
          >
            A
          </span>
        </button>
        <input
          ref={colorRef}
          type="color"
          className="sr-only"
          value={activeColor}
          onChange={e => editor.chain().focus().setColor(e.target.value).run()}
        />
      </div>

      <span className="w-px h-4 bg-gray-200 mx-0.5" />

      <ToolbarButton title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}>
        <span className="underline">U</span>
      </ToolbarButton>

      <span className="w-px h-4 bg-gray-200 mx-0.5" />

      <ToolbarButton title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
        • List
      </ToolbarButton>
      <ToolbarButton title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
        1. List
      </ToolbarButton>

      <span className="w-px h-4 bg-gray-200 mx-0.5" />

      <ToolbarButton
        title="Insert link"
        onClick={() => {
          const url = window.prompt('Enter URL');
          if (!url) return;
          editor.chain().focus().setLink({ href: url }).run();
        }}
        active={editor.isActive('link')}
      >
        Link
      </ToolbarButton>
      {editor.isActive('link') && (
        <ToolbarButton title="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
          Unlink
        </ToolbarButton>
      )}

      {withImage && (
        <>
          <span className="w-px h-4 bg-gray-200 mx-0.5" />
          <button
            type="button"
            title="Insert image"
            onMouseDown={e => { e.preventDefault(); imageRef.current?.click(); }}
            className="px-2 py-1 rounded text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Image
          </button>
          <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </>
      )}
    </div>
  );
}

// ─── Full Editor Component ────────────────────────────────────────────────────

interface RichTextEditorProps {
  editor: Editor | null;
  withImage?: boolean;
  minHeight?: string;
}

export function RichTextEditor({ editor, withImage = false, minHeight = '160px' }: RichTextEditorProps) {
  return (
    <div>
      <RichTextToolbar editor={editor} withImage={withImage} />
      <div className="border border-gray-200 rounded-b-lg overflow-auto" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
