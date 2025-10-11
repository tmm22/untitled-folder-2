import type { DefaultFunctionArgs, FunctionReference } from 'convex/server';
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

  private async query<TArgs extends DefaultFunctionArgs, TResult>(
    reference: FunctionReference<'query', any, TArgs, TResult>,
    args: TArgs,
  ): Promise<TResult> {
    try {
      return (await fetchQuery(
        reference as FunctionReference<'query', any, DefaultFunctionArgs, TResult>,
        args as DefaultFunctionArgs,
        this.clientOptions,
      )) as TResult;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  private async mutation<TArgs extends DefaultFunctionArgs, TResult>(
    reference: FunctionReference<'mutation', any, TArgs, TResult>,
    args: TArgs,
  ): Promise<TResult> {
    try {
      return (await fetchMutation(
        reference as FunctionReference<'mutation', any, DefaultFunctionArgs, TResult>,
        args as DefaultFunctionArgs,
        this.clientOptions,
      )) as TResult;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async save(record: ProvisionedCredentialRecord): Promise<void> {
    await this.mutation(api.provisioning.saveCredential, {
      record: { ...record, scopes: [...record.scopes] } as DefaultFunctionArgs,
    } as DefaultFunctionArgs);
  }

  async findActive(userId: string, provider: string): Promise<ProvisionedCredentialRecord | null> {
    const result = await this.query(api.provisioning.findActiveCredential, {
      userId,
      provider,
    });
    return result.credential as ProvisionedCredentialRecord | null;
  }

  async markRevoked(credentialId: string): Promise<void> {
    await this.mutation(api.provisioning.markCredentialRevoked, { credentialId });
  }

  async list(): Promise<ProvisionedCredentialRecord[]> {
    const result = await this.query(api.provisioning.listCredentials, {});
    return (result.credentials ?? []) as ProvisionedCredentialRecord[];
  }

  async recordUsage(entry: Omit<UsageRecord, 'id'> & { id?: string }): Promise<UsageRecord> {
    const result = await this.mutation(api.provisioning.recordUsage, { entry } as DefaultFunctionArgs);
    return result.usage as UsageRecord;
  }

  async listUsage(userId: string): Promise<UsageRecord[]> {
    const result = await this.query(api.provisioning.listUsage, { userId });
    return (result.usage ?? []) as UsageRecord[];
  }
}
