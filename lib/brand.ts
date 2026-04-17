export const BRAND_COLOR_DEFAULTS = {
  brand_dark_blue:   '#0B3C62',
  brand_bright_blue: '#1B76BC',
  brand_beige:       '#E7DED9',
  brand_gold:        '#FFCB3F',
} as const;

export type BrandColorKey = keyof typeof BRAND_COLOR_DEFAULTS;

export const BRAND_CSS_VARS: Record<BrandColorKey, string> = {
  brand_dark_blue:   '--procare-dark-blue-rgb',
  brand_bright_blue: '--procare-bright-blue-rgb',
  brand_beige:       '--procare-beige-rgb',
  brand_gold:        '--procare-gold-rgb',
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
