import type { ReactNode, HTMLAttributes } from 'react';

/**
 * The tinted, spaced backing a phone's list of records sits on. Run flush
 * against each other with only a hairline between them, records read as one
 * long list rather than as separate things; on their own cards they don't.
 */
export function MobileCardList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-gray-50/50 p-2 space-y-2 ${className}`}>{children}</div>;
}

/**
 * The border one record sits in. Shared by the meetings, attendees and
 * companies tables — and by the meetings kanban columns — so a card looks the
 * same wherever it's read.
 */
export function MobileCard({ children, className = '', ...rest }: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}
