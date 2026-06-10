import type { DefaultFunctionArgs, FunctionReference } from 'convex/server';
import { fetchMutation, fetchQuery, type NextjsOptions } from 'convex/nextjs';

/**
 * Typed wrappers for calling internal Convex functions from trusted server
 * code. All Convex functions are registered as internal (never public), so
 * every call must carry deploy-key admin auth via the client options.
 */
export async function fetchInternalQuery<
  TReference extends FunctionReference<'query', 'internal'>,
>(
  reference: TReference,
  args: TReference['_args'],
  options: NextjsOptions,
): Promise<TReference['_returnType']> {
  return (await fetchQuery(
    reference as unknown as FunctionReference<'query', 'public', DefaultFunctionArgs, TReference['_returnType']>,
    args as DefaultFunctionArgs,
    options,
  )) as TReference['_returnType'];
}

export async function fetchInternalMutation<
  TReference extends FunctionReference<'mutation', 'internal'>,
>(
  reference: TReference,
  args: TReference['_args'],
  options: NextjsOptions,
): Promise<TReference['_returnType']> {
  return (await fetchMutation(
    reference as unknown as FunctionReference<'mutation', 'public', DefaultFunctionArgs, TReference['_returnType']>,
    args as DefaultFunctionArgs,
    options,
  )) as TReference['_returnType'];
}
