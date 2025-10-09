import { NextResponse } from 'next/server';
import { getAuth, currentUser } from '@clerk/nextjs/server';
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

function buildConvexUrlCandidates(baseUrl: string, path: string): string[] {
  const suffixes = [
    `/api/users/${path}`,
    `/users/${path}`,
    `/api/http/users/${path}`,
    `/http/users/${path}`,
  ];

  return suffixes.map((suffix) => {
    try {
      return new URL(suffix, baseUrl).toString();
    } catch {
      return `${baseUrl.replace(/\/$/, '')}${suffix}`;
    }
  });
}

async function callConvexEnsureUser(
  baseUrl: string,
  authScheme: string,
  authToken: string,
  payload: EnsureUserPayload,
): Promise<EnsureUserResponse | null> {
  const candidates = buildConvexUrlCandidates(baseUrl, 'ensure');
  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `${authScheme} ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Convex ensureUser request failed (${response.status}): ${errorBody}`);
      }

      return (await response.json()) as EnsureUserResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error ensuring user with Convex');
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

export async function POST(request: Request) {
  const { userId } = getAuth(request);

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
    const response = await callConvexEnsureUser(convexUrl, convexAuth.scheme, convexAuth.token, payload);
    return NextResponse.json(response ?? { user: null });
  } catch (error) {
    console.error('Failed to ensure user in Convex', error);
    return NextResponse.json({ error: 'Unable to sync account' }, { status: 502 });
  }
}
