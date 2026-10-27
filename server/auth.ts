import type { Env } from './env';
import { ApiError } from './http';

const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const cookieName = (request: Request) => new URL(request.url).protocol === 'https:' ? '__Host-ohsung_admin' : 'ohsung_admin_local';
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const decode = (text: string) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [algorithm, roundsText, saltText, digestText] = hash.split('$');
  const iterations = Number(roundsText);
  if (algorithm !== 'pbkdf2' || iterations < 100000 || iterations > 1000000 || !saltText || !digestText) return false;
  try {
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: decode(saltText), iterations }, material, 256);
    const expected = decode(digestText);
    const actual = new Uint8Array(bits);
    // Compare fixed-size digests in constant time using the native HMAC verifier.
    const key = await crypto.subtle.importKey('raw', actual, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    const signature = await crypto.subtle.sign('HMAC', key, expected);
    const expectedKey = await crypto.subtle.importKey('raw', expected, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('HMAC', expectedKey, signature, expected);
  } catch { return false; }
}

function sessionSecret(env: Env): string {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '관리자 인증 설정이 필요합니다.');
  return env.SESSION_SECRET;
}

async function signingKey(env: Env) {
  return crypto.subtle.importKey('raw', encoder.encode(sessionSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function issueCookie(request: Request, env: Env): Promise<string> {
  const payload = encode(encoder.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: crypto.randomUUID() })));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(payload));
  return cookie(request, `${payload}.${encode(new Uint8Array(signature))}`, SESSION_SECONDS);
}

function cookie(request: Request, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
export const logoutCookie = (request: Request) => cookie(request, '', 0);

export async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const name = cookieName(request);
  const token = request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!token || token.length > 1024) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  try {
    if (!await crypto.subtle.verify('HMAC', await signingKey(env), decode(parts[1]), encoder.encode(parts[0]))) return false;
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as { exp?: number; nonce?: string };
    const now = Math.floor(Date.now() / 1000);
    return typeof payload.exp === 'number' && payload.exp > now && payload.exp <= now + SESSION_SECONDS && typeof payload.nonce === 'string';
  } catch { return false; }
}

export async function requireAdmin(request: Request, env: Env) {
  if (!await isAdmin(request, env)) throw new ApiError(401, 'UNAUTHENTICATED', '관리자 로그인이 필요합니다.');
}

export async function limitRequest(request: Request, limiter: Pick<Fetcher, 'fetch'>, scope: 'login' | 'submit'): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${scope}:${ip}`));
  const response = await limiter.fetch(`https://rate.internal/${scope}?key=${encode(new Uint8Array(digest))}`, { method: 'POST' });
  if (response.status === 429) throw new ApiError(429, 'RATE_LIMITED', '요청이 많습니다. 1분 후 다시 시도해 주세요.');
  if (response.status !== 204) throw new ApiError(503, 'RATE_LIMITER_UNAVAILABLE', '요청 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}
