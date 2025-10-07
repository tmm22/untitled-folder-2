import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api } from './_generated/api';

const router = httpRouter();

function requireAdmin(request: Request) {
  const token = request.headers.get('x-convex-admin-key');
  const allowed = [process.env.CONVEX_DEPLOYMENT_KEY, process.env.CONVEX_ADMIN_KEY]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (!token || !allowed.includes(token)) {
    throw new Response('Unauthorized', { status: 401 });
  }
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

router.route({
  path: '/provisioning/save',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runMutation(api.provisioning.saveCredential, body);
    return json(result);
  }),
});

router.route({
  path: '/provisioning/findActive',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runQuery(api.provisioning.findActiveCredential, body);
    return json(result);
  }),
});

router.route({
  path: '/provisioning/markRevoked',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runMutation(api.provisioning.markCredentialRevoked, body);
    return json(result);
  }),
});

router.route({
  path: '/provisioning/list',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const result = await ctx.runQuery(api.provisioning.listCredentials, {});
    return json(result);
  }),
});

router.route({
  path: '/provisioning/recordUsage',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runMutation(api.provisioning.recordUsage, body);
    return json(result);
  }),
});

router.route({
  path: '/provisioning/listUsage',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runQuery(api.provisioning.listUsage, body);
    return json(result);
  }),
});

router.route({
  path: '/account/getOrCreate',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runMutation(api.account.getOrCreate, body);
    return json(result);
  }),
});

router.route({
  path: '/account/update',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runMutation(api.account.updateAccount, body);
    return json(result);
  }),
});

router.route({
  path: '/account/recordUsage',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runMutation(api.account.recordUsage, body);
    return json(result);
  }),
});

router.route({
  path: '/session/save',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runMutation(api.session.save, body);
    return json(result);
  }),
});

router.route({
  path: '/session/get',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runMutation(api.session.get, body);
    return json(result);
  }),
});

router.route({
  path: '/session/delete',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runMutation(api.session.deleteSession, body);
    return json(result);
  }),
});

router.route({
  path: '/session/prune',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    requireAdmin(request);
    const body = (await request.json()) as any;
    const result = await ctx.runMutation(api.session.prune, body);
    return json(result);
  }),
});

export default router;
