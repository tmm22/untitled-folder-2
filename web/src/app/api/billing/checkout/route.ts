import { NextResponse } from 'next/server';
import { getAccountRepository } from '@/app/api/account/context';

export async function POST(request: Request) {
  const userId = request.headers.get('x-account-id');
  if (!userId) {
    return NextResponse.json({ error: 'Missing account identifier' }, { status: 400 });
  }

  const repository = getAccountRepository();
  const now = Date.now();
  const trialDays = Number(process.env.PREMIUM_TRIAL_DAYS ?? '14');
  const payload = await repository.updateAccount({
    userId,
    planTier: 'starter',
    billingStatus: trialDays > 0 ? 'trial' : 'active',
    premiumExpiresAt: trialDays > 0 ? now + trialDays * 24 * 60 * 60 * 1000 : undefined,
  });

  return NextResponse.json({
    account: payload,
    checkoutUrl: 'https://billing.example.com/checkout',
    message: trialDays > 0 ? `Trial active until ${new Date(payload.premiumExpiresAt ?? 0).toISOString()}` : 'Subscription active',
  });
}
