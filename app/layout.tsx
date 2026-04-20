import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { ToastProvider } from '@/components/Toast';
import { db, dbReady } from '@/lib/db';
import { BRAND_COLOR_DEFAULTS, BRAND_CSS_VARS, hexToRgbChannels, FONT_OPTIONS, DEFAULT_FONT_KEY, type BrandColorKey } from '@/lib/brand';

const DEFAULT_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';

async function getAppName(): Promise<string> {
  try {
    await dbReady;
    const row = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'app_name'", args: [] });
    const name = row.rows[0] ? String(row.rows[0].value).trim() : '';
    return name || DEFAULT_APP_NAME;
  } catch {
    return DEFAULT_APP_NAME;
  }
}

async function getFaviconUrl(): Promise<string> {
  try {
    await dbReady;
    const row = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'favicon_url'", args: [] });
    return row.rows[0] ? String(row.rows[0].value).trim() : '';
  } catch {
    return '';
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const [appName, faviconUrl] = await Promise.all([getAppName(), getFaviconUrl()]);
  return {
    title: appName,
    description: `Track and manage conference attendees — ${appName}.`,
    ...(faviconUrl ? { icons: { icon: faviconUrl } } : {}),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

async function getFontKey(): Promise<string> {
  try {
    await dbReady;
    const row = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'font_key'", args: [] });
    return row.rows[0] ? String(row.rows[0].value).trim() : DEFAULT_FONT_KEY;
  } catch {
    return DEFAULT_FONT_KEY;
  }
}

async function FontStyles() {
  const fontKey = await getFontKey();
  const font = FONT_OPTIONS.find(f => f.key === fontKey) ?? FONT_OPTIONS[0];
  const vars = `:root{--font-heading:${font.headingFamily};--font-body:${font.bodyFamily}}`;
  return (
    <>
      <link
        rel="stylesheet"
        href={`https://fonts.googleapis.com/css2?family=${font.googleFontsParam}&display=swap`}
      />
      {font.key !== DEFAULT_FONT_KEY && (
        <style dangerouslySetInnerHTML={{ __html: vars }} />
      )}
    </>
  );
}

async function BrandStyles() {
  try {
    await dbReady;
    const rows = await db.execute({
      sql: "SELECT key, value FROM site_settings WHERE key LIKE 'brand_%'",
      args: [],
    });
    const saved: Record<string, string> = {};
    for (const row of rows.rows) saved[String(row.key)] = String(row.value);

    const overrides: string[] = [];
    for (const key of Object.keys(BRAND_COLOR_DEFAULTS) as BrandColorKey[]) {
      const hex = saved[key];
      if (hex && hex !== BRAND_COLOR_DEFAULTS[key]) {
        const channels = hexToRgbChannels(hex);
        if (channels) overrides.push(`${BRAND_CSS_VARS[key]}:${channels}`);
      }
    }

    if (overrides.length === 0) return null;
    return <style dangerouslySetInnerHTML={{ __html: `:root{${overrides.join(';')}}` }} />;
  } catch {
    return null;
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <FontStyles />
        <BrandStyles />
      </head>
      <body className="font-sans">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
