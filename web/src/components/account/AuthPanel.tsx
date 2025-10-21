'use client';

import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from '@clerk/nextjs';
import { useMemo } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';

function formatUserName(firstName?: string | null, lastName?: string | null, emailAddress?: string | null) {
  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim();
  if (name) {
    return name;
  }
  if (emailAddress) {
    return emailAddress;
  }
  return 'Signed in user';
}

export function AuthPanel() {
  const { user } = useUser();

  const displayName = useMemo(() => {
    return formatUserName(user?.firstName, user?.lastName, user?.primaryEmailAddress?.emailAddress ?? null);
  }, [user?.firstName, user?.lastName, user?.primaryEmailAddress?.emailAddress]);

  return (
    <CollapsibleSection title="Account access" className="text-cocoa-900">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-400">Account access</span>
          <h2 className="text-lg font-semibold text-charcoal-900">Authenticate to sync usage and history</h2>
        </div>
        <div className="flex items-center gap-3">
          <SignedIn>
            <span className="text-sm text-cocoa-600">{displayName}</span>
            <UserButton appearance={{ elements: { userButtonAvatarBox: 'h-8 w-8' } }} />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button
                type="button"
                className="cta-button px-4 py-2 text-sm"
              >
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </header>
      <SignedOut>
        <p className="mt-3 text-sm text-cocoa-600">
          Sign in to unlock managed provisioning, synchronize your preferences, and access your premium usage limits.
        </p>
      </SignedOut>
      <SignedIn>
        <p className="mt-3 text-sm text-cocoa-600">
          You are connected. Usage and billing data are now linked to your Clerk account and stored in Convex.
        </p>
      </SignedIn>
    </CollapsibleSection>
  );
}
