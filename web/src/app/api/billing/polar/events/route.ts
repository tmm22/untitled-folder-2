import { NextResponse } from 'next/server';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { getAccountRepository } from '@/app/api/account/context';
import { getProvisioningOrchestrator, getProvisioningStore } from '@/app/api/provisioning/context';
import { hasProvisioningAccess } from '@/lib/provisioning/access';
import type { AccountPayload } from '@/lib/account/types';
import {
  extractPolarBenefits,
  resolveBillingStatusFromPolar,
  resolvePlanTierFromPolar,
  resolvePolarCurrentPeriodEnd,
  resolvePolarPlanId,
  resolvePremiumExpiryFromPolar,
} from '@/lib/billing/polarMapping';

type PolarSubscription = {
  id?: string;
  status?: string;
  customerId?: string;
  productId?: string;
  currentPeriodEnd?: unknown;
  endsAt?: unknown;
  trialEnd?: unknown;
  metadata?: Record<string, unknown> | null;
  customer?: { externalId?: string | null };
  product?: {
    id?: string;
    benefits?: unknown;
  } | null;
};

type PolarWebhookEvent = {
  id?: string;
  type?: string;
  data?: PolarSubscription;
};

const HANDLED_SUBSCRIPTION_EVENTS = new Set<string>([
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.revoked',
  'subscription.paused',
  'subscription.trialing',
  'subscription.past_due',
]);

type LogLevel = 'info' | 'warn' | 'error';

function emitWebhookLog(level: LogLevel, event: string, context: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'polar_webhook',
    level,
    event,
    ...context,
  };
  const message = JSON.stringify(entry);
  if (level === 'info') {
    console.log(message);
  } else if (level === 'warn') {
    console.warn(message);
  } else {
    console.error(message);
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    const existing = record[key];
    record[key] = existing ? `${existing},${value}` : value;
  });
  return record;
}

function resolveAccountId(subscription: PolarSubscription | undefined): string | null {
  if (!subscription) {
    return null;
  }
  const metadataAccountId =
    typeof subscription.metadata?.accountId === 'string' ? subscription.metadata.accountId : null;
  if (metadataAccountId) {
    return metadataAccountId;
  }
  const customerExternal = subscription.customer?.externalId;
  if (typeof customerExternal === 'string' && customerExternal.trim().length > 0) {
    return customerExternal.trim();
  }
  return null;
}

async function handleProvisioningTransition(
  before: AccountPayload,
  after: AccountPayload,
): Promise<void> {
  const orchestrator = getProvisioningOrchestrator();
  const store = getProvisioningStore();

  const hadAccess = hasProvisioningAccess(before);
  const hasAccess = hasProvisioningAccess(after);

  if (hasAccess && !hadAccess) {
    try {
      await orchestrator.issueCredential({
        userId: after.userId,
        provider: 'openai',
        planTier: after.planTier,
        metadata: {
          source: 'polar-webhook',
          subscriptionId: after.polarSubscriptionId,
        },
      });
    } catch (error) {
      console.error('Failed to issue provisioning credential after Polar activation', error);
    }
    return;
  }

  if (!hasAccess && hadAccess) {
    try {
      const credentials = await store.list();
      const relevant = credentials.filter(
        (record) => record.userId === before.userId && record.status === 'active',
      );
      await Promise.all(
        relevant.map((record) =>
          orchestrator
            .revokeCredential({
              userId: record.userId,
              provider: record.provider,
              credentialId: record.id,
              reason: 'billing_status_changed',
            })
            .catch((error) => {
              console.error('Failed to revoke provisioning credential after Polar downgrade', {
                error,
                credentialId: record.id,
              });
            }),
        ),
      );
    } catch (error) {
      console.error('Failed to enumerate provisioning credentials for Polar downgrade', error);
    }
  }
}

async function handleSubscriptionEvent(event: PolarWebhookEvent): Promise<void> {
  const subscription = event.data;
  if (!subscription) {
    emitWebhookLog('warn', 'missing_subscription_payload', {
      eventId: event.id ?? null,
    });
    return;
  }

  const accountId = resolveAccountId(subscription);
  if (!accountId) {
    emitWebhookLog('warn', 'missing_account_id', {
      eventId: event.id ?? null,
      subscriptionId: subscription.id ?? null,
    });
    return;
  }

  const repository = getAccountRepository();
  const previous = await repository.getOrCreate(accountId);
  if (previous.polarLastEventId && previous.polarLastEventId === event.id) {
    emitWebhookLog('info', 'duplicate_event_skipped', {
      eventId: event.id,
      userId: accountId,
    });
    return;
  }

  const metadataPlanTier = subscription.metadata?.planTier;
  const planId = resolvePolarPlanId(subscription);
  let planTier = resolvePlanTierFromPolar({ metadataPlanTier, productId: planId });

  const billingStatus = resolveBillingStatusFromPolar(subscription.status);
  if (billingStatus === 'canceled') {
    planTier = 'free';
  }

  const premiumExpiresAt = resolvePremiumExpiryFromPolar(subscription);
  const polarCurrentPeriodEnd = resolvePolarCurrentPeriodEnd(subscription);
  const polarBenefits = extractPolarBenefits(subscription.product?.benefits);

  const updated = await repository.updateAccount({
    userId: accountId,
    planTier,
    billingStatus,
    premiumExpiresAt,
    polarCustomerId: subscription.customerId ?? previous.polarCustomerId,
    polarSubscriptionId: subscription.id ?? previous.polarSubscriptionId,
    polarPlanId: planId ?? previous.polarPlanId,
    polarCurrentPeriodEnd: polarCurrentPeriodEnd ?? previous.polarCurrentPeriodEnd,
    polarLastEventId: event.id,
    polarBenefits: polarBenefits ?? previous.polarBenefits,
  });

  emitWebhookLog('info', 'subscription_processed', {
    eventId: event.id,
    userId: accountId,
    newPlanTier: updated.planTier,
    billingStatus: updated.billingStatus,
  });

  await handleProvisioningTransition(previous, updated);
}

export async function POST(request: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET?.trim();
  if (!secret) {
    emitWebhookLog('error', 'missing_webhook_secret', {});
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let rawBody: Buffer;
  try {
    rawBody = Buffer.from(await request.arrayBuffer());
  } catch (error) {
    emitWebhookLog('error', 'payload_read_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  let event: PolarWebhookEvent;
  try {
    const validated = validateEvent(rawBody, headersToObject(request.headers), secret);
    event = validated as PolarWebhookEvent;
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      emitWebhookLog('warn', 'signature_validation_failed', {
        reason: error.message,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    emitWebhookLog('error', 'event_validation_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Webhook validation error' }, { status: 500 });
  }

  if (!event?.type) {
    emitWebhookLog('warn', 'event_missing_type', {});
    return NextResponse.json({ status: 'ignored' }, { status: 202 });
  }

  if (HANDLED_SUBSCRIPTION_EVENTS.has(event.type)) {
    await handleSubscriptionEvent(event);
    return NextResponse.json({ status: 'accepted' }, { status: 202 });
  }

  return NextResponse.json({ status: 'ignored' }, { status: 202 });
}
