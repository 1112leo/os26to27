import { Timestamp } from 'firebase-admin/firestore';

export const COLLECTIONS = ['letters', 'typingResults', 'receipts', 'settings', 'challenges'];
export function decode(value) {
  if (value && typeof value === 'object' && value.__firestoreTimestamp === true) {
    if (!Number.isInteger(value.seconds) || !Number.isInteger(value.nanoseconds) || value.nanoseconds < 0 || value.nanoseconds >= 1e9) throw new Error('Invalid timestamp');
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  return value;
}
export function validateBackup(input) {
  if (input?.schemaVersion !== 2 || input.backend !== 'firebase' || !input.collections || typeof input.collections !== 'object'
    || Object.keys(input.collections).some(name => !COLLECTIONS.includes(name)) || COLLECTIONS.some(name => !Array.isArray(input.collections[name]))) throw new Error('Expected private Firebase schemaVersion 2 backup.');
  const entries = [];
  for (const name of COLLECTIONS) {
    const seen = new Set();
    for (const record of input.collections[name]) {
      if (!record || typeof record.id !== 'string' || !record.id || record.id.includes('/') || seen.has(record.id) || !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) throw new Error(`Invalid/duplicate record: ${name}`);
      seen.add(record.id); entries.push({ path: `${name}/${record.id}`, data: decode(record.data) });
    }
  }
  return entries;
}
export async function restoreBackup(db, input) {
  const entries = validateBackup(input);
  // Check the ENTIRE target before creating anything. Never overwrite live data.
  for (const name of COLLECTIONS) if (!(await db.collection(name).limit(1).get()).empty) throw new Error(`Target ${name} is not empty. Use a separate empty recovery database/project.`);
  for (let offset = 0; offset < entries.length; offset += 400) {
    const batch = db.batch();
    for (const entry of entries.slice(offset, offset + 400)) batch.create(db.doc(entry.path), entry.data);
    await batch.commit();
  }
  return entries.length;
}
