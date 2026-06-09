'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function SSOCallbackPage() {
  if (!CLERK_ENABLED) return null;
  return <AuthenticateWithRedirectCallback />;
}
