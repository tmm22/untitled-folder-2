import { NextResponse } from 'next/server';
import { getAccountRepository } from '@/app/api/account/context';

export async function POST(request: Request) {
  const userId = request.headers.get('x-account-id');
  if (!userId) {
    return NextResponse.json({ error: 'Missing account identifier' }, { status: 400 });
  }

  const repository = getAccountRepository();
  const account = await repository.getOrCreate(userId);

  return NextResponse.json({
    account,
    portalUrl: 'https://billing.example.com/portal',
  });
}
