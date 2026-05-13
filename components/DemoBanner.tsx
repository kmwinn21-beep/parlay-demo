'use client';

export function DemoBanner() {
  const ctaUrl = process.env.NEXT_PUBLIC_DEMO_CTA_URL ?? 'https://useparlay.app';
  return (
    <div className="w-full bg-brand-secondary text-white text-center text-sm py-2 px-4 flex items-center justify-center gap-3 flex-shrink-0 z-50">
      <span>
        👋 You&apos;re exploring a live demo — data resets periodically.{' '}
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          Start Free Trial →
        </a>
      </span>
    </div>
  );
}
