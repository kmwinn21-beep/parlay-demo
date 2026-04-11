'use client';

import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto text-center py-16 px-4">
      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-procare-dark-blue font-serif mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={reset} className="btn-primary text-sm">
          Try again
        </button>
        <Link href="/" className="btn-secondary text-sm">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
