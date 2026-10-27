import type { Letter, ReviewStatus } from '../src/shared/types';
import { CONTENT_LIMITS, normalizeText, unicodeLength, validateSubmission } from '../src/shared/validation';
import { makePublicData } from '../src/shared/public-data';
import { toCsv } from '../src/shared/csv';
import type { Env } from './env';
import { ApiError, json, readJson } from './http';
import { limitRequest } from './auth';

export const eventConfig = (env: Env) => ({
  phase: ['A', 'B', 'C'].includes(env.EVENT_PHASE) ? env.EVENT_PHASE : 'B',
  typingEnabled: env.EVENT_PHASE === 'A', submissionsEnabled: env.EVENT_PHASE === 'A',
});

export async function submitLetter(request: Request, env: Env): Promise<Response> {
  const { value, error } = validateSubmission(await readJson(request));
  if (!value) throw new ApiError(400, 'VALIDATION_FAILED', error!);
  await limitRequest(request, env.RATE_LIMITER, 'submit');
  // A retry may retrieve an existing receipt after submissions have closed.
  const existing = await env.DB.prepare('SELECT id, nickname, content, consent_to_publish FROM letters WHERE submission_key = ?').bind(value.submissionKey).first<Pick<Letter, 'id' | 'nickname' | 'content' | 'consent_to_publish'>>();
  if (existing) {
    if (existing.content !== value.content || (existing.nickname ?? '') !== value.nickname || existing.consent_to_publish !== 1) throw new ApiError(409, 'KEY_CONFLICT', '동일 접수번호로 다른 내용을 제출할 수 없습니다. 기존 내용으로 재시도해 주세요.');
    return json({ id: existing.id, replayed: true });
  }
  if (!eventConfig(env).submissionsEnabled) throw new ApiError(403, 'SUBMISSIONS_CLOSED', '현재 글 제출 기간이 아닙니다.');
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO letters (id, nickname, content, consent_to_publish, submission_key, created_at)
    VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(submission_key) DO NOTHING`)
    .bind(id, value.nickname || null, value.content, value.submissionKey, new Date().toISOString()).run();
  const saved = await env.DB.prepare('SELECT id, nickname, content FROM letters WHERE submission_key = ?').bind(value.submissionKey).first<Pick<Letter, 'id' | 'nickname' | 'content'>>();
  if (!saved) throw new Error('insert_not_persisted');
  if (saved.content !== value.content || (saved.nickname ?? '') !== value.nickname) throw new ApiError(409, 'KEY_CONFLICT', '접수 요청이 충돌했습니다. 기존 내용으로 재시도해 주세요.');
  return json({ id: saved.id, replayed: saved.id !== id }, saved.id === id ? 201 : 200);
}

export async function listLetters(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const page = Number(params.get('page') ?? 1);
  const status = params.get('status') ?? '';
  const query = (params.get('q') ?? '').trim();
  const sort = params.get('sort') ?? 'desc';
  if (!Number.isSafeInteger(page) || page < 1 || query.length > 100 || status && !['pending', 'approved', 'rejected'].includes(status) || !['asc', 'desc'].includes(sort)) throw new ApiError(400, 'INVALID_FILTER', '검색 조건을 확인해 주세요.');
  const clauses: string[] = [];
  const bindings: string[] = [];
  if (status) { clauses.push('status = ?'); bindings.push(status); }
  if (query) {
    // D1 limits LIKE patterns to 50 UTF-8 bytes; instr treats %, _ and quotes literally.
    clauses.push('(instr(lower(content), lower(?)) > 0 OR instr(lower(nickname), lower(?)) > 0)');
    bindings.push(query, query);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const pageSize = 20;
  const [count, rows, stats] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM letters ${where}`).bind(...bindings).first<{ total: number }>(),
    env.DB.prepare(`SELECT * FROM letters ${where} ORDER BY created_at ${sort === 'asc' ? 'ASC' : 'DESC'}, id ASC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, (page - 1) * pageSize).all<Letter>(),
    env.DB.prepare('SELECT status, COUNT(*) AS count FROM letters GROUP BY status').all<{ status: ReviewStatus; count: number }>(),
  ]);
  return json({ letters: rows.results, total: count?.total ?? 0, page, pageSize, stats: Object.fromEntries(stats.results.map(r => [r.status, r.count])) });
}

export async function reviewLetter(request: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_REVIEW', '검수 내용을 확인해 주세요.');
  const data = body as Record<string, unknown>;
  if (Object.keys(data).length === 0 || Object.keys(data).some(k => !['status', 'published_content', 'publish_order'].includes(k))) throw new ApiError(400, 'IMMUTABLE_FIELD', '원문과 접수 정보는 수정할 수 없습니다.');
  const current = await env.DB.prepare('SELECT * FROM letters WHERE id = ?').bind(id).first<Letter>();
  if (!current) throw new ApiError(404, 'NOT_FOUND', '해당 글을 찾을 수 없습니다.');
  const status = data.status ?? current.status;
  if (!['pending', 'approved', 'rejected'].includes(String(status))) throw new ApiError(400, 'INVALID_STATUS', '검수 상태를 확인해 주세요.');
  let published = current.published_content;
  if ('published_content' in data) {
    if (data.published_content !== null && typeof data.published_content !== 'string') throw new ApiError(400, 'INVALID_CONTENT', '공개용 본문 형식이 올바르지 않습니다.');
    published = data.published_content === null ? null : normalizeText(data.published_content as string) || null;
    if (published && unicodeLength(published) > CONTENT_LIMITS.max) throw new ApiError(400, 'INVALID_CONTENT', '공개용 본문은 700자 이내로 작성해 주세요.');
  }
  const order = 'publish_order' in data ? data.publish_order : current.publish_order;
  if (order !== null && (!Number.isSafeInteger(order) || Number(order) < 0 || Number(order) > 1000000)) throw new ApiError(400, 'INVALID_ORDER', '공개 순서는 0~1000000의 정수로 입력해 주세요.');
  if (status === 'approved' && (current.consent_to_publish !== 1 || !normalizeText(published || current.content))) throw new ApiError(400, 'NOT_PUBLISHABLE', '공개 동의와 본문을 확인해 주세요.');
  await env.DB.prepare('UPDATE letters SET status = ?, published_content = ?, publish_order = ?, reviewed_at = ? WHERE id = ?')
    .bind(status, published, order, new Date().toISOString(), id).run();
  return json({ letter: await env.DB.prepare('SELECT * FROM letters WHERE id = ?').bind(id).first<Letter>() });
}

export async function exportLetters(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const format = params.get('format') ?? 'json';
  const scope = params.get('scope') ?? 'all';
  if (!['json', 'csv'].includes(format) || !['all', 'public'].includes(scope) || scope === 'public' && format !== 'json') throw new ApiError(400, 'INVALID_EXPORT', '내보내기 형식을 확인해 주세요.');
  const records: Letter[] = [];
  // Bounded queries avoid D1's per-query result size limit during backups.
  let cursor = '';
  while (true) {
    const batch = await env.DB.prepare('SELECT * FROM letters WHERE id > ? ORDER BY id LIMIT 100').bind(cursor).all<Letter>();
    records.push(...batch.results);
    if (batch.results.length < 100) break;
    cursor = batch.results.at(-1)!.id;
  }
  let body: string;
  if (scope === 'public') body = JSON.stringify(makePublicData(records), null, 2);
  else if (format === 'json') body = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), letters: records }, null, 2);
  else body = toCsv([
    ['ID', '별명', '원문', '공개용 본문', '공개 동의', '검수 상태', '공개 순서', '접수 키', '작성 시각(UTC)', '검수 시각(UTC)'],
    ...records.map(l => [l.id, l.nickname, l.content, l.published_content, l.consent_to_publish, l.status, l.publish_order, l.submission_key, l.created_at, l.reviewed_at]),
  ]);
  return new Response(body, { headers: {
    'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="ohsung-${scope}-${new Date().toISOString().slice(0, 10)}.${format}"`,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
