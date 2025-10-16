export type PlanTier = 'starter' | 'pro' | 'enterprise';

export interface IssueCredentialRequest {
  userId: string;
  provider: string;
  planTier: PlanTier;
  scopes?: readonly string[];
  ttlMs?: number;
  metadata?: Record<string, unknown>;
}

export interface IssueCredentialResult {
  token: string;
  expiresAt: number;
  providerReference?: string;
  metadata?: Record<string, unknown>;
}

export interface RevokeCredentialRequest {
  userId: string;
  provider: string;
  credentialId: string;
  reason?: string;
}

export interface ProvisionedCredentialRecord {
  id: string;
  userId: string;
  provider: string;
  tokenHash: string;
  salt: string;
  scopes: readonly string[];
  planTier: PlanTier;
  issuedAt: number;
  expiresAt: number;
  status: 'active' | 'revoked';
  providerReference?: string;
  metadata?: Record<string, unknown>;
  lastRotatedAt?: number;
}

export interface ProvisioningProvider {
  readonly provider: string;
  issueCredential(request: IssueCredentialRequest): Promise<IssueCredentialResult>;
  revokeCredential(request: RevokeCredentialRequest): Promise<void>;
}

export interface ProvisioningStore {
  save(record: ProvisionedCredentialRecord): Promise<void>;
  findActive(userId: string, provider: string): Promise<ProvisionedCredentialRecord | null>;
  markRevoked(credentialId: string): Promise<void>;
  list(): Promise<ProvisionedCredentialRecord[]>;
  recordUsage?(entry: Omit<UsageRecord, 'id'> & { id?: string }): Promise<UsageRecord>;
  listUsage?(userId: string): Promise<UsageRecord[]>;
}

export interface ProvisioningClock {
  now(): number;
}

export interface ProvisioningTokenCache {
  store(credentialId: string, token: string, expiresAt: number): Promise<void> | void;
  resolve(credentialId: string): string | null;
  delete(credentialId: string): Promise<void> | void;
}

export interface UsageRecord {
  id: string;
  userId: string;
  provider: string;
  tokensUsed: number;
  costMinorUnits: number;
  recordedAt: number;
}
