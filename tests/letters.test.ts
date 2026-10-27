import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { pbkdf2Sync } from 'node:crypto';
import { handleRequest } from '../server/router';
import type { Env } from '../server/env';
import { issueCookie, isAdmin, verifyPassword } from '../server/auth';
import { validateSubmission } from '../src/shared/validation';
import { validatePublicData } from '../src/shared/public-data';
import { csvCell } from '../src/shared/csv';
import { backupToSql } from '../scripts/backup-to-sql.mjs';

const password = 'test-only-password-2027';
const salt = Buffer.from('test-only-salt-value').toString('base64url');
const hash = `pbkdf2$100000$${salt}$${pbkdf2Sync(password, Buffer.from(salt, 'base64url'), 100000, 32, 'sha256').toString('base64url')}`;
let mf: Miniflare;
let env: Env;
let adminCookie: string;
const content = '오성고에 입학하는 여러분을 진심으로 환영해요!\n즐거운 추억을 함께 만들어 가요.';
const submission = () => ({ nickname: '선배', content, consentToPublish: true, submissionKey: crypto.randomUUID() });

async function request(path: string, method = 'GET', body?: unknown, admin = false, origin = 'https://ohsung.test') {
  return handleRequest(new Request(`https://ohsung.test${path}`, { method, headers: {
    ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
    ...(admin ? { Cookie: adminCookie } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
}

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("ok"); } }', compatibilityDate: '2026-10-27', d1Databases: ['DB', 'RESTORE_DB'] }));
  const DB = await mf.getD1Database('DB');
  env = { DB, EVENT_PHASE: 'A', ADMIN_PASSWORD_HASH: hash, SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters', RATE_LIMITER: { fetch: async () => new Response(null, { status: 204 }) } };
  for (const sql of (await readFile('migrations/0001_letters.sql', 'utf8')).split(';').filter(s => s.trim())) await env.DB.prepare(sql).run();
  adminCookie = (await issueCookie(new Request('https://ohsung.test'), env)).split(';')[0];
});
beforeEach(async () => { await env.DB.prepare('DELETE FROM letters').run(); env.EVENT_PHASE = 'A'; });
afterAll(async () => { await mf?.dispose(); });

describe('서버 검증과 공개 데이터', () => {
  it('NFC·유니코드 문자 수·공백·동의를 검증한다', () => {
    expect(validateSubmission({ ...submission(), content: '😀'.repeat(700) }).value).toBeDefined();
    expect(validateSubmission({ ...submission(), content: '😀'.repeat(701) }).error).toBeDefined();
    expect(validateSubmission({ ...submission(), content: ' '.repeat(50) }).error).toBeDefined();
    expect(validateSubmission({ ...submission(), consentToPublish: false }).error).toBeDefined();
    expect(validateSubmission({ ...submission(), nickname: '줄\n바꿈' }).error).toBeDefined();
  });
  it('위험한 CSV 수식을 무력화한다', () => {
    for (const value of ['=1+1', ' +1', '\t=cmd', '@SUM(A1)', '-1']) expect(csvCell(value)).toMatch(/^"'/);
    expect(csvCell('일반 글')).toBe('"일반 글"');
  });
  it('원문·접수키가 섞인 공개 데이터는 거부한다', () => {
    expect(validatePublicData({ schemaVersion: 1, publishedAt: null, letters: [] })).toBe(true);
    expect(validatePublicData({ schemaVersion: 1, publishedAt: null, letters: [], secret: 'oops' })).toBe(false);
    expect(validatePublicData({ schemaVersion: 1, publishedAt: null, letters: [{ ...submission(), id: crypto.randomUUID() }] })).toBe(false);
  });
});

describe('D1 제출·검수 통합', () => {
  it('정상 글을 pending으로 저장하고 같은 요청의 재시도를 중복 저장하지 않는다', async () => {
    const payload = submission();
    const first = await request('/api/letters', 'POST', payload);
    expect(first.status).toBe(201);
    const receipt = await first.json() as { id: string };
    const retry = await request('/api/letters', 'POST', payload);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ id: receipt.id, replayed: true });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM letters').first('count')).toBe(1);
    expect(await env.DB.prepare('SELECT status FROM letters').first('status')).toBe('pending');
  });
  it('동시 재시도에서도 하나의 레코드만 생성한다', async () => {
    const payload = submission();
    const responses = await Promise.all([request('/api/letters', 'POST', payload), request('/api/letters', 'POST', payload)]);
    const receipts = await Promise.all(responses.map(r => r.json() as Promise<{ id: string }>));
    expect(receipts[0].id).toBe(receipts[1].id);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM letters').first('count')).toBe(1);
  });
  it('제출 종료 후 신규 글은 차단하고 기존 접수 재확인은 허용한다', async () => {
    const payload = submission(); await request('/api/letters', 'POST', payload);
    env.EVENT_PHASE = 'B';
    expect((await request('/api/letters', 'POST', submission())).status).toBe(403);
    expect((await request('/api/letters', 'POST', payload)).status).toBe(200);
  });
  it('동일 키를 다른 본문에 재사용하면 충돌로 거부한다', async () => {
    const payload = submission(); await request('/api/letters', 'POST', payload);
    expect((await request('/api/letters', 'POST', { ...payload, content: '다른 글로 바꿔서 보내는 요청입니다.' })).status).toBe(409);
  });
  it('서버에서 필수값과 교차 출처 요청을 거부한다', async () => {
    expect((await request('/api/letters', 'POST', { ...submission(), consentToPublish: false })).status).toBe(400);
    expect((await request('/api/letters', 'POST', submission(), false, 'https://evil.test')).status).toBe(403);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM letters').first('count')).toBe(0);
  });
  it('인증 없이 조회·검수·백업할 수 없다', async () => {
    expect((await request('/api/admin/letters')).status).toBe(401);
    expect((await request(`/api/admin/letters/${crypto.randomUUID()}`, 'PATCH', { status: 'approved' })).status).toBe(401);
    expect((await request('/api/admin/export')).status).toBe(401);
  });
  it('원문을 보존하고 승인·동의된 공개용 본문만 내보내며 승인 취소를 반영한다', async () => {
    const receipt = await (await request('/api/letters', 'POST', submission())).json() as { id: string };
    await request('/api/letters', 'POST', submission());
    const published = '신입생 여러분, 오성고에 온 것을 환영해요!';
    expect((await request(`/api/admin/letters/${receipt.id}`, 'PATCH', { status: 'approved', published_content: published, publish_order: 2 }, true)).status).toBe(200);
    expect(await env.DB.prepare('SELECT content FROM letters WHERE id = ?').bind(receipt.id).first('content')).toBe(content);
    expect((await request(`/api/admin/letters/${receipt.id}`, 'PATCH', { content: '원문 변경 시도' }, true)).status).toBe(400);
    const exported = await (await request('/api/admin/export?scope=public&format=json', 'GET', undefined, true)).json();
    expect(validatePublicData(exported)).toBe(true);
    expect(exported).toMatchObject({ letters: [{ id: receipt.id, content: published, nickname: '선배', order: 2 }] });
    expect(JSON.stringify(exported)).not.toContain('submission_key');
    await request(`/api/admin/letters/${receipt.id}`, 'PATCH', { status: 'pending' }, true);
    expect(await (await request('/api/admin/export?scope=public', 'GET', undefined, true)).json()).toMatchObject({ letters: [] });
  });
  it('상태·키워드·페이지 필터를 SQL 바인딩으로 처리한다', async () => {
    await request('/api/letters', 'POST', { ...submission(), nickname: '검색대상' });
    const data = await (await request('/api/admin/letters?status=pending&q=검색대상', 'GET', undefined, true)).json() as { total: number; letters: unknown[] };
    expect(data.total).toBe(1); expect(data.letters).toHaveLength(1);
    expect((await request('/api/admin/letters?status=bad', 'GET', undefined, true)).status).toBe(400);
    expect((await request('/api/admin/letters?page=0', 'GET', undefined, true)).status).toBe(400);
  });
  it('긴 한글 검색어와 SQL 와일드카드를 일반 문자로 검색한다', async () => {
    const phrase = '학교에서 친구들과 함께 만들어 가는 아주 특별하고 소중한 추억';
    await request('/api/letters', 'POST', { ...submission(), content: `${phrase} 100%_정확히 찾아요` });
    for (const query of [phrase, '100%_', "' OR 1=1 --"]) {
      const response = await request(`/api/admin/letters?q=${encodeURIComponent(query)}`, 'GET', undefined, true);
      expect(response.status).toBe(200);
      const data = await response.json() as { total: number };
      expect(data.total).toBe(query.startsWith("'") ? 0 : 1);
    }
  });
  it('700자 글 2,000건의 페이지 조회·검색·전체 백업·공개 내보내기를 처리한다', async () => {
    await env.DB.prepare(`WITH RECURSIVE sequence(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM sequence WHERE n < 2000)
      INSERT INTO letters (id, nickname, content, consent_to_publish, status, submission_key, created_at)
      SELECT printf('%08x-0000-4000-8000-%012x', n, n), '선배 ' || n, ?, 1,
        CASE WHEN n % 2 = 0 THEN 'approved' ELSE 'pending' END,
        printf('%08x-1111-4000-8000-%012x', n, n), '2026-10-27T00:00:00Z' FROM sequence`).bind('가'.repeat(700)).run();
    const page = await (await request('/api/admin/letters?page=100', 'GET', undefined, true)).json() as { total: number; letters: unknown[]; stats: { approved: number } };
    expect(page.total).toBe(2000); expect(page.letters).toHaveLength(20); expect(page.stats.approved).toBe(1000);
    const search = await (await request(`/api/admin/letters?q=${encodeURIComponent('선배 2000')}`, 'GET', undefined, true)).json() as { total: number };
    expect(search.total).toBe(1);
    const backup = await (await request('/api/admin/export?scope=all', 'GET', undefined, true)).json() as { letters: unknown[] };
    expect(backup.letters).toHaveLength(2000);
    const publicData = await (await request('/api/admin/export?scope=public', 'GET', undefined, true)).json();
    expect(validatePublicData(publicData)).toBe(true);
    expect(publicData).toMatchObject({ letters: expect.arrayContaining([expect.objectContaining({ content: '가'.repeat(700) })]) });
    if (validatePublicData(publicData)) expect(publicData.letters).toHaveLength(1000);
  }, 20000);
  it('전체 JSON 백업을 새 D1에 복원해 원문·검수·접수 키를 보존한다', async () => {
    const payload = { ...submission(), nickname: "선배's", content: "작은 '따옴표'와\n줄바꿈도 복원할 수 있어야 합니다." };
    const { id } = await (await request('/api/letters', 'POST', payload)).json() as { id: string };
    await request(`/api/admin/letters/${id}`, 'PATCH', { status: 'approved', published_content: '공개용으로 따로 수정한 내용입니다.' }, true);
    const backup = await (await request('/api/admin/export?scope=all', 'GET', undefined, true)).json();
    const sql = backupToSql(backup);
    const restored = await mf.getD1Database('RESTORE_DB');
    for (const statement of (await readFile('migrations/0001_letters.sql', 'utf8')).split(';').filter(s => s.trim())) await restored.prepare(statement).run();
    await restored.exec(sql.replace(/^--.*\n/, ''));
    expect(await restored.prepare('SELECT * FROM letters WHERE id = ?').bind(id).first()).toEqual(await env.DB.prepare('SELECT * FROM letters WHERE id = ?').bind(id).first());
    expect(() => backupToSql({ schemaVersion: 1, publishedAt: null, letters: [] })).toThrow();
  });
  it('요청 제한과 DB 실패 시 성공 응답을 반환하지 않는다', async () => {
    const prior = env.RATE_LIMITER;
    env.RATE_LIMITER = { fetch: async () => new Response(null, { status: 429 }) };
    expect((await request('/api/letters', 'POST', submission())).status).toBe(429);
    env.RATE_LIMITER = prior;
    const original = env.DB;
    env.DB = new Proxy(original, { get(target, property) { if (property === 'prepare') return () => { throw new Error('private database failure'); }; return Reflect.get(target, property); } });
    const failure = await request('/api/letters', 'POST', submission());
    expect(failure.status).toBe(500);
    expect(await failure.text()).not.toContain('private database failure');
    env.DB = original;
  });
});

describe('관리자 인증', () => {
  it('비밀번호와 서명된 쿠키를 확인하고 변조·만료를 거부한다', async () => {
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
    expect(await isAdmin(new Request('https://ohsung.test', { headers: { Cookie: adminCookie } }), env)).toBe(true);
    expect(await isAdmin(new Request('https://ohsung.test', { headers: { Cookie: adminCookie + 'tampered' } }), env)).toBe(false);
    const expiredPayload = Buffer.from(JSON.stringify({ exp: 1, nonce: 'old' })).toString('base64url');
    expect(await isAdmin(new Request('https://ohsung.test', { headers: { Cookie: `__Host-ohsung_admin=${expiredPayload}.invalid` } }), env)).toBe(false);
  });
  it('로그인 쿠키는 HttpOnly·Secure·SameSite이며 로그아웃은 쿠키를 만료시킨다', async () => {
    const login = await request('/api/admin/login', 'POST', { password });
    expect(login.status).toBe(200);
    expect(login.headers.get('Set-Cookie')).toContain('HttpOnly; SameSite=Strict');
    expect(login.headers.get('Set-Cookie')).toContain('Secure');
    expect((await request('/api/admin/login', 'POST', { password: 'wrong' })).status).toBe(401);
    expect((await request('/api/admin/logout', 'POST', {})).headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});
