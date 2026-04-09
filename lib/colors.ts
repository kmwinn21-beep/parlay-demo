/**
 * Shared color system for config option color-coding.
 * Colors are stored as simple keys (e.g. "blue", "red") in the DB
 * and mapped to Tailwind classes / hex values here.
 */

export interface ColorPreset {
  key: string;
  label: string;
  /** Hex color for charts (Recharts) */
  hex: string;
  /** Badge style: light bg + colored text (for table badges) */
  badgeClass: string;
  /** Pill style: solid bg + white/contrast text (for detail-page pills) */
  pillClass: string;
  /** Dot preview swatch color */
  swatch: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  {
    key: 'blue',
    label: 'Blue',
    hex: '#1B76BC',
    swatch: '#1B76BC',
    badgeClass: 'bg-blue-100 text-blue-800 border border-blue-300',
    pillClass: 'bg-blue-600 text-white border border-blue-700', // CHANGE THIS
  },
  {
    key: 'dark-blue',
    label: 'Dark Blue',
    hex: '#0B3C62',
    swatch: '#0B3C62',
    badgeClass: 'bg-blue-900/10 text-blue-900 border border-blue-800/30',
    pillClass: 'bg-procare-dark-blue text-white border border-procare-dark-blue', // CHANGE THIS
  },
  {
    key: 'red',
    label: 'Red',
    hex: '#dc2626',
    swatch: '#dc2626',
    badgeClass: 'bg-red-100 text-red-700 border border-red-300',
    pillClass: 'bg-red-500 text-white border border-red-600', // CHANGE THIS
  },
  {
    key: 'green',
    label: 'Green',
    hex: '#16a34a',
    swatch: '#16a34a',
    badgeClass: 'bg-green-100 text-green-700 border border-green-300',
    pillClass: 'bg-green-500 text-white border border-green-600', // CHANGE THIS
  },
  {
    key: 'yellow',
    label: 'Yellow',
    hex: '#FFCB3F',
    swatch: '#eab308',
    badgeClass: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    pillClass: 'bg-yellow-400 text-yellow-900 border border-yellow-500', // CHANGE THIS
  },
  {
    key: 'orange',
    label: 'Orange',
    hex: '#ea580c',
    swatch: '#ea580c',
    badgeClass: 'bg-orange-100 text-orange-700 border border-orange-300',
    pillClass: 'bg-orange-500 text-white border border-orange-600', // CHANGE THIS
  },
  {
    key: 'purple',
    label: 'Purple',
    hex: '#7c3aed',
    swatch: '#7c3aed',
    badgeClass: 'bg-purple-100 text-purple-700 border border-purple-300',
    pillClass: 'bg-purple-500 text-white border border-purple-600', // CHANGE THIS
  },
  {
    key: 'pink',
    label: 'Pink',
    hex: '#db2777',
    swatch: '#db2777',
    badgeClass: 'bg-pink-100 text-pink-700 border border-pink-300',
    pillClass: 'bg-pink-500 text-white border border-pink-600', // CHANGE THIS
  },
  {
    key: 'teal',
    label: 'Teal',
    hex: '#0d9488',
    swatch: '#0d9488',
    badgeClass: 'bg-teal-100 text-teal-700 border border-teal-300',
    pillClass: 'bg-teal-500 text-white border border-teal-600', // CHANGE THIS
  },
  {
    key: 'gray',
    label: 'Gray',
    hex: '#6b7280',
    swatch: '#6b7280',
    badgeClass: 'bg-gray-100 text-gray-600 border border-gray-300',
    pillClass: 'bg-gray-200 text-gray-700 border border-gray-300', // CHANGE THIS
  },
  {
    key: 'dark',
    label: 'Dark',
    hex: '#1f2937',
    swatch: '#1f2937',
    badgeClass: 'bg-gray-800 text-white border border-gray-800',
    pillClass: 'bg-gray-900 text-white border border-gray-800', // CHANGE THIS
  },
];

const PRESET_MAP = new Map(COLOR_PRESETS.map(p => [p.key, p]));

/** Default fallback preset (gray) */
const FALLBACK: ColorPreset = COLOR_PRESETS.find(p => p.key === 'gray')!;

export function getPreset(colorKey: string | null | undefined): ColorPreset {
  if (!colorKey) return FALLBACK;
  return PRESET_MAP.get(colorKey) ?? FALLBACK;
}

/**
 * Color map type: maps option value → color key from the DB.
 * Built from config_options rows.
 */
export type ColorMap = Record<string, string | null>;

/** Build a color map from config option rows */
export function buildColorMap(options: Array<{ value: string; color: string | null }>): ColorMap {
  const map: ColorMap = {};
  for (const opt of options) {
    map[opt.value] = opt.color;
  }
  return map;
}

/** Get badge class for a value, using its color from the map */
export function getBadgeClass(value: string | undefined, colorMap: ColorMap): string {
  if (!value) return `inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${FALLBACK.badgeClass}`;
  const preset = getPreset(colorMap[value]);
  return `inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${preset.badgeClass}`;
}

/** Get pill class for a value (solid bg, used on detail pages) */
export function getPillClass(value: string | undefined, colorMap: ColorMap): string {
  if (!value) return `inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${FALLBACK.pillClass}`;
  const preset = getPreset(colorMap[value]);
  return `inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${preset.pillClass}`
}

/** Get hex color for a value (used in charts) */
export function getHex(value: string | undefined, colorMap: ColorMap): string {
  if (!value) return FALLBACK.hex;
  return getPreset(colorMap[value]).hex;
}
