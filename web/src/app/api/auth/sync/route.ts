import { NextResponse } from 'next/server';
import { getAuth, currentUser } from '@clerk/nextjs/server';
import { fetchMutation } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import { buildConvexClientOptions } from '@/lib/convex/client';
import { resolveConvexAuthConfig } from '@/lib/convexAuth';

interface EnsureUserPayload {
  clerkId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
}

interface EnsureUserResponse {
  user: {
    clerkId: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
    lastLoginAt?: number;
    createdAt?: number;
    updatedAt?: number;
  } | null;
}

function normaliseEmail(email: string | null | undefined): string | undefined {
  const value = email?.trim();
  return value ? value.toLowerCase() : undefined;
}

type ClerkRequest = Parameters<typeof getAuth>[0];

export async function POST(request: Request) {
  const { userId } = getAuth(request as ClerkRequest);

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  const convexAuth = resolveConvexAuthConfig();

  if (!convexUrl || !convexAuth) {
    return NextResponse.json({ user: null, skipped: true });
  }

  const user = await currentUser();

  const payload: EnsureUserPayload = {
    clerkId: userId,
    email: normaliseEmail(user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress),
    firstName: user?.firstName ?? undefined,
    lastName: user?.lastName ?? undefined,
    imageUrl: user?.imageUrl ?? undefined,
  };

  try {
    const response = await fetchMutation(
      api.users.ensureUser,
      payload,
      buildConvexClientOptions({
        baseUrl: convexUrl,
        authToken: convexAuth.token,
        authScheme: convexAuth.scheme,
      }),
    );
    return NextResponse.json(response ?? { user: null });
  } catch (error) {
    const wrapped =
      error instanceof Error ? new Error(`Convex ensureUser request failed: ${error.message}`) : error;
    if (wrapped instanceof Error) {
      (wrapped as Error & { cause?: unknown }).cause = error instanceof Error ? error : undefined;
      console.error('Failed to ensure user in Convex', wrapped);
    } else {
      console.error('Failed to ensure user in Convex', wrapped);
    }
    return NextResponse.json({ error: 'Unable to sync account' }, { status: 502 });
  }
}
