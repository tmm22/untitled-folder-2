import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api } from './_generated/api';

const router = httpRouter();

type LogLevel = 'info' | 'warn' | 'error';

function logHttpEvent(level: LogLevel, event: string, context: Record<string, unknown> = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };
  const message = JSON.stringify(payload);
  switch (level) {
    case 'info':
      console.info(message);
      break;
    case 'warn':
      console.warn(message);
      break;
    case 'error':
    default:
      console.error(message);
      break;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error object';
    }
  }
  return String(error);
}

async function executeWithLogging<T>(path: string, action: () => Promise<T>): Promise<T> {
  try {
    const result = await action();
    logHttpEvent('info', 'convex_http_success', { path });
    return result;
  } catch (error) {
    logHttpEvent('error', 'convex_http_failure', { path, error: describeError(error) });
    throw error;
  }
}

function parseAuthorization(request: Request) {
  const header = request.headers.get('authorization')?.trim();
  if (!header) {
    return null;
  }
  const [maybeScheme, ...rest] = header.split(' ');
  const tokenCandidate = rest.join(' ').trim();
  if (!tokenCandidate) {
    return null;
  }
  return {
    scheme: maybeScheme,
    token: tokenCandidate,
  };
}

function requireAdmin(request: Request) {
  const allowedTokens = [process.env.CONVEX_DEPLOYMENT_KEY, process.env.CONVEX_ADMIN_KEY]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (allowedTokens.length === 0) {
    logHttpEvent('error', 'convex_http_missing_admin_token', {});
    throw new Response('Convex admin token not configured', { status: 500 });
  }

  const expectedScheme = process.env.CONVEX_AUTH_SCHEME?.trim()?.toLowerCase() ?? null;

  const isTokenAuthorized = (token: string | undefined | null, scheme?: string | null): boolean => {
    if (!token) {
      return false;
    }

    if (!allowedTokens.includes(token)) {
      return false;
    }

    if (!expectedScheme) {
      // Default to accepting classic Bearer/Deployment schemes when none specified explicitly.
      if (!scheme) {
        return true;
      }
      const normalizedScheme = scheme.toLowerCase();
      return normalizedScheme === 'bearer' || normalizedScheme === 'deployment';
    }

    if (!scheme) {
      return false;
    }
    return scheme.toLowerCase() === expectedScheme;
  };

  const parsedAuth = parseAuthorization(request);
  if (isTokenAuthorized(parsedAuth?.token, parsedAuth?.scheme)) {
    return;
  }

  const fallbackToken = request.headers.get('x-convex-admin-key')?.trim();
  if (isTokenAuthorized(fallbackToken)) {
    logHttpEvent('warn', 'convex_http_admin_header_fallback', { path: new URL(request.url).pathname });
    return;
  }

  logHttpEvent('warn', 'convex_http_unauthorized', {
    path: new URL(request.url).pathname,
  });
  throw new Response('Unauthorized', { status: 401 });
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

const updateAccountHandler = httpAction(async (ctx, request) => {
  requireAdmin(request);
  const body = (await request.json()) as any;
  const result = await executeWithLogging('/account/updateAccount', () =>
    ctx.runMutation(api.account.updateAccount, body),
  );
  return json(result);
});

router.route({
  path: '/provisioning/save',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/provisioning/save', () =>
      ctx.runMutation(api.provisioning.saveCredential, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/provisioning/findActive',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/provisioning/findActive', () =>
      ctx.runQuery(api.provisioning.findActiveCredential, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/provisioning/markRevoked',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/provisioning/markRevoked', () =>
      ctx.runMutation(api.provisioning.markCredentialRevoked, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/provisioning/list',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const result = await executeWithLogging('/provisioning/list', () =>
      ctx.runQuery(api.provisioning.listCredentials, {}),
    );
    return json(result);
  }),
});

router.route({
  path: '/provisioning/recordUsage',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/provisioning/recordUsage', () =>
      ctx.runMutation(api.provisioning.recordUsage, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/provisioning/listUsage',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/provisioning/listUsage', () =>
      ctx.runQuery(api.provisioning.listUsage, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/account/getOrCreate',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/account/getOrCreate', () =>
      ctx.runMutation(api.account.getOrCreate, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/account/update',
  method: 'POST',
  handler: updateAccountHandler,
});

router.route({
  path: '/account/updateAccount',
  method: 'POST',
  handler: updateAccountHandler,
});

router.route({
  path: '/account/recordUsage',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/account/recordUsage', () =>
      ctx.runMutation(api.account.recordUsage, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/history/list',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/history/list', () => ctx.runQuery(api.history.list, body));
    return json(result);
  }),
});

router.route({
  path: '/history/record',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/history/record', () =>
      ctx.runMutation(api.history.record, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/history/remove',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/history/remove', () =>
      ctx.runMutation(api.history.remove, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/history/clear',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/history/clear', () =>
      ctx.runMutation(api.history.clear, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/users/ensure',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/users/ensure', () =>
      ctx.runMutation(api.users.ensureUser, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/users/get',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/users/get', () => ctx.runQuery(api.users.getUser, body));
    return json(result);
  }),
});

router.route({
  path: '/session/save',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/session/save', () => ctx.runMutation(api.session.save, body));
    return json(result);
  }),
});

router.route({
  path: '/session/get',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/session/get', () => ctx.runMutation(api.session.get, body));
    return json(result);
  }),
});

router.route({
  path: '/session/delete',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/session/delete', () =>
      ctx.runMutation(api.session.deleteSession, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/session/prune',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/session/prune', () =>
      ctx.runMutation(api.session.prune, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/pipelines/list',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const result = await executeWithLogging('/pipelines/list', () =>
      ctx.runQuery(api.pipelines.list, {}),
    );
    return json(result);
  }),
});

router.route({
  path: '/pipelines/get',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/pipelines/get', () => ctx.runQuery(api.pipelines.get, body));
    return json(result);
  }),
});

router.route({
  path: '/pipelines/findByWebhookSecret',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/pipelines/findByWebhookSecret', () =>
      ctx.runQuery(api.pipelines.findByWebhookSecret, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/pipelines/create',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/pipelines/create', () =>
      ctx.runMutation(api.pipelines.create, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/pipelines/update',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/pipelines/update', () =>
      ctx.runMutation(api.pipelines.update, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/pipelines/delete',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/pipelines/delete', () =>
      ctx.runMutation(api.pipelines.remove, body),
    );
    return json(result);
  }),
});

router.route({
  path: '/pipelines/recordRun',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await executeWithLogging('/pipelines/recordRun', () =>
      ctx.runMutation(api.pipelines.recordRun, body),
    );
    return json(result);
  }),
});

export const __test = {
  requireAdmin,
};

export default router;
