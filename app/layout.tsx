import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { ToastProvider } from '@/components/Toast';
import { db, dbReady } from '@/lib/db';
import { BRAND_COLOR_DEFAULTS, BRAND_CSS_VARS, hexToRgbChannels, type BrandColorKey } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Senior Housing Conference Hub | Procare HR',
  description: 'Track and manage conference attendees for senior housing industry events.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Poppins:wght@300;400;500;600;700&display=swap"
        />
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
