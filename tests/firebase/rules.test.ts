import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { CHALLENGE } from '../../src/typing/challenge';
import { submitLetter, submitTyping, readLetters, reviewLetter, reviewTyping, setEvent } from '../../src/firebase/repository';
import type { TypingResult } from '../../src/shared/types';
import { calculateScore } from '../../src/typing/scoring';
import { createPrivateBackup } from '../../src/firebase/export';

let env: RulesTestEnvironment;
let guest: Firestore;
let operator: Firestore;
const letter = (id = crypto.randomUUID()) => ({ submissionKey: id, nickname: '선배', content: '후배 여러분의 새로운 시작을 응원합니다!', consentToPublish: true });
const result = (): TypingResult => ({ id: crypto.randomUUID(), participantId: '001', displayName: '연습', challengeId: CHALLENGE.challengeId,
  elapsedMs: 60000, speed: 145, errors: 8, score: 0, completedAt: new Date().toISOString(), prizeReceived: false, practice: true });

// Bypass all application validation: these tests exercise security rules themselves.
async function rawWrite(db: Firestore, kind: 'letter' | 'typing', changes: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  const batch = writeBatch(db);
  batch.set(doc(db, 'rateLimits', 'device'), { window_start: serverTimestamp(), count: 1, last_write_at: serverTimestamp(), last_event_id: id, kind });
  batch.set(doc(db, 'receipts', id), { id, owner_uid: 'device', kind, payload_hash: 'a'.repeat(64), created_at: serverTimestamp() });
  const data = kind === 'letter'
    ? { id, owner_uid: 'device', nickname: null, content: '직접 요청을 보내는 테스트입니다.', published_content: null, consent_to_publish: 1, status: 'pending', publish_order: null, submission_key: id, created_at: serverTimestamp(), reviewed_at: null }
    : { ...result(), id, owner_uid: 'device', verificationStatus: 'pending', received_at: serverTimestamp(), reviewed_at: null };
  batch.set(doc(db, kind === 'letter' ? 'letters' : 'typingResults', id), { ...data, ...changes });
  return batch.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-ohsung', firestore: { host: '127.0.0.1', port: 8088, rules: await readFile('firestore.rules', 'utf8') } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', 'operator'), { enabled: true });
    await setDoc(doc(db, 'settings', 'event'), { phase: 'A', updated_at: Timestamp.now() });
    await setDoc(doc(db, 'challenges', CHALLENGE.challengeId), { text: CHALLENGE.text, referenceKeystrokes: 145, practice: true, enabled: true });
  });
  guest = env.authenticatedContext('device').firestore() as unknown as Firestore;
  operator = env.authenticatedContext('operator').firestore() as unknown as Firestore;
});
afterAll(async () => { await env?.cleanup(); });

describe('Firebase atomic submission and private data', () => {
  it('exports private records and the exact event settings document under real rules', async () => {
    await submitLetter(guest, 'device', letter());
    await submitTyping(guest, 'device', result());
    const backup = await createPrivateBackup(operator);
    expect(backup.schemaVersion).toBe(2);
    expect(backup.collections.letters).toHaveLength(1);
    expect(backup.collections.typingResults).toHaveLength(1);
    expect(backup.collections.receipts).toHaveLength(2);
    expect(backup.collections.challenges).toHaveLength(1);
    expect(backup.collections.settings).toEqual([expect.objectContaining({ id: 'event', data: expect.objectContaining({ phase: 'A', updated_at: expect.objectContaining({ __firestoreTimestamp: true }) }) })]);
    await assertFails(getDocs(collection(operator, 'settings')));
  });
  it('saves one letter and replays the same receipt without duplication', async () => {
    const input = letter();
    expect((await submitLetter(guest, 'device', input)).replayed).toBe(false);
    expect((await submitLetter(guest, 'device', input)).replayed).toBe(true);
    expect((await readLetters(operator))).toHaveLength(1);
    expect((await getDoc(doc(guest, 'rateLimits', 'device'))).data()?.count).toBe(1);
    await expect(submitLetter(guest, 'device', { ...input, content: '동일 접수번호로 다른 글을 저장하면 안 됩니다.' })).rejects.toMatchObject({ status: 409 });
  });
  it('never lets guests read original content, own or others, or list receipts', async () => {
    const input = letter(); await submitLetter(guest, 'device', input);
    await assertFails(getDoc(doc(guest, 'letters', input.submissionKey)));
    await assertFails(getDocs(collection(guest, 'letters')));
    await assertFails(getDocs(collection(guest, 'receipts')));
    const other = env.authenticatedContext('other').firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(other, 'receipts', input.submissionKey)));
    const receipt = await assertSucceeds(getDoc(doc(guest, 'receipts', input.submissionKey)));
    expect(receipt.data()).not.toHaveProperty('content');
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'letters')));
  });
  it('blocks bypass writes without the atomic rate counter and receipt', async () => {
    const input = letter();
    await assertFails(setDoc(doc(guest, 'letters', input.submissionKey), { id: input.submissionKey, owner_uid: 'device', content: input.content }));
    await assertFails(setDoc(doc(guest, 'receipts', input.submissionKey), { id: input.submissionKey, owner_uid: 'device', kind: 'letter', payload_hash: 'a'.repeat(64), created_at: serverTimestamp() }));
    await assertFails(setDoc(doc(guest, 'rateLimits', 'device'), { window_start: serverTimestamp(), count: 1, last_write_at: serverTimestamp(), last_event_id: input.submissionKey, kind: 'letter' }));
  });
  it('rejects direct forged letter approval, consent, length and extra fields', async () => {
    for (const patch of [{ status: 'approved' }, { consent_to_publish: 0 }, { content: '짧음' }, { content: '가'.repeat(701) }, { nickname: '두\n줄' }, { owner_uid: 'other' }, { secret: 'extra' }]) {
      await assertFails(rawWrite(guest, 'letter', patch));
    }
  });
  it('accepts Korean and emoji character limits and rejects invalid input', async () => {
    await submitLetter(guest, 'device', { ...letter(), content: '😀'.repeat(700) });
    await expect(submitLetter(guest, 'device', { ...letter(), content: '😀'.repeat(701) })).rejects.toMatchObject({ status: 400 });
    await expect(submitLetter(guest, 'device', { ...letter(), consentToPublish: false })).rejects.toMatchObject({ status: 400 });
    await expect(submitLetter(guest, 'device', { ...letter(), nickname: '두\n줄' })).rejects.toMatchObject({ status: 400 });
  });
  it('permits admin moderation but protects original content and guest status', async () => {
    const input = letter(); await submitLetter(guest, 'device', input);
    const reviewed = await reviewLetter(operator, input.submissionKey, { status: 'approved', published_content: '검토 후 공개하는 문장입니다.', publish_order: 1 });
    expect(reviewed.status).toBe('approved'); expect(reviewed.content).toBe(input.content);
    await assertFails(updateDoc(doc(guest, 'letters', input.submissionKey), { status: 'approved', reviewed_at: serverTimestamp() }));
    await assertFails(updateDoc(doc(operator, 'letters', input.submissionKey), { content: '원문을 덮어쓰면 안 됩니다.', reviewed_at: serverTimestamp() }));
  });
  it('cannot self-assign admin or list admin identities', async () => {
    await assertFails(setDoc(doc(guest, 'admins', 'device'), { enabled: true }));
    await assertFails(getDocs(collection(guest, 'admins')));
    await assertFails(setDoc(doc(guest, 'settings', 'event'), { phase: 'A', updated_at: serverTimestamp() }));
  });
  it('closes submission in phases B/C but still permits receipt replay and admin review', async () => {
    const input = letter(); await submitLetter(guest, 'device', input);
    for (const phase of ['B', 'C'] as const) {
      await setEvent(operator, phase);
      await expect(submitLetter(guest, 'device', letter())).rejects.toMatchObject({ code: 'permission-denied' });
      expect((await submitLetter(guest, 'device', input)).replayed).toBe(true);
      await expect(submitTyping(guest, 'device', result())).rejects.toMatchObject({ code: 'permission-denied' });
    }
    await assertSucceeds(reviewLetter(operator, input.submissionKey, { status: 'rejected' }));
  });
  it('enforces the 600/device/minute limit and allows a new window', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'rateLimits', 'device'), { window_start: Timestamp.now(), count: 600, last_write_at: Timestamp.now(), last_event_id: crypto.randomUUID(), kind: 'letter' });
    });
    await expect(submitLetter(guest, 'device', letter())).rejects.toMatchObject({ status: 429 });
    await env.withSecurityRulesDisabled(async ctx => {
      await updateDoc(doc(ctx.firestore(), 'rateLimits', 'device'), { window_start: Timestamp.fromMillis(Date.now() - 65000) });
    });
    await assertSucceeds(submitLetter(guest, 'device', letter()));
    expect((await getDoc(doc(guest, 'rateLimits', 'device'))).data()?.count).toBe(1);
  });
  it('pages through more than 1,500 private letters without losing data', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      for (let offset = 0; offset < 1505; offset += 400) {
        const batch = writeBatch(ctx.firestore() as unknown as Firestore);
        for (let i = offset; i < Math.min(offset + 400, 1505); i++) {
          const id = crypto.randomUUID(); batch.set(doc(ctx.firestore(), 'letters', id), { id, content: `테스트 ${i}`, status: 'pending', created_at: Timestamp.now() });
        }
        await batch.commit();
      }
    });
    expect(await readLetters(operator)).toHaveLength(1505);
  });
});

describe('typing records, review and prize permissions', () => {
  it('stores floor-zero practice records and deduplicates retries', async () => {
    const input = result();
    await submitTyping(guest, 'device', input);
    expect((await submitTyping(guest, 'device', input)).replayed).toBe(true);
    const saved = (await getDoc(doc(operator, 'typingResults', input.id))).data()!;
    expect(saved.score).toBe(0); expect(saved.verificationStatus).toBe('pending'); expect(saved.received_at).toBeInstanceOf(Timestamp);
    await assertFails(getDoc(doc(guest, 'typingResults', input.id)));
    await assertFails(updateDoc(doc(guest, 'typingResults', input.id), { score: 9999 }));
  });
  it.each([12345, 54321.125, 8700000 / 145.5])('accepts elapsed time %s and rounding boundaries', async elapsedMs => {
      const input = result(); Object.assign(input, { elapsedMs, errors: 0, ...calculateScore(145, elapsedMs, 0) });
      await assertSucceeds(submitTyping(guest, 'device', input));
  });
  it('rejects forged scores, unknown challenges and client prize claims', async () => {
    await expect(submitTyping(guest, 'device', { ...result(), score: 99 })).rejects.toMatchObject({ status: 400 });
    await expect(submitTyping(guest, 'device', { ...result(), challengeId: 'unknown' })).rejects.toMatchObject({ status: 400 });
    await expect(submitTyping(guest, 'device', { ...result(), prizeReceived: true })).rejects.toMatchObject({ status: 400 });
  });
  it('security rules independently reject score and verification forgery', async () => {
    for (const patch of [{ score: -15 }, { score: 9999 }, { speed: 200 }, { elapsedMs: 0 }, { errors: -1 }, { verificationStatus: 'verified' }, { prizeReceived: true }, { practice: false }, { challengeId: 'unknown' }]) {
      await assertFails(rawWrite(guest, 'typing', patch));
    }
  });
  it('operator can verify/exclude but cannot award practice prizes or rewrite score', async () => {
    const input = result(); await submitTyping(guest, 'device', input);
    await assertSucceeds(reviewTyping(operator, input.id, { verificationStatus: 'verified' }));
    await assertFails(reviewTyping(operator, input.id, { prizeReceived: true }));
    await assertFails(updateDoc(doc(operator, 'typingResults', input.id), { score: 99, reviewed_at: serverTimestamp() }));
    await assertSucceeds(reviewTyping(operator, input.id, { verificationStatus: 'rejected' }));
  });
  it('lets operators recover queued typing records after public submission closes', async () => {
    await setEvent(operator, 'B');
    await assertSucceeds(submitTyping(operator, 'operator', result()));
    await expect(submitTyping(guest, 'device', result())).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
