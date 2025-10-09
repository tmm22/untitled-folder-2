'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useAccountStore } from '@/modules/account/store';
import { syncAuthenticatedUser } from '@/lib/auth/client';

export function AccountBootstrapper() {
  const { isLoaded, isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const normalizedUserId = isSignedIn ? userId ?? null : null;
    if (
      lastBootstrappedUserId !== undefined &&
      lastBootstrappedUserId === normalizedUserId &&
      lastBootstrappedSignedIn === isSignedIn
    ) {
      return;
    }

    lastBootstrappedUserId = normalizedUserId;
    lastBootstrappedSignedIn = isSignedIn;

    const accountActions = useAccountStore.getState().actions;

    if (isSignedIn && normalizedUserId) {
      void syncAuthenticatedUser().catch((error) => {
        console.error('Failed to synchronize authenticated user', error);
      });
      void accountActions.initialize(normalizedUserId).catch((error) => {
        console.error('Failed to hydrate account store for authenticated user', error);
      });
    } else {
      void accountActions.initialize(undefined).catch((error) => {
        console.error('Failed to hydrate account store for guest user', error);
      });
    }
  }, [isLoaded, isSignedIn, userId]);

  return null;
}

let lastBootstrappedUserId: string | null | undefined = undefined;
let lastBootstrappedSignedIn: boolean | null = null;

export function __dangerous__resetAccountBootstrapper() {
  lastBootstrappedUserId = undefined;
  lastBootstrappedSignedIn = null;
}
