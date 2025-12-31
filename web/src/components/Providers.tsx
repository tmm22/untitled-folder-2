'use client';

import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

function getClerkPublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (key) {
    return key;
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('[AUTH] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be configured in production');
    return '';
  }

  return 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k';
}

export function Providers({ children }: ProvidersProps) {
  const clerkPublishableKey = getClerkPublishableKey();

  if (!clerkPublishableKey) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Configuration Error</h1>
        <p>Authentication is not configured. Please set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.</p>
      </div>
    );
  }

  return <ClerkProvider publishableKey={clerkPublishableKey}>{children}</ClerkProvider>;
}
