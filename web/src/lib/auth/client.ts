'use client';

interface SyncUserResult {
  user?: {
    clerkId: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
    lastLoginAt?: number;
    updatedAt?: number;
    createdAt?: number;
  };
}

let inFlightSync: Promise<SyncUserResult> | null = null;

export async function syncAuthenticatedUser(): Promise<SyncUserResult> {
  if (inFlightSync) {
    return inFlightSync;
  }

  inFlightSync = (async () => {
    try {
      const response = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Failed to sync authenticated user (${response.status}): ${errorBody}`);
      }

      return (await response.json()) as SyncUserResult;
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

