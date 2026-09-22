'use client';

import { companySearchUrl, companyWebsiteUrl } from '@/lib/companySearchUrl';

/**
 * The company's site, or the search that finds it.
 *
 * With a website stored this is the globe it has always been. Without one it
 * becomes a magnifying glass pointed at a search for the company's name —
 * because a record added from a badge scan or a spreadsheet usually has a name
 * and nothing else, and the name is enough to go looking with. The button
 * disappearing taught nobody anything.
 *
 * One component for both sizes. The header renders this twice — once in the
 * wide layout and once in the narrow one — and they were already near-identical
 * copies before a branch was added to each of them.
 */
export function CompanyWebsiteButton({ website, name, size = 'sm' }: {
  website: string | null | undefined;
  name: string;
  /** 'md' is the wide header's 32px circle; 'sm' the narrow one's 28px. */
  size?: 'sm' | 'md';
}) {
  const site = companyWebsiteUrl(website);
  const search = site ? null : companySearchUrl(name);
  const href = site ?? search;
  // No name and no website is nothing to point at.
  if (!href) return null;

  const ring = size === 'md' ? 'w-8 h-8' : 'w-7 h-7';
  const icon = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={site ? 'View website' : `Search the web for ${name}`}
      className={`inline-flex items-center justify-center ${ring} rounded-full transition-colors flex-shrink-0 ${
        site ? 'bg-blue-50 hover:bg-blue-100' : 'bg-gray-100 hover:bg-gray-200'
      }`}
    >
      {site ? (
        <svg className={`${icon} text-brand-secondary`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      ) : (
        // Grey rather than blue: this is a guess at where the site might be,
        // not a link somebody recorded.
        <svg className={`${icon} text-gray-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )}
    </a>
  );
}
