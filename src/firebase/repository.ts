import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, Timestamp, updateDoc, writeBatch, type DocumentSnapshot, type Firestore } from 'firebase/firestore';
import type { EventConfig, Letter, TypingResult } from '../shared/types';
import { normalizeText, unicodeLength, UUID_PATTERN, validateSubmission } from '../shared/validation';
import { calculateScore } from '../typing/scoring';
import { CHALLENGE } from '../typing/challenge';
import { ClientError, withDeadline } from './errors';

export const RATE_LIMIT = 600;
export const PAGE_SIZE = 100;

export async function payloadHash(payload: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Receipt + rate counter + immutable record commit atomically. Receipts never contain private input. */
async function createOnce(db: Firestore, uid: string, id: string, kind: 'letter' | 'typing', payload: Record<string, unknown>) {
  const hash = await payloadHash(payload);
  return withDeadline(runTransaction(db, async tx => {
    const receiptRef = doc(db, 'receipts', id);
    const receipt = await tx.get(receiptRef);
    if (receipt.exists()) {
      if (receipt.data().payload_hash !== hash || receipt.data().kind !== kind) throw new ClientError('동일 접수번호에 다른 내용이 연결되어 있습니다. 원래 내용으로 재시도해 주세요.', 409, 'KEY_CONFLICT');
      return { id, replayed: true };
    }
    const rateRef = doc(db, 'rateLimits', uid);
    const rate = await tx.get(rateRef);
    const previous = rate.data();
    const currentWindow = previous?.window_start instanceof Timestamp && Date.now() - previous.window_start.toMillis() < 60000;
    if (currentWindow && Number(previous?.count) >= RATE_LIMIT) throw new ClientError('이 기기의 제출 요청이 많습니다. 1분 후 다시 시도해 주세요.', 429, 'RATE_LIMITED');
    tx.set(rateRef, {
      window_start: currentWindow ? previous!.window_start : serverTimestamp(),
      count: currentWindow ? Number(previous!.count) + 1 : 1,
      last_write_at: serverTimestamp(), last_event_id: id, kind,
    });
    tx.set(receiptRef, { id, owner_uid: uid, kind, payload_hash: hash, created_at: serverTimestamp() });
    tx.set(doc(db, kind === 'letter' ? 'letters' : 'typingResults', id), { ...payload, owner_uid: uid, [kind === 'letter' ? 'created_at' : 'received_at']: serverTimestamp() });
    return { id, replayed: false };
  }));
}

export async function submitLetter(db: Firestore, uid: string, input: unknown) {
  const { value, error } = validateSubmission(input);
  if (!value) throw new ClientError(error!, 400, 'VALIDATION_FAILED');
  const payload = {
    id: value.submissionKey, nickname: value.nickname || null, content: value.content, published_content: null,
    consent_to_publish: 1, status: 'pending', publish_order: null, submission_key: value.submissionKey, reviewed_at: null,
  };
  return createOnce(db, uid, value.submissionKey, 'letter', payload);
}

export function validateTypingResult(input: TypingResult): void {
  if (!UUID_PATTERN.test(input.id) || !normalizeText(input.participantId) || !normalizeText(input.displayName)
    || unicodeLength(input.participantId) > 30 || unicodeLength(input.displayName) > 30
    || input.challengeId !== CHALLENGE.challengeId || input.practice !== CHALLENGE.practice
    || input.prizeReceived || !Number.isFinite(Date.parse(input.completedAt))
    || input.elapsedMs > 3600000) throw new ClientError('타자 기록의 형식을 확인해 주세요.', 400, 'INVALID_RESULT');
  const computed = calculateScore(CHALLENGE.referenceKeystrokes, input.elapsedMs, input.errors);
  if (input.speed !== computed.speed || input.score !== computed.score) throw new ClientError('타수와 최종 점수 계산이 일치하지 않습니다.', 400, 'INVALID_SCORE');
}

export async function submitTyping(db: Firestore, uid: string, result: TypingResult) {
  validateTypingResult(result);
  const payload = {
    id: result.id, participantId: normalizeText(result.participantId), displayName: normalizeText(result.displayName),
    challengeId: result.challengeId, elapsedMs: result.elapsedMs, speed: result.speed, errors: result.errors,
    score: result.score, completedAt: result.completedAt, prizeReceived: false, practice: result.practice,
    verificationStatus: 'pending', reviewed_at: null,
  };
  return createOnce(db, uid, result.id, 'typing', payload);
}

export const dateString = (value: unknown): string => value instanceof Timestamp ? value.toDate().toISOString() : typeof value === 'string' ? value : '';

export async function allDocuments(db: Firestore, name: string) {
  const documents: DocumentSnapshot[] = [];
  let cursor: DocumentSnapshot | undefined;
  while (true) {
    const page = await withDeadline(getDocs(query(collection(db, name), orderBy('__name__'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE))));
    documents.push(...page.docs);
    if (page.docs.length < PAGE_SIZE) return documents;
    cursor = page.docs.at(-1);
  }
}

export async function readLetters(db: Firestore): Promise<Letter[]> {
  return (await allDocuments(db, 'letters')).map(decodeLetter);
}

function decodeLetter(snapshot: DocumentSnapshot): Letter {
  const data = snapshot.data()!;
  return { id: snapshot.id, nickname: data.nickname, content: data.content, published_content: data.published_content,
    consent_to_publish: data.consent_to_publish, status: data.status, publish_order: data.publish_order,
    submission_key: data.submission_key, created_at: dateString(data.created_at), reviewed_at: data.reviewed_at ? dateString(data.reviewed_at) : null } as Letter;
}

export async function readTyping(db: Firestore): Promise<TypingResult[]> {
  return (await allDocuments(db, 'typingResults')).map(snapshot => {
    const data = snapshot.data()!;
    return { id: snapshot.id, participantId: data.participantId, displayName: data.displayName, challengeId: data.challengeId,
      elapsedMs: data.elapsedMs, speed: data.speed, errors: data.errors, score: data.score, completedAt: data.completedAt,
      practice: data.practice, prizeReceived: data.prizeReceived, verificationStatus: data.verificationStatus,
      receivedAt: dateString(data.received_at), reviewedAt: data.reviewed_at ? dateString(data.reviewed_at) : null } as TypingResult;
  });
}

export async function reviewLetter(db: Firestore, id: string, patch: Record<string, unknown>) {
  if (!UUID_PATTERN.test(id) || Object.keys(patch).some(key => !['status', 'published_content', 'publish_order'].includes(key))) throw new ClientError('원문과 접수 정보는 수정할 수 없습니다.', 400);
  const content = typeof patch.published_content === 'string' ? normalizeText(patch.published_content) || null : patch.published_content;
  if (content != null && (typeof content !== 'string' || unicodeLength(content) > 700)) throw new ClientError('공개용 본문은 700자 이내로 작성해 주세요.', 400);
  const updates = { ...patch, ...('published_content' in patch ? { published_content: content } : {}), reviewed_at: serverTimestamp() };
  await withDeadline(updateDoc(doc(db, 'letters', id), updates));
  return decodeLetter(await withDeadline(getDoc(doc(db, 'letters', id))));
}

export async function reviewTyping(db: Firestore, id: string, patch: { prizeReceived?: boolean; verificationStatus?: 'pending' | 'verified' | 'rejected' }) {
  if (!UUID_PATTERN.test(id)) throw new ClientError('기록 ID가 올바르지 않습니다.', 400);
  await withDeadline(updateDoc(doc(db, 'typingResults', id), { ...patch, reviewed_at: serverTimestamp() }));
}

export async function readEvent(db: Firestore): Promise<EventConfig> {
  const snapshot = await withDeadline(getDoc(doc(db, 'settings', 'event')));
  const phase = snapshot.data()?.phase;
  if (!['A', 'B', 'C'].includes(phase)) throw new ClientError('Firebase 초기 설정이 필요합니다. 관리자에게 행사 설정과 대회 문구 등록을 요청해 주세요.', 503, 'SETUP_REQUIRED');
  return { phase, typingEnabled: phase === 'A', submissionsEnabled: phase === 'A', backend: 'firebase' };
}

export async function setEvent(db: Firestore, phase: EventConfig['phase']) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'challenges', CHALLENGE.challengeId), { text: CHALLENGE.text, referenceKeystrokes: CHALLENGE.referenceKeystrokes, practice: CHALLENGE.practice, enabled: true });
  batch.set(doc(db, 'settings', 'event'), { phase, updated_at: serverTimestamp() });
  await withDeadline(batch.commit());
}
