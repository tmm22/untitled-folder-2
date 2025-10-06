import { describe, expect, it } from 'vitest';
import { POST as checkout } from '@/app/api/billing/checkout/route';
import { POST as portal } from '@/app/api/billing/portal/route';

function buildRequest(headers: Record<string, string>) {
  return new Request('http://localhost', { method: 'POST', headers });
}

describe('Billing actions API', () => {
  it('rejects calls without account id', async () => {
    const response = await checkout(new Request('http://localhost', { method: 'POST' }));
    expect(response.status).toBe(400);
  });

  it('returns checkout payload and updates account', async () => {
    const response = await checkout(buildRequest({ 'x-account-id': 'acct-123' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.account.planTier).toBe('starter');
    expect(body.checkoutUrl).toContain('https://');
  });

  it('returns portal payload', async () => {
    const response = await portal(buildRequest({ 'x-account-id': 'acct-123' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.portalUrl).toContain('https://');
  });
});
