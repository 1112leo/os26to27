import type { TypingResult } from '../shared/types';

const MEDIAL_KEYS = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 1];
const FINAL_KEYS = [0, 1, 1, 2, 1, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1];

/** Dubeolsik keys, excluding modifier keys. Spaces/punctuation each count once. */
export function countKeystrokes(text: string): number {
  return Array.from(text.normalize('NFC')).reduce((sum, char) => {
    const syllable = char.codePointAt(0)! - 0xac00;
    if (syllable < 0 || syllable > 11171) return sum + 1;
    return sum + 1 + MEDIAL_KEYS[Math.floor(syllable / 28) % 21] + FINAL_KEYS[syllable % 28];
  }, 0);
}

export function calculateScore(referenceKeystrokes: number, elapsedMs: number, errors: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || !Number.isInteger(errors) || errors < 0 || !Number.isInteger(referenceKeystrokes) || referenceKeystrokes <= 0) {
    throw new Error('타수 계산에 필요한 값이 올바르지 않습니다.');
  }
  const speed = Math.round(referenceKeystrokes * 60000 / elapsedMs);
  return { speed, score: Math.max(0, speed - errors * 20) };
}

export function compareScores(a: TypingResult, b: TypingResult): number {
  return b.score - a.score || a.errors - b.errors || a.elapsedMs - b.elapsedMs;
}

export function rankResults(results: TypingResult[]) {
  const sorted = [...results].sort((a, b) => compareScores(a, b) || a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id));
  return sorted.map((result, index) => ({
    ...result,
    rank: index > 0 && compareScores(result, sorted[index - 1]) === 0
      ? sorted.findIndex(previous => compareScores(result, previous) === 0) + 1 : index + 1,
  }));
}
