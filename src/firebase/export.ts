import { Timestamp } from 'firebase/firestore';
import { adminContext } from './admin';
import { allDocuments, readLetters } from './repository';
import { makePublicData } from '../shared/public-data';
import { toCsv } from '../shared/csv';

export function encodeFirestore(value: unknown): unknown {
  if (value instanceof Timestamp) return { __firestoreTimestamp: true, seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (Array.isArray(value)) return value.map(encodeFirestore);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeFirestore(item)]));
  return value;
}

export async function exportFirebase(scope: 'all' | 'public', format: 'json' | 'csv') {
  const { db } = await adminContext();
  let content: string;
  if (scope === 'public') content = JSON.stringify(makePublicData(await readLetters(db)), null, 2);
  else if (format === 'csv') {
    const letters = await readLetters(db);
    content = toCsv([
      ['ID', '별명', '원문', '공개용 본문', '공개 동의', '검수 상태', '공개 순서', '접수 키', '작성 시각(UTC)', '검수 시각(UTC)'],
      ...letters.map(letter => [letter.id, letter.nickname, letter.content, letter.published_content, letter.consent_to_publish, letter.status, letter.publish_order, letter.submission_key, letter.created_at, letter.reviewed_at]),
    ]);
  } else {
    const collections: Record<string, unknown> = {};
    for (const name of ['letters', 'typingResults', 'receipts', 'settings', 'challenges']) {
      collections[name] = (await allDocuments(db, name)).map(snapshot => ({ id: snapshot.id, data: encodeFirestore(snapshot.data()) }));
    }
    content = JSON.stringify({ schemaVersion: 2, backend: 'firebase', projectId: db.app.options.projectId, exportedAt: new Date().toISOString(), collections }, null, 2);
  }
  return { filename: `ohsung-${scope}-${new Date().toISOString().slice(0, 10)}.${format}`, content, mime: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' };
}
