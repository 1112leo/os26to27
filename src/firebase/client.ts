import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { browserLocalPersistence, browserSessionPersistence, connectAuthEmulator, initializeAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { ClientError, withDeadline } from './errors';

export interface FirebaseClients { deviceAuth: Auth; adminAuth: Auth; deviceDb: Firestore; adminDb: Firestore; emulator: boolean; projectId: string; }
let clients: Promise<FirebaseClients> | null = null;
let anonymousLogin: Promise<string> | null = null;

async function initialize(): Promise<FirebaseClients> {
  const emulator = import.meta.env.VITE_FIREBASE_EMULATORS === 'true';
  let config: FirebaseOptions;
  if (emulator) {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw new ClientError('에뮬레이터는 로컬 개발 주소에서만 사용할 수 있습니다.');
    config = { apiKey: 'demo-ohsung-key', projectId: 'demo-ohsung', authDomain: 'demo-ohsung.firebaseapp.com', appId: '1:123456789:web:demo-ohsung' };
  } else {
    const response = await fetch(`${import.meta.env.BASE_URL}firebase-config.json`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    config = await response.json() as FirebaseOptions;
    if (!response.ok || !config.apiKey || !config.projectId || !config.appId) throw new ClientError('아직 저장 서버가 연결되지 않았습니다. 운영진에게 알려 주세요.', 503, 'FIREBASE_NOT_CONFIGURED');
  }
  const suffix = `${config.projectId}-${emulator ? 'local' : 'cloud'}`;
  const deviceApp = initializeApp(config, `ohsung-device-${suffix}`);
  const adminApp = initializeApp(config, `ohsung-admin-${suffix}`);
  const deviceAuth = initializeAuth(deviceApp, { persistence: browserLocalPersistence });
  const adminAuth = initializeAuth(adminApp, { persistence: browserSessionPersistence });
  const deviceDb = getFirestore(deviceApp);
  const adminDb = getFirestore(adminApp);
  if (emulator) {
    connectAuthEmulator(deviceAuth, 'http://127.0.0.1:9098', { disableWarnings: true });
    connectAuthEmulator(adminAuth, 'http://127.0.0.1:9098', { disableWarnings: true });
    connectFirestoreEmulator(deviceDb, '127.0.0.1', 8088);
    connectFirestoreEmulator(adminDb, '127.0.0.1', 8088);
  }
  return { deviceAuth, adminAuth, deviceDb, adminDb, emulator, projectId: config.projectId! };
}

export function getClients(): Promise<FirebaseClients> {
  if (!clients) clients = initialize().catch(error => { clients = null; throw error; });
  return clients;
}

export async function deviceIdentity() {
  const { deviceAuth, deviceDb } = await getClients();
  await deviceAuth.authStateReady();
  if (deviceAuth.currentUser) return { uid: deviceAuth.currentUser.uid, db: deviceDb };
  if (!anonymousLogin) anonymousLogin = withDeadline(signInAnonymously(deviceAuth).then(result => result.user.uid)).finally(() => { anonymousLogin = null; });
  return { uid: await anonymousLogin, db: deviceDb };
}
