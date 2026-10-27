import type { LocalTypingResult, TypingResult } from '../shared/types';
import { adminContext } from '../firebase/admin';
import { deviceIdentity } from '../firebase/client';
import { submitTyping } from '../firebase/repository';
import { firebaseError } from '../firebase/errors';
import { listResults as localResults, saveResult as localSave } from './local-storage';
export { resultsCsv } from './local-storage';

export async function saveResult(result: TypingResult, asAdmin = false): Promise<{ synced: true; backupSaved: boolean }> {
  let backupSaved = true;
  const queued: LocalTypingResult = { ...result, syncState: 'pending' };
  try { await localSave(queued); } catch { backupSaved = false; }
  try {
    // Normal booth submissions keep the device identity even while an operator is signed in.
    const context = asAdmin ? await adminContext() : await deviceIdentity();
    await submitTyping(context.db, context.uid, result);
    try { await localSave({ ...queued, syncState: 'synced', syncError: '' }); } catch { backupSaved = false; }
    return { synced: true, backupSaved };
  } catch (error) {
    try { await localSave({ ...queued, syncError: firebaseError(error).message }); } catch { /* Result remains in the active UI for emergency download. */ }
    throw firebaseError(error);
  }
}

export async function pendingResults() { return (await localResults()).filter(result => result.syncState !== 'synced'); }
export async function synchronizePending() {
  await adminContext();
  const pending = await pendingResults();
  let synced = 0;
  let error = '';
  for (const result of pending) {
    try { await saveResult({ ...result, prizeReceived: false }, true); synced++; }
    catch (reason) { error = firebaseError(reason).message; break; }
  }
  return { synced, remaining: (await pendingResults()).length, error };
}
