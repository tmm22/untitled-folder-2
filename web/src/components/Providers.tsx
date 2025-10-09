'use client';

import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

const DEFAULT_CLERK_PUBLISHABLE_KEY = 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k';

export function Providers({ children }: ProvidersProps) {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? DEFAULT_CLERK_PUBLISHABLE_KEY;

  return <ClerkProvider publishableKey={clerkPublishableKey}>{children}</ClerkProvider>;
}
