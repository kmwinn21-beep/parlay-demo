import Link from 'next/link';
import Image from 'next/image';

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-procare-dark-blue flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo-white.png" alt="Procare HR" width={160} height={48} className="object-contain mb-2" />
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-procare-dark-blue font-serif mb-2">Access Denied</h1>
          <p className="text-sm text-gray-500 mb-6">
            This area requires administrator access. Contact your Procare HR administrator to request elevated permissions.
          </p>
          <Link
            href="/"
            className="inline-block w-full py-3 bg-procare-bright-blue text-white rounded-lg font-semibold text-sm hover:bg-procare-dark-blue transition-colors text-center"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
