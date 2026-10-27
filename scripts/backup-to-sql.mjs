import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText, unicodeLength, UUID_PATTERN } from '../src/shared/validation.ts';

export function backupToSql(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.letters) || typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt))) throw new Error('관리자 전체 JSON 백업 파일이 필요합니다.');
  const keys = ['id', 'nickname', 'content', 'published_content', 'consent_to_publish', 'status', 'publish_order', 'submission_key', 'created_at', 'reviewed_at'];
  const ids = new Set();
  const submissions = new Set();
  const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''").replaceAll('\n', "'||char(10)||'").replaceAll('\r', "'||char(13)||'")}'`;
  const statements = data.letters.map(letter => {
    if (Object.keys(letter).sort().join(',') !== [...keys].sort().join(',')) throw new Error('백업 필드를 확인해 주세요.');
    if (!UUID_PATTERN.test(letter.id) || !UUID_PATTERN.test(letter.submission_key) || ids.has(letter.id) || submissions.has(letter.submission_key)) throw new Error('접수 ID가 잘못되었거나 중복입니다.');
    ids.add(letter.id); submissions.add(letter.submission_key);
    if (typeof letter.content !== 'string' || unicodeLength(normalizeText(letter.content)) < 10 || unicodeLength(letter.content) > 700 || letter.content.includes('\0')) throw new Error('본문이 올바르지 않습니다.');
    if (letter.nickname !== null && (typeof letter.nickname !== 'string' || unicodeLength(letter.nickname) > 30 || letter.nickname.includes('\0'))) throw new Error('별명이 올바르지 않습니다.');
    if (letter.published_content !== null && (typeof letter.published_content !== 'string' || unicodeLength(letter.published_content) > 700 || letter.published_content.includes('\0'))) throw new Error('공개용 본문이 올바르지 않습니다.');
    if (letter.consent_to_publish !== 1 || !['pending', 'approved', 'rejected'].includes(letter.status) || !(letter.publish_order === null || Number.isSafeInteger(letter.publish_order) && letter.publish_order >= 0)) throw new Error('검수 정보가 올바르지 않습니다.');
    if (typeof letter.created_at !== 'string' || !Number.isFinite(Date.parse(letter.created_at)) || !(letter.reviewed_at === null || typeof letter.reviewed_at === 'string' && Number.isFinite(Date.parse(letter.reviewed_at)))) throw new Error('날짜 형식이 올바르지 않습니다.');
    return `INSERT INTO letters (${keys.join(', ')}) VALUES (${keys.map(key => literal(letter[key])).join(', ')});`;
  });
  return `-- 새로 생성하고 마이그레이션한 빈 DB에서만 실행하세요. 기존 ID와 충돌하면 실패합니다.\n${statements.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [input, output] = process.argv.slice(2);
    if (!input || !output) throw new Error('사용법: npm run backup:sql -- <전체백업.json> <출력.sql>');
    const sql = backupToSql(JSON.parse(await readFile(input, 'utf8')));
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(output, sql, { flag: 'wx', mode: 0o600 });
    console.log('복구용 SQL을 생성했습니다. 새 빈 DB에만 적용하고 결과를 확인하세요.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
