import type { TypingResult, LocalTypingResult } from '../shared/types';
import { toCsv } from '../shared/csv';
import { rankResults } from './scoring';

// Legacy storage identifier is intentionally stable so existing local records survive rebranding.
const DB_NAME = 'osung-typing';
const STORE = 'results';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('기록 저장소를 열지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'));
    request.onblocked = () => reject(new Error('다른 탭을 닫고 다시 시도해 주세요.'));
  });
}

export async function saveResult(result: LocalTypingResult): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(result);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('기록을 저장하지 못했습니다. 결과를 내려받고 운영진에게 알려 주세요.'));
    });
  } finally { db.close(); }
}

export async function listResults(): Promise<LocalTypingResult[]> {
  const db = await openDatabase();
  try {
    return await new Promise<LocalTypingResult[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      tx.oncomplete = () => resolve(request.result as LocalTypingResult[]);
      tx.onerror = tx.onabort = () => reject(new Error('참가 기록을 읽지 못했습니다.'));
    });
  } finally { db.close(); }
}

export function resultsCsv(results: TypingResult[]): string {
  return toCsv([
    ['목록 순서', '참가번호', '표시 이름', '문구 버전', '소요 시간(ms)', '타수', '오타', '점수', '완료 시각(UTC)', '상품 수령', '연습 기록', '운영진 확인'],
    ...rankResults(results).map(r => [r.rank, r.participantId, r.displayName, r.challengeId, r.elapsedMs, r.speed, r.errors, r.score, r.completedAt, r.prizeReceived ? '수령' : '미수령', r.practice ? '연습' : '공식', r.verificationStatus ?? 'pending']),
  ]);
}
