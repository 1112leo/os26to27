import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { listResults, resultsCsv, saveResult } from '../src/typing/local-storage';
import type { TypingResult } from '../src/shared/types';

describe('IndexedDB와 CSV', () => {
  it('트랜잭션 완료 후 기록과 상품 수령 상태가 유지된다', async () => {
    const result: TypingResult = { id: crypto.randomUUID(), participantId: '001', displayName: '=HYPERLINK("x")', challengeId: 'v1', elapsedMs: 60000, speed: 500, errors: 1, score: 480, completedAt: '2026-10-27T00:00:00Z', prizeReceived: false, practice: false };
    await saveResult(result);
    expect(await listResults()).toContainEqual(result);
    await saveResult({ ...result, prizeReceived: true });
    const stored = (await listResults()).find(r => r.id === result.id)!;
    expect(stored.prizeReceived).toBe(true);
    const csv = resultsCsv([stored]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"1","001"');
    expect(csv).toContain('"480"');
    expect(csv).toContain('"수령"');
  });
});
