import { getClients, deviceIdentity } from '../firebase/client';
import { adminContext, adminSession, loginAdmin, logoutAdmin } from '../firebase/admin';
import { readEvent, readLetters, reviewLetter, submitLetter } from '../firebase/repository';
import { ClientError, firebaseError } from '../firebase/errors';
import type { Letter } from './types';
export { ClientError } from '../firebase/errors';

let letterCache: { uid: string; fetchedAt: number; letters: Letter[] } | null = null;
export async function adminLetters(force = false) {
  const { uid, db } = await adminContext();
  if (!force && letterCache?.uid === uid && Date.now() - letterCache.fetchedAt < 30000) return letterCache.letters;
  const letters = await readLetters(db);
  letterCache = { uid, letters, fetchedAt: Date.now() };
  return letters;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    const url = new URL(path, 'https://app.invalid');
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {};
    let result: unknown;
    if (url.pathname === '/api/config') result = await readEvent((await getClients()).deviceDb);
    else if (url.pathname === '/api/letters' && method === 'POST') { const { db, uid } = await deviceIdentity(); result = await submitLetter(db, uid, body); }
    else if (url.pathname === '/api/admin/session') result = await adminSession();
    else if (url.pathname === '/api/admin/login' && method === 'POST') result = await loginAdmin(String(body.email ?? ''), String(body.password ?? ''));
    else if (url.pathname === '/api/admin/logout' && method === 'POST') { letterCache = null; result = await logoutAdmin(); }
    else if (url.pathname === '/api/admin/letters' && method === 'GET') {
      const all = await adminLetters(url.searchParams.get('refresh') === '1');
      const status = url.searchParams.get('status') ?? '';
      const keyword = (url.searchParams.get('q') ?? '').toLocaleLowerCase();
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
      const sort = url.searchParams.get('sort') === 'asc' ? 1 : -1;
      const filtered = all.filter(letter => (!status || letter.status === status) && `${letter.nickname ?? ''} ${letter.content}`.toLocaleLowerCase().includes(keyword))
        .sort((a, b) => sort * a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      result = { letters: filtered.slice((page - 1) * 20, page * 20), total: filtered.length, page, pageSize: 20,
        stats: { pending: all.filter(l => l.status === 'pending').length, approved: all.filter(l => l.status === 'approved').length, rejected: all.filter(l => l.status === 'rejected').length } };
    } else if (/^\/api\/admin\/letters\/[0-9a-f-]{36}$/.test(url.pathname) && method === 'PATCH') {
      const { uid, db } = await adminContext();
      const letter = await reviewLetter(db, url.pathname.split('/').at(-1)!, body);
      if (letterCache?.uid === uid) { letterCache.letters = letterCache.letters.map(item => item.id === letter.id ? letter : item); letterCache.fetchedAt = Date.now(); }
      result = { letter };
    } else throw new ClientError('지원하지 않는 요청입니다.', 404, 'NOT_FOUND');
    return result as T;
  } catch (error) { throw firebaseError(error); }
}

export const errorMessage = (error: unknown) => firebaseError(error).message;
