import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
// @ts-expect-error Node utility is exercised directly, not shipped to browsers.
import { validateBackup, restoreBackup } from '../../scripts/firebase-backup.mjs';

let app: App;
beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
  app = initializeApp({ projectId: 'demo-ohsung-recovery' }, 'backup-tests');
});
afterAll(async () => { await deleteApp(app); });
describe('Firebase backup recovery', () => {
  it('validates private backups, restores timestamps and prevents overwrites', async () => {
    const id = crypto.randomUUID();
    const backup = { schemaVersion: 2, backend: 'firebase', projectId: 'original', collections: {
      letters: [{ id, data: { content: '복원할 원문입니다.', created_at: { __firestoreTimestamp: true, seconds: 1700000000, nanoseconds: 123000 } } }],
      typingResults: [], receipts: [], settings: [], challenges: [],
    } };
    expect(validateBackup(backup)).toHaveLength(1);
    const db = getFirestore(app);
    // Use a clean disposable emulator project, never a live destination.
    await fetch('http://127.0.0.1:8088/emulator/v1/projects/demo-ohsung-recovery/databases/(default)/documents', { method: 'DELETE' });
    expect(await restoreBackup(db, backup)).toBe(1);
    const saved = (await db.doc(`letters/${id}`).get()).data()!;
    expect(saved.content).toBe('복원할 원문입니다.'); expect(saved.created_at).toBeInstanceOf(Timestamp);
    expect(saved.created_at.nanoseconds).toBe(123000);
    await expect(restoreBackup(db, backup)).rejects.toThrow('not empty');
    expect(() => validateBackup({ schemaVersion: 1, letters: [] })).toThrow();
    expect(() => validateBackup({ ...backup, collections: { ...backup.collections, admins: [{ id: 'attacker', data: { enabled: true } }] } })).toThrow();
  });
});
