import { readFile } from 'node:fs/promises';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { validateBackup, restoreBackup } from './firebase-backup.mjs';
const args = process.argv.slice(2);
const file = args[0];
const project = args[args.indexOf('--project') + 1];
if (!file || !args.includes('--project') || !project || project.startsWith('--')) throw new Error('Usage: npm run backup:restore -- backup.json --project EMPTY_RECOVERY_PROJECT [--execute]');
const input = JSON.parse(await readFile(file, 'utf8'));
const records = validateBackup(input);
console.log(`Validated ${records.length} documents. Source: ${input.projectId}; target: ${project}.`);
if (!args.includes('--execute')) console.log('Dry run only. Add --execute to create documents in an empty target. Auth accounts/admin roles are NOT included.');
else {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator && !/^127\.0\.0\.1:\d+$/.test(emulator)) throw new Error('Only loopback emulator hosts are allowed.');
  const app = initializeApp({ projectId: project, ...(emulator ? {} : { credential: applicationDefault() }) });
  console.log(`Restored ${await restoreBackup(getFirestore(app), input)} documents. Configure Auth, admin roles and deploy security rules separately before using the recovery project.`);
}
