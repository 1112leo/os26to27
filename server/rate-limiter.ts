// Pages does not support native rate-limit bindings. This private service exposes only the gate.
export default {
  async fetch(request: Request, env: { LOGIN_LIMITER: RateLimit; SUBMIT_LIMITER: RateLimit }): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (request.method !== 'POST' || !key || key.length > 100 || !['/login', '/submit'].includes(url.pathname)) return new Response(null, { status: 400 });
    const limiter = url.pathname === '/login' ? env.LOGIN_LIMITER : env.SUBMIT_LIMITER;
    const { success } = await limiter.limit({ key });
    return new Response(null, { status: success ? 204 : 429 });
  },
};
