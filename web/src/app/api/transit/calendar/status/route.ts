import { NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { getCalendarTokenStore } from '@/lib/transit/calendarTokenStore';

export async function GET(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return NextResponse.json({ connected: false });
  }

  try {
    const store = getCalendarTokenStore();
    const tokens = await store.get(identity.userId);
    if (!tokens) {
      return NextResponse.json({ connected: false });
    }
    return NextResponse.json({
      connected: true,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });
  } catch (error) {
    console.error('Failed to resolve calendar connection status', error);
    return NextResponse.json({ connected: false });
  }
}
