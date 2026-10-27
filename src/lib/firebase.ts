import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  initializeAuth,
  signInAnonymously,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  doc,
  getDoc,
  type Firestore,
} from 'firebase/firestore';

// 연결과 오류 처리
export class ClientError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = 'UNKNOWN',
  ) {
    super(message);
  }
}

export function firebaseError(error: unknown): ClientError {
  if (error instanceof ClientError) return error;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found')
  )
    return new ClientError('이메일 또는 비밀번호를 확인해 주세요.', 401, code);
  if (code.includes('too-many-requests'))
    return new ClientError('로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429, code);
  if (code.includes('permission-denied'))
    return new ClientError(
      '저장 권한, 행사 운영 상태 또는 요청 제한을 확인해 주세요. 입력 내용은 유지됩니다.',
      403,
      code,
    );
  if (code.includes('operation-not-allowed'))
    return new ClientError(
      'Firebase에서 익명 인증과 이메일/비밀번호 인증을 활성화해 주세요.',
      503,
      code,
    );
  if (code.includes('unavailable') || code.includes('network') || code.includes('deadline'))
    return new ClientError(
      'Firebase에 연결하지 못했습니다. 입력 내용은 유지되며 같은 요청으로 재시도할 수 있습니다.',
      503,
      code,
    );
  return new ClientError(
    error instanceof Error ? error.message : '처리에 실패했습니다. 다시 시도해 주세요.',
    500,
    code || 'UNKNOWN',
  );
}

export async function withDeadline<T>(promise: Promise<T>, milliseconds = 20000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new ClientError(
                '응답 확인 시간이 초과되었습니다. 내용은 유지됩니다. 같은 요청으로 재시도해 주세요.',
                503,
                'DEADLINE',
              ),
            ),
          milliseconds,
        );
      }),
    ]);
  } catch (error) {
    throw firebaseError(error);
  } finally {
    clearTimeout(timeout);
  }
}

export const errorMessage = (error: unknown) => firebaseError(error).message;

// 일반 참가자는 기기별 익명 계정, 운영진은 별도 세션을 사용합니다.

export interface FirebaseClients {
  deviceAuth: Auth;
  adminAuth: Auth;
  deviceDb: Firestore;
  adminDb: Firestore;
  emulator: boolean;
  projectId: string;
}
let clients: Promise<FirebaseClients> | null = null;
let anonymousLogin: Promise<string> | null = null;

async function initialize(): Promise<FirebaseClients> {
  const emulator = import.meta.env.VITE_FIREBASE_EMULATORS === 'true';
  let config: FirebaseOptions;
  if (emulator) {
    if (!['localhost', '127.0.0.1'].includes(location.hostname))
      throw new ClientError('에뮬레이터는 로컬 개발 주소에서만 사용할 수 있습니다.');
    config = {
      apiKey: 'demo-ohsung-key',
      projectId: 'demo-ohsung',
      authDomain: 'demo-ohsung.firebaseapp.com',
      appId: '1:123456789:web:demo-ohsung',
    };
  } else {
    const response = await fetch(`${import.meta.env.BASE_URL}firebase-config.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    config = (await response.json()) as FirebaseOptions;
    if (!response.ok || !config.apiKey || !config.projectId || !config.appId)
      throw new ClientError(
        '아직 저장 서버가 연결되지 않았습니다. 운영진에게 알려 주세요.',
        503,
        'FIREBASE_NOT_CONFIGURED',
      );
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
    // 로컬 DB를 재시작하면 이전 계정이 사라질 수 있어 만료된 로컬 세션만 정리합니다.
    await Promise.all(
      [deviceAuth, adminAuth].map(async (auth) => {
        await auth.authStateReady();
        try {
          await auth.currentUser?.getIdToken(true);
        } catch (error) {
          const code = (error as { code?: string }).code ?? '';
          if (
            [
              'auth/invalid-refresh-token',
              'auth/user-token-expired',
              'auth/user-not-found',
            ].includes(code)
          )
            await signOut(auth);
          else throw error;
        }
      }),
    );
  }
  return { deviceAuth, adminAuth, deviceDb, adminDb, emulator, projectId: config.projectId! };
}

export function getClients(): Promise<FirebaseClients> {
  if (!clients)
    clients = initialize().catch((error) => {
      clients = null;
      throw error;
    });
  return clients;
}

export async function deviceIdentity() {
  const { deviceAuth, deviceDb } = await getClients();
  await deviceAuth.authStateReady();
  if (deviceAuth.currentUser) return { uid: deviceAuth.currentUser.uid, db: deviceDb };
  if (!anonymousLogin)
    anonymousLogin = withDeadline(
      signInAnonymously(deviceAuth).then((result) => result.user.uid),
    ).finally(() => {
      anonymousLogin = null;
    });
  return { uid: await anonymousLogin, db: deviceDb };
}

// 운영진 인증: admins/{uid}.enabled 역할은 콘솔에서만 부여합니다.

export interface AdminSession {
  authenticated: boolean;
  uid?: string;
  email?: string;
}
export async function adminSession(): Promise<AdminSession> {
  const { adminAuth, adminDb } = await getClients();
  await adminAuth.authStateReady();
  const user = adminAuth.currentUser;
  if (!user) return { authenticated: false };
  const role = await withDeadline(getDoc(doc(adminDb, 'admins', user.uid)));
  return {
    authenticated: role.data()?.enabled === true,
    uid: user.uid,
    email: user.email ?? undefined,
  };
}
export async function adminContext() {
  const session = await adminSession();
  if (!session.authenticated || !session.uid)
    throw new ClientError('관리자 로그인이 필요합니다.', 401, 'UNAUTHENTICATED');
  return { uid: session.uid, db: (await getClients()).adminDb };
}
export async function loginAdmin(email: string, password: string) {
  const { adminAuth } = await getClients();
  await withDeadline(signInWithEmailAndPassword(adminAuth, email.trim(), password));
  const session = await adminSession();
  if (!session.authenticated) {
    await signOut(adminAuth);
    throw new ClientError(
      `이 계정에 관리자 권한이 없습니다. 운영진이 관리자 UID를 등록해야 합니다. (${session.uid})`,
      403,
      'NOT_ADMIN',
    );
  }
  return session;
}
export async function logoutAdmin() {
  await signOut((await getClients()).adminAuth);
  return { authenticated: false };
}
export async function watchAdminSession(
  onChange: (session: AdminSession) => void,
  onError: (error: unknown) => void,
) {
  const { adminAuth } = await getClients();
  let sequence = 0;
  return onIdTokenChanged(adminAuth, () => {
    const current = ++sequence;
    onChange({ authenticated: false });
    void adminSession()
      .then((session) => {
        if (current === sequence) onChange(session);
      })
      .catch((error) => {
        if (current === sequence) onError(error);
      });
  });
}
