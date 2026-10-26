'use client';

import { useRef } from 'react';
import { Editor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
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
  addCommands(): Record<string, unknown> {
    return {
      /* eslint-disable */
      setFontSize: (fontSize: string) => ({ chain }: { chain: any }) =>
        chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }: { chain: any }) =>
        chain().setMark('textStyle', { fontSize: null }).run(),
      /* eslint-enable */
    };
  },
});


// ─── Block Layout: alignment and indent ───────────────────────────────────────

/** How far one press of Indent moves a line. */
export const INDENT_STEP = 24;
/** As far in as a line can go — eight steps is most of a 280px text element. */
export const MAX_INDENT = 8;

/**
 * Where a line sits across the width, and how far in it starts.
 *
 * Both are properties of the BLOCK rather than of the text in it, which is
 * what makes them work the way a word processor's do: the caret sitting in a
 * paragraph is enough to align or indent that paragraph, and a selection
 * spanning three of them does all three. Nothing has to be selected.
 *
 * Written as inline style rather than classes because this HTML is stored and
 * then rendered in three different places — the editor, the form card, and
 * the public page — and a class would have to exist in all of them.
 */
export const BlockLayout = Extension.create({
  name: 'blockLayout',
  addOptions() { return { types: ['paragraph', 'heading'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types as string[],
      attributes: {
        textAlign: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.textAlign || null,
          renderHTML: (attributes: Record<string, unknown>) =>
            (attributes.textAlign ? { style: `text-align: ${attributes.textAlign}` } : {}),
        },
        indent: {
          default: 0,
          parseHTML: (element: HTMLElement) => {
            const px = parseInt(element.style.marginLeft || '0', 10);
            return Number.isFinite(px) && px > 0 ? Math.round(px / INDENT_STEP) : 0;
          },
          // Two attributes, one style: mergeAttributes joins them rather than
          // letting the second overwrite the first, so an indented centred
          // line keeps both.
          renderHTML: (attributes: Record<string, unknown>) => {
            const steps = Number(attributes.indent) || 0;
            return steps > 0 ? { style: `margin-left: ${steps * INDENT_STEP}px` } : {};
          },
        },
      },
    }];
  },
  addCommands(): Record<string, unknown> {
    /* eslint-disable */
    const shift = (by: number) => () => ({ state, chain }: { state: any; chain: any }) => {
      const { from, to } = state.selection;
      let c = chain();
      // Every block the selection touches, not just the one the caret is in.
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (!(this.options.types as string[]).includes(node.type.name)) return;
        const next = Math.min(MAX_INDENT, Math.max(0, (node.attrs.indent || 0) + by));
        c = c.command(({ tr }: { tr: any }) => {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
          return true;
        });
      });
      return c.run();
    };
    return {
      setTextAlign: (align: string | null) => ({ commands }: { commands: any }) =>
        (this.options.types as string[]).every(type => commands.updateAttributes(type, { textAlign: align })),
      indentBlock: shift(1),
      outdentBlock: shift(-1),
    };
    /* eslint-enable */
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
  /* eslint-disable */
  const exts: any[] = [
    // StarterKit (v3) now bundles Link/Underline itself — disable its copies so our own
    // configured instances below don't collide with them (tiptap logs a duplicate-extension
    // warning otherwise).
    StarterKit.configure({ link: false, underline: false }),
    Underline,
    Link.configure({ openOnClick: false }),
    TextStyle,
    FontFamily,
    Color,
    FontSize,
    BlockLayout,
  ];
  /* eslint-enable */
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
      /* eslint-disable-next-line */
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
          /* eslint-disable-next-line */
          const c = editor.chain().focus() as any;
          if (e.target.value) {
            c.setFontSize(e.target.value).run();
          } else {
            c.unsetFontSize().run();
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

      {/* Alignment and indent, drawn rather than named: three words would
          take more of this toolbar than the formatting that comes before
          them, and the icons are the ones every editor uses. Each acts on
          whatever blocks the selection touches, with nothing selected
          meaning the line the caret is in. */}
      {([
        ['left', 'Align left', ['M4 6h16', 'M4 12h10', 'M4 18h14']],
        ['center', 'Align centre', ['M4 6h16', 'M7 12h10', 'M5 18h14']],
        ['right', 'Align right', ['M4 6h16', 'M10 12h10', 'M6 18h14']],
      ] as const).map(([align, label, paths]) => (
        <ToolbarButton
          key={align}
          title={label}
          /* eslint-disable-next-line */
          onClick={() => (editor.chain().focus() as any)
            .setTextAlign(editor.isActive({ textAlign: align }) ? null : align).run()}
          active={editor.isActive({ textAlign: align })}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            {paths.map(d => <path key={d} strokeLinecap="round" d={d} />)}
          </svg>
        </ToolbarButton>
      ))}
      {/* eslint-disable-next-line */}
      <ToolbarButton title="Indent" onClick={() => (editor.chain().focus() as any).indentBlock().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" d="M11 6h9M11 12h9M11 18h9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 9l3 3-3 3" />
        </svg>
      </ToolbarButton>
      {/* eslint-disable-next-line */}
      <ToolbarButton title="Outdent" onClick={() => (editor.chain().focus() as any).outdentBlock().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" d="M11 6h9M11 12h9M11 18h9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 9l-3 3 3 3" />
        </svg>
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
