import type { AccountPayload } from './types';

export async function fetchAccount(): Promise<AccountPayload> {
  const response = await fetch('/api/account', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to load account');
  }

  return (await response.json()) as AccountPayload;
}
