import type { FunctionReference } from 'convex/server';
import { fetchMutation, fetchQuery, type NextjsOptions } from 'convex/nextjs';
import { api } from '../../../../convex/_generated/api';
import { buildConvexClientOptions } from '../../convex/client';
import type {
  ProvisionedCredentialRecord,
  ProvisioningStore,
  UsageRecord,
} from '../types';

interface ConvexProvisioningStoreOptions {
  baseUrl: string;
  authToken: string;
  authScheme?: string;
}

export class ConvexProvisioningStore implements ProvisioningStore {
  private readonly clientOptions: NextjsOptions;

  constructor(options: ConvexProvisioningStoreOptions) {
    this.clientOptions = buildConvexClientOptions({
      baseUrl: options.baseUrl,
      authToken: options.authToken,
      authScheme: options.authScheme,
    });
  }

  private wrapError(error: unknown): Error {
    if (error instanceof Error) {
      const wrapped = new Error(`Convex provisioning request failed: ${error.message}`);
      (wrapped as Error & { cause?: unknown }).cause = error;
      return wrapped;
    }
    return new Error(`Convex provisioning request failed: ${String(error)}`);
  }

  private async query<TArgs extends object, TResult>(
    reference: FunctionReference<'query', TArgs, TResult>,
    args: TArgs,
  ): Promise<TResult> {
    try {
      return await fetchQuery(reference, args, this.clientOptions);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  private async mutation<TArgs extends object, TResult>(
    reference: FunctionReference<'mutation', TArgs, TResult>,
    args: TArgs,
  ): Promise<TResult> {
    try {
      return await fetchMutation(reference, args, this.clientOptions);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async save(record: ProvisionedCredentialRecord): Promise<void> {
    await this.mutation(api.provisioning.saveCredential, { record });
  }

  async findActive(userId: string, provider: string): Promise<ProvisionedCredentialRecord | null> {
    const result = await this.query(api.provisioning.findActiveCredential, {
      userId,
      provider,
    });
    return result.credential;
  }

  async markRevoked(credentialId: string): Promise<void> {
    await this.mutation(api.provisioning.markCredentialRevoked, { credentialId });
  }

  async list(): Promise<ProvisionedCredentialRecord[]> {
    const result = await this.query(api.provisioning.listCredentials, {});
    return result.credentials ?? [];
  }

  async recordUsage(entry: Omit<UsageRecord, 'id'> & { id?: string }): Promise<UsageRecord> {
    const result = await this.mutation(api.provisioning.recordUsage, { entry });
    return result.usage;
  }

  async listUsage(userId: string): Promise<UsageRecord[]> {
    const result = await this.query(api.provisioning.listUsage, { userId });
    return result.usage ?? [];
  }
}
