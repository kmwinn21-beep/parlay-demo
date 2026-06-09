'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

// Clerk redirects here after an OAuth/SSO provider handshake.
// AuthenticateWithRedirectCallback exchanges the callback tokens and
// then redirects to the original after_sign_in_url.
export default function SSOCallbackPage() {
  return <AuthenticateWithRedirectCallback />;
}
