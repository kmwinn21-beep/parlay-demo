'use client';

interface Props {
  companyId: number | null;
  companyName?: string;
  onClose: () => void;
}

export function CompanyDrawer({ companyId, companyName, onClose }: Props) {
  if (companyId === null) return null;

  return (
    <div className="fixed inset-0 z-50">
      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer panel */}
      <div
        className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[90vh] sm:h-auto w-full sm:w-[600px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-none z-50"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{companyName ?? 'Company Record'}</h3>
              <p className="text-xs text-gray-500">Company Record</p>
            </div>
            <a
              href={`/companies/${companyId}`}
              className="text-xs text-brand-secondary hover:underline font-medium flex-shrink-0"
            >
              Go to Company Record →
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Iframe */}
        <iframe
          src={`/companies/${companyId}?embed=true`}
          className="flex-1 w-full border-0"
          title={companyName ?? 'Company Record'}
        />
      </div>
    </div>
  );
}
