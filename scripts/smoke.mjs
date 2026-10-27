import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { validatePublicData } from '../src/shared/public-data.ts';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:8788').origin;
const passwordFile = process.argv[3] ?? 'artifacts/local-admin-password.txt';
const password = await readFile(passwordFile, 'utf8');
let cookie = '';
async function request(path, method = 'GET', body, admin = false) {
  return fetch(origin + path, { method, headers: {
    ...(method !== 'GET' ? { 'Content-Type': 'application/json', Origin: origin } : {}),
    ...(admin ? { Cookie: cookie } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
}

assert.equal((await request('/api/admin/letters')).status, 401);
const login = await request('/api/admin/login', 'POST', { password });
assert.equal(login.status, 200, '관리자 인증 실패');
cookie = login.headers.getSetCookie()[0].split(';')[0];
const payload = { nickname: '배포 기능 검증', content: '배포 기능 확인을 위한 시험 데이터입니다.\n실제 학생이 작성한 글이 아닙니다.', consentToPublish: true, submissionKey: crypto.randomUUID() };
const submitted = await request('/api/letters', 'POST', payload);
assert.equal(submitted.status, 201, '원격 글 저장 실패');
const { id } = await submitted.json();
// Save the fixture ID immediately so a partially failed run can still be cleaned up precisely.
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/smoke-fixture.json', JSON.stringify({ origin, id, submissionKey: payload.submissionKey }));
const retry = await request('/api/letters', 'POST', payload);
assert.equal(retry.status, 200);
assert.equal((await retry.json()).id, id);
const published = '검증을 마친 공개용 시험 문구입니다.';
assert.equal((await request(`/api/admin/letters/${id}`, 'PATCH', { status: 'approved', published_content: published, publish_order: 0 }, true)).status, 200);
const publicData = await (await request('/api/admin/export?scope=public&format=json', 'GET', undefined, true)).json();
assert.ok(validatePublicData(publicData));
assert.equal(publicData.letters.find(l => l.id === id).content, published);
const backup = await (await request('/api/admin/export?scope=all&format=json', 'GET', undefined, true)).json();
assert.equal(backup.letters.find(l => l.id === id).content, payload.content);
const csv = await request('/api/admin/export?format=csv&scope=all', 'GET', undefined, true);
assert.equal(csv.status, 200); assert.ok((await csv.text()).includes('배포 기능 검증'));
assert.equal((await request(`/api/admin/letters/${id}`, 'PATCH', { status: 'rejected' }, true)).status, 200);
const after = await (await request('/api/admin/export?scope=public', 'GET', undefined, true)).json();
assert.ok(!after.letters.some(l => l.id === id));
assert.equal((await request('/api/admin/logout', 'POST', {})).status, 200);
const summary = { origin, id, submissionKey: payload.submissionKey, checkedAt: new Date().toISOString(), passed: ['unauthenticated-denied', 'admin-login', 'd1-submit', 'idempotent-retry', 'review', 'original-preserved', 'public-export', 'csv-export', 'reject-unpublishes', 'logout'] };
await writeFile('artifacts/smoke-result.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
