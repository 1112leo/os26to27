import type { Letter, PublicData } from './types';
import { normalizeText, unicodeLength, UUID_PATTERN } from './validation.ts';

export function makePublicData(letters: Letter[], now = new Date().toISOString()): PublicData {
  return {
    schemaVersion: 1, publishedAt: now,
    letters: letters.filter(l => l.status === 'approved' && l.consent_to_publish === 1 && normalizeText(l.published_content || l.content).length > 0)
      .sort((a, b) => (a.publish_order ?? Number.MAX_SAFE_INTEGER) - (b.publish_order ?? Number.MAX_SAFE_INTEGER) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .map(l => ({ id: l.id, nickname: l.nickname || '오성고 선배', content: l.published_content || l.content, order: l.publish_order })),
  };
}

/** Strict allowlist prevents accidental publication of raw backup/review data. */
export function validatePublicData(input: unknown): input is PublicData {
  if (!input || typeof input !== 'object') return false;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(k => !['schemaVersion', 'publishedAt', 'letters'].includes(k))) return false;
  if (data.schemaVersion !== 1 || !Array.isArray(data.letters) || !(data.publishedAt === null || typeof data.publishedAt === 'string' && Number.isFinite(Date.parse(data.publishedAt)))) return false;
  const ids = new Set<string>();
  return data.letters.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const l = item as Record<string, unknown>;
    if (Object.keys(l).sort().join(',') !== 'content,id,nickname,order') return false;
    if (typeof l.id !== 'string' || !UUID_PATTERN.test(l.id) || ids.has(l.id)) return false;
    ids.add(l.id);
    return typeof l.nickname === 'string' && unicodeLength(l.nickname) <= 30 && typeof l.content === 'string' && normalizeText(l.content).length > 0 && unicodeLength(l.content) <= 700 && (l.order === null || Number.isInteger(l.order) && (l.order as number) >= 0);
  });
}
