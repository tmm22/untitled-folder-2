import { randomBytes } from 'node:crypto';
import type {
  IssueCredentialRequest,
  IssueCredentialResult,
  ProvisioningProvider,
  RevokeCredentialRequest,
} from '../types';

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

export class OpenAIProvisioningProvider implements ProvisioningProvider {
  readonly provider = 'openai';

  async issueCredential(request: IssueCredentialRequest): Promise<IssueCredentialResult> {
    const masterKey = process.env.OPENAI_API_KEY;
    if (!masterKey) {
      throw new Error('OpenAI provisioning requires OPENAI_API_KEY');
    }

    const pseudoToken = this.deriveScopedToken(masterKey, request.userId);
    const expiresAt = Date.now() + (request.ttlMs ?? DEFAULT_TTL_MS);

    return {
      token: pseudoToken,
      expiresAt,
      metadata: {
        planTier: request.planTier,
        scopes: request.scopes ?? [],
      },
    };
  }

  async revokeCredential(_request: RevokeCredentialRequest): Promise<void> {
    // Real implementation would call the provider API or vault to revoke a sub-key.
    // For now, no-op because tokens are derived and expire automatically.
  }

  private deriveScopedToken(masterKey: string, userId: string): string {
    const nonce = randomBytes(8).toString('hex');
    const suffix = randomBytes(4).toString('hex');
    const material = `${userId}:${nonce}:${suffix}`;
    const digest = randomBytes(16).toString('hex');
    return `tts-proxy-${digest}-${material}`;
  }
}
