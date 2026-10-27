import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/public-data.mjs');
const baseline = JSON.stringify({ schemaVersion: 1, publishedAt: null, letters: [] });

describe('공개 파일 반영과 복구', () => {
  it('검증 실패 시 이전 정상 파일을 보존한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ohsung-public-'));
    try {
      await mkdir(join(directory, 'public/data'), { recursive: true });
      await writeFile(join(directory, 'public/data/welcome.json'), baseline);
      await writeFile(join(directory, 'invalid.json'), JSON.stringify({ schemaVersion: 1, exportedAt: '2026-10-27T00:00:00Z', letters: [], submission_key: 'private' }));
      const result = spawnSync(process.execPath, [script, 'import', join(directory, 'invalid.json')], { cwd: directory, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(await readFile(join(directory, 'public/data/welcome.json'), 'utf8')).toBe(baseline);
    } finally {
      if (!resolve(directory).startsWith(resolve(tmpdir()) + '\\ohsung-public-') && !resolve(directory).startsWith(resolve(tmpdir()) + '/ohsung-public-')) throw new Error('Unexpected temporary path');
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('검증된 공개 파일만 반영하고 이전 파일을 별도 보관한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ohsung-public-'));
    try {
      await mkdir(join(directory, 'public/data'), { recursive: true });
      await writeFile(join(directory, 'public/data/welcome.json'), baseline);
      const next = JSON.stringify({ schemaVersion: 1, publishedAt: '2026-10-27T00:00:00Z', letters: [{ id: crypto.randomUUID(), nickname: '오성고 선배', content: '새로운 시작을 환영해요.\n즐거운 학교생활을 응원합니다.', order: 1 }] });
      await writeFile(join(directory, 'approved.json'), next);
      const result = spawnSync(process.execPath, [script, 'import', join(directory, 'approved.json')], { cwd: directory, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(await readFile(join(directory, 'public/data/welcome.json'), 'utf8')).toBe(next);
      const backups = await readdir(join(directory, 'backups'));
      expect(backups).toHaveLength(1);
      expect(await readFile(join(directory, 'backups', backups[0]), 'utf8')).toBe(baseline);
    } finally {
      if (!resolve(directory).startsWith(resolve(tmpdir()) + '\\ohsung-public-') && !resolve(directory).startsWith(resolve(tmpdir()) + '/ohsung-public-')) throw new Error('Unexpected temporary path');
      await rm(directory, { recursive: true, force: true });
    }
  });
});
