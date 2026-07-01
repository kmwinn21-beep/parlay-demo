import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

// Always render dynamically so BrandStyles, FontStyles, and favicon re-query
// the DB on every request instead of serving a stale cached layout segment.
export const dynamic = 'force-dynamic';
import { AppShell } from '@/components/AppShell';
import { ToastProvider } from '@/components/Toast';
import { DemoBanner } from '@/components/DemoBanner';
import { getServerSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { BRAND_COLOR_DEFAULTS, BRAND_CSS_VARS, hexToRgbChannels, FONT_OPTIONS, DEFAULT_FONT_KEY, type BrandColorKey } from '@/lib/brand';
import type { Client } from '@libsql/client';

const DEFAULT_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';

async function getAppName(db: Client): Promise<string> {
  try {
    const row = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'app_name'", args: [] });
    const name = row.rows[0] ? String(row.rows[0].value).trim() : '';
    return name || DEFAULT_APP_NAME;
  } catch {
    return DEFAULT_APP_NAME;
  }
}

async function getFaviconUrl(db: Client): Promise<string> {
  try {
    const row = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'favicon_url'", args: [] });
    return row.rows[0] ? String(row.rows[0].value).trim() : '';
  } catch {
    return '';
  }
}

async function resolveTenantDb(): Promise<Client | null> {
  try {
    const user = await getServerSessionUser();
    return await getDb(user?.accountId);
  } catch {
    // DB unavailable / transient provisioning issue — callers fall back to
    // defaults rather than crashing the root layout over branding metadata.
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const db = await resolveTenantDb();
  const [appName, faviconUrl] = db
    ? await Promise.all([getAppName(db), getFaviconUrl(db)])
    : [DEFAULT_APP_NAME, ''];
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

async function getFontKey(db: Client): Promise<string> {
  try {
    const row = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'font_key'", args: [] });
    return row.rows[0] ? String(row.rows[0].value).trim() : DEFAULT_FONT_KEY;
  } catch {
    return DEFAULT_FONT_KEY;
  }
}

async function FontStyles() {
  const db = await resolveTenantDb();
  const fontKey = db ? await getFontKey(db) : DEFAULT_FONT_KEY;
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
  const db = await resolveTenantDb();
  if (!db) return null;
  try {
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

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <>
      {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && <DemoBanner />}
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </>
  );
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0B3C62" />
        <FontStyles />
        <BrandStyles />
      </head>
      <body className="font-sans">
        {CLERK_ENABLED ? <ClerkProvider>{body}</ClerkProvider> : body}
      </body>
    </html>
  );
}
