'use client';

import { Toaster } from 'react-hot-toast';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        /*
         * Clear of the status bar.
         *
         * The viewport meta is viewport-fit=cover and the iOS status bar style
         * is black-translucent, so the page starts at the physical top of the
         * screen — a toast at the library's default top: 16px lands under the
         * clock and the Dynamic Island. The offset below drops it to where the
         * header's icon row begins: the same inset plus the same 0.75rem of
         * padding .header-mobile-dark uses, so the two line up.
         *
         * max() keeps the library's 16px anywhere there is no inset — a
         * browser tab, a desktop, an older phone — where env() is 0 and the
         * calc would otherwise pull the toast slightly higher than before.
         */
        containerStyle={{
          top: 'max(16px, calc(env(safe-area-inset-top, 0px) + 0.75rem))',
        }}
        toastOptions={{
          duration: 4000,
          style: {
            background: '#fff',
            color: '#1a1a2e',
            border: '1px solid #e5e7eb',
            borderRadius: '0.75rem',
            padding: '12px 16px',
            fontSize: '0.875rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          },
          success: {
            iconTheme: {
              primary: '#1B76BC',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </>
  );
}
