export const BRAND_COLOR_DEFAULTS = {
  brand_dark_blue:   '#0B3C62',
  brand_bright_blue: '#1B76BC',
  brand_beige:       '#E7DED9',
  brand_gold:        '#FFCB3F',
} as const;

export type BrandColorKey = keyof typeof BRAND_COLOR_DEFAULTS;

export const BRAND_CSS_VARS: Record<BrandColorKey, string> = {
  brand_dark_blue:   '--brand-primary-rgb',
  brand_bright_blue: '--brand-secondary-rgb',
  brand_beige:       '--brand-accent-rgb',
  brand_gold:        '--brand-highlight-rgb',
};

export const BRAND_COLOR_META: Record<BrandColorKey, { label: string; description: string }> = {
  brand_dark_blue:   { label: 'Primary Dark',  description: 'Headings, navigation, secondary button borders' },
  brand_bright_blue: { label: 'Primary Blue',  description: 'Buttons, links, active states, focus rings' },
  brand_beige:       { label: 'Accent Beige',  description: 'Secondary button hover, subtle fill backgrounds' },
  brand_gold:        { label: 'Accent Gold',   description: 'Gold buttons and highlight accents' },
};

export function hexToRgbChannels(hex: string): string {
  const c = hex.replace(/^#/, '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '';
  return `${r} ${g} ${b}`;
}

export interface FontOption {
  key: string;
  label: string;
  headingFamily: string;
  bodyFamily: string;
  googleFontsParam: string;
  previewHeading: string;
  previewBody: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    key: 'default',
    label: 'Default',
    headingFamily: '"DM Serif Display"',
    bodyFamily: '"Poppins"',
    googleFontsParam: 'DM+Serif+Display:ital@0;1&family=Poppins:wght@300;400;500;600;700',
    previewHeading: 'DM Serif Display',
    previewBody: 'Poppins',
  },
  {
    key: 'modern',
    label: 'Modern',
    headingFamily: '"Inter"',
    bodyFamily: '"Inter"',
    googleFontsParam: 'Inter:wght@300;400;500;600;700;800',
    previewHeading: 'Inter',
    previewBody: 'Inter',
  },
  {
    key: 'classic',
    label: 'Classic',
    headingFamily: '"Playfair Display"',
    bodyFamily: '"Lato"',
    googleFontsParam: 'Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700',
    previewHeading: 'Playfair Display',
    previewBody: 'Lato',
  },
  {
    key: 'contemporary',
    label: 'Contemporary',
    headingFamily: '"Montserrat"',
    bodyFamily: '"Open Sans"',
    googleFontsParam: 'Montserrat:wght@400;500;600;700;800&family=Open+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700',
    previewHeading: 'Montserrat',
    previewBody: 'Open Sans',
  },
  {
    key: 'elegant',
    label: 'Elegant',
    headingFamily: '"Raleway"',
    bodyFamily: '"Source Sans 3"',
    googleFontsParam: 'Raleway:wght@400;500;600;700;800&family=Source+Sans+3:wght@300;400;500;600;700',
    previewHeading: 'Raleway',
    previewBody: 'Source Sans 3',
  },
];

export const DEFAULT_FONT_KEY = 'default';
