import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Smart import is not implemented yet in the web app.',
    },
    { status: 501 },
  );
}
