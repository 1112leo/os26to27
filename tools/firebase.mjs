// 로컬 에뮬레이터 초기화와 비공개 백업 복구. 브라우저 코드에서 가져오지 않습니다.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { CHALLENGE } from '../src/typing/challenge.ts';

export const COLLECTIONS = ['letters', 'typingResults', 'receipts', 'settings', 'challenges'];
export function decode(value) {
  if (value && typeof value === 'object' && value.__firestoreTimestamp === true) {
    if (
      !Number.isInteger(value.seconds) ||
      !Number.isInteger(value.nanoseconds) ||
      value.nanoseconds < 0 ||
      value.nanoseconds >= 1e9
    )
      throw new Error('Invalid timestamp');
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  return value;
}
export function validateBackup(input) {
  if (
    input?.schemaVersion !== 2 ||
    input.backend !== 'firebase' ||
    !input.collections ||
    typeof input.collections !== 'object' ||
    Object.keys(input.collections).some((name) => !COLLECTIONS.includes(name)) ||
    COLLECTIONS.some((name) => !Array.isArray(input.collections[name]))
  )
    throw new Error('Expected private Firebase schemaVersion 2 backup.');
  const entries = [];
  for (const name of COLLECTIONS) {
    const seen = new Set();
    for (const record of input.collections[name]) {
      if (
        !record ||
        typeof record.id !== 'string' ||
        !record.id ||
        record.id.includes('/') ||
        seen.has(record.id) ||
        !record.data ||
        typeof record.data !== 'object' ||
        Array.isArray(record.data)
      )
        throw new Error(`Invalid/duplicate record: ${name}`);
      seen.add(record.id);
      entries.push({ path: `${name}/${record.id}`, data: decode(record.data) });
    }
  }
  return entries;
}
export async function restoreBackup(db, input) {
  const entries = validateBackup(input);
  // Check the ENTIRE target before creating anything. Never overwrite live data.
  for (const name of COLLECTIONS)
    if (!(await db.collection(name).limit(1).get()).empty)
      throw new Error(
        `Target ${name} is not empty. Use a separate empty recovery database/project.`,
      );
  for (let offset = 0; offset < entries.length; offset += 400) {
    const batch = db.batch();
    for (const entry of entries.slice(offset, offset + 400))
      batch.create(db.doc(entry.path), entry.data);
    await batch.commit();
  }
  return entries.length;
}

async function seedEmulator() {
  // This command always targets loopback emulators. It cannot seed a live project.
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
  const app = initializeApp({ projectId: 'demo-ohsung' });
  const auth = getAuth(app);
  const email = 'admin@ohsung.test';
  const password = 'local-ohsung-2027'; // Public test credential; emulator ONLY.
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({ email, password });
  }
  const db = getFirestore(app);
  await db.doc(`admins/${user.uid}`).set({ enabled: true });
  await db.doc('settings/event').set({ phase: 'A', updated_at: FieldValue.serverTimestamp() });
  await db
    .doc(`challenges/${CHALLENGE.challengeId}`)
    .set({
      text: CHALLENGE.text,
      referenceKeystrokes: CHALLENGE.referenceKeystrokes,
      practice: CHALLENGE.practice,
      enabled: true,
    });
  console.log(`LOCAL emulator ready. Admin: ${email} / ${password}`);
}
async function main(args) {
  if (args[0] === 'seed') return seedEmulator();

  const file = args[0];
  const project = args[args.indexOf('--project') + 1];
  if (!file || !args.includes('--project') || !project || project.startsWith('--'))
    throw new Error(
      'Usage: npm run restore -- backup.json --project EMPTY_RECOVERY_PROJECT [--execute]',
    );
  const input = JSON.parse(await readFile(file, 'utf8'));
  const records = validateBackup(input);
  console.log(
    `Validated ${records.length} documents. Source: ${input.projectId}; target: ${project}.`,
  );
  if (!args.includes('--execute'))
    console.log(
      'Dry run only. Add --execute to create documents in an empty target. Auth accounts/admin roles are NOT included.',
    );
  else {
    const emulator = process.env.FIRESTORE_EMULATOR_HOST;
    if (emulator && !/^127\.0\.0\.1:\d+$/.test(emulator))
      throw new Error('Only loopback emulator hosts are allowed.');
    const app = initializeApp({
      projectId: project,
      ...(emulator ? {} : { credential: applicationDefault() }),
    });
    console.log(
      `Restored ${await restoreBackup(getFirestore(app), input)} documents. Configure Auth, admin roles and deploy security rules separately before using the recovery project.`,
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main(process.argv.slice(2));
