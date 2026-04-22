'use client';
import { useEffect, useState } from 'react';

export interface LogoConfig {
  logoWhiteUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  logoSidebarUrl: string;
}

const DEFAULTS: LogoConfig = {
  logoWhiteUrl: '/logo-white.png',
  logoDarkUrl: '/logo-white.png',
  faviconUrl: '',
  logoSidebarUrl: '',
};

let _cache: LogoConfig | null = null;
let _pending: Promise<LogoConfig> | undefined;

export function invalidateLogoConfig() {
  _cache = null;
  _pending = undefined;
}

async function fetchLogoConfig(): Promise<LogoConfig> {
  try {
    const res = await fetch('/api/logo-config', { cache: 'no-store' });
    if (!res.ok) return DEFAULTS;
    const data = await res.json() as Partial<LogoConfig>;
    return {
      logoWhiteUrl: data.logoWhiteUrl || DEFAULTS.logoWhiteUrl,
      logoDarkUrl: data.logoDarkUrl || DEFAULTS.logoDarkUrl,
      faviconUrl: data.faviconUrl || DEFAULTS.faviconUrl,
      logoSidebarUrl: data.logoSidebarUrl || DEFAULTS.logoSidebarUrl,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useLogoConfig(): LogoConfig {
  const [config, setConfig] = useState<LogoConfig>(_cache ?? DEFAULTS);

  useEffect(() => {
    if (_cache !== null) { setConfig(_cache); return; }
    if (!_pending) {
      _pending = fetchLogoConfig().then(c => { _cache = c; _pending = undefined; return c; });
    }
    _pending.then(c => setConfig(c));
  }, []);

  return config;
}
