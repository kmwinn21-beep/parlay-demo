/**
 * What a page shows somebody whose role does not reach it.
 *
 * A panel rather than a redirect. Program Intelligence already did this and
 * Calendar Intelligence bounced to the dashboard instead, which reads as the
 * link being broken — the reader clicked something, arrived nowhere, and has
 * no way to know whether to ask for access or file a bug.
 *
 * Named so the reader can repeat it to whoever administers the account.
 */
export function NoAccessPanel({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
      <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <div>
        <p className="text-sm text-gray-500">You don&apos;t have access to {feature}.</p>
        <p className="text-xs text-gray-400 mt-1">
          An administrator can grant this under Admin Settings → Role Scope.
        </p>
      </div>
    </div>
  );
}
