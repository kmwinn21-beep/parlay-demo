'use client';

export function TargetBtn({
  isTarget,
  onClick,
  size = 'sm',
}: {
  isTarget: boolean;
  onClick: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(e); }}
      title={isTarget ? 'Remove target' : 'Mark as target'}
      className={`flex-shrink-0 transition-colors rounded ${
        isTarget ? 'text-red-500 hover:text-red-600' : 'text-gray-300 hover:text-gray-500'
      }`}
    >
      <svg
        className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    </button>
  );
}
