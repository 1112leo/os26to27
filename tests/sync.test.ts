import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TypingResult } from '../src/shared/types';
const mocks = vi.hoisted(() => ({ submit: vi.fn(), admin: vi.fn(), device: vi.fn() }));
vi.mock('../src/firebase/repository', () => ({ submitTyping: mocks.submit }));
vi.mock('../src/firebase/admin', () => ({ adminContext: mocks.admin }));
vi.mock('../src/firebase/client', () => ({ deviceIdentity: mocks.device }));
import { saveResult, synchronizePending } from '../src/typing/storage';
import { listResults } from '../src/typing/local-storage';
beforeEach(() => {
  vi.clearAllMocks(); mocks.admin.mockResolvedValue({ uid: 'operator', db: 'admin-db' }); mocks.device.mockResolvedValue({ uid: 'device', db: 'device-db' });
});
describe('typing retry outbox', () => {
  it('retains failed results and reuses their ID when cloud save is retried', async () => {
    const result: TypingResult = { id: crypto.randomUUID(), participantId: 'retry', displayName: '시험', challengeId: 'test', elapsedMs: 60000, speed: 145, errors: 0, score: 145, completedAt: new Date().toISOString(), practice: true, prizeReceived: false };
    mocks.submit.mockRejectedValueOnce({ code: 'unavailable' });
    await expect(saveResult(result)).rejects.toMatchObject({ status: 503 });
    expect((await listResults()).find(item => item.id === result.id)?.syncState).toBe('pending');
    mocks.submit.mockResolvedValueOnce({ id: result.id, replayed: true });
    const replay = await synchronizePending();
    expect(replay.synced).toBe(1); expect(replay.remaining).toBe(0);
    expect(mocks.submit.mock.calls[0][2].id).toBe(result.id); expect(mocks.submit.mock.calls[1][2].id).toBe(result.id);
    expect(mocks.submit.mock.calls[0][1]).toBe('device'); expect(mocks.submit.mock.calls[1][1]).toBe('operator');
    expect((await listResults()).find(item => item.id === result.id)?.syncState).toBe('synced');
  });
});
