import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { CHALLENGE } from '../src/typing/challenge.ts';

// This command always targets loopback emulators. It cannot seed a live project.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
const app = initializeApp({ projectId: 'demo-ohsung' });
const auth = getAuth(app);
const email = 'admin@ohsung.test';
const password = 'local-ohsung-2027'; // Public test credential; emulator ONLY.
let user;
try { user = await auth.getUserByEmail(email); }
catch (error) { if (error.code !== 'auth/user-not-found') throw error; user = await auth.createUser({ email, password }); }
const db = getFirestore(app);
await db.doc(`admins/${user.uid}`).set({ enabled: true });
await db.doc('settings/event').set({ phase: 'A', updated_at: FieldValue.serverTimestamp() });
await db.doc(`challenges/${CHALLENGE.challengeId}`).set({ text: CHALLENGE.text, referenceKeystrokes: CHALLENGE.referenceKeystrokes, practice: CHALLENGE.practice, enabled: true });
console.log(`LOCAL emulator ready. Admin: ${email} / ${password}`);
