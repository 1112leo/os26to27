import type { Env } from './env';
import { ApiError, checkOrigin, json, readJson } from './http';
import { isAdmin, issueCookie, limitRequest, logoutCookie, requireAdmin, verifyPassword } from './auth';
import { eventConfig, exportLetters, listLetters, reviewLetter, submitLetter } from './letters';

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  try {
    if (!['GET', 'HEAD'].includes(request.method)) checkOrigin(request);
    if (path === '/api/config' && request.method === 'GET') return json(eventConfig(env));
    if (path === '/api/letters' && request.method === 'POST') return await submitLetter(request, env);
    if (path === '/api/admin/login' && request.method === 'POST') {
      await limitRequest(request, env.RATE_LIMITER, 'login');
      if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '관리자 인증 설정이 필요합니다.');
      const body = await readJson(request) as Record<string, unknown> | null;
      if (!body || typeof body.password !== 'string' || body.password.length > 256 || !await verifyPassword(body.password, env.ADMIN_PASSWORD_HASH)) {
        console.warn(JSON.stringify({ event: 'auth_failed' }));
        throw new ApiError(401, 'INVALID_CREDENTIALS', '비밀번호가 올바르지 않습니다.');
      }
      return json({ authenticated: true }, 200, { 'Set-Cookie': await issueCookie(request, env) });
    }
    if (path === '/api/admin/logout' && request.method === 'POST') return json({ authenticated: false }, 200, { 'Set-Cookie': logoutCookie(request) });
    if (path === '/api/admin/session' && request.method === 'GET') return json({ authenticated: await isAdmin(request, env) });
    if (path.startsWith('/api/admin/')) {
      await requireAdmin(request, env);
      if (path === '/api/admin/letters' && request.method === 'GET') return await listLetters(request, env);
      if (path === '/api/admin/export' && request.method === 'GET') return await exportLetters(request, env);
      const review = path.match(/^\/api\/admin\/letters\/([0-9a-f-]{36})$/i);
      if (review && request.method === 'PATCH') return await reviewLetter(request, env, review[1]);
    }
    throw new ApiError(404, 'NOT_FOUND', '요청한 기능을 찾을 수 없습니다.');
  } catch (error) {
    if (error instanceof ApiError) {
      console.warn(JSON.stringify({ event: 'request_rejected', path, code: error.code, status: error.status }));
      return json({ error: { code: error.code, message: error.message } }, error.status, error.status === 429 ? { 'Retry-After': '60' } : undefined);
    }
    const reference = crypto.randomUUID();
    console.error(JSON.stringify({ event: 'api_failure', path, reference, kind: error instanceof Error ? error.name : 'unknown' }));
    return json({ error: { code: 'INTERNAL_ERROR', message: '서버 처리에 실패했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.', reference } }, 500);
  }
}
