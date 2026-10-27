import {
  deleteApp,
  initializeApp,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  initializeAuth,
  signInAnonymously,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  deleteUser,
  inMemoryPersistence,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  connectFirestoreEmulator,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
export class ClientError extends Error {
  constructor(message, status = 0, code = 'UNKNOWN') {
    super(message);
    this.name = 'ClientError';
    this.status = status;
    this.code = code;
  }
}
export function firebaseError(error) {
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
  if (code.includes('weak-password') || code.includes('password-does-not-meet-requirements'))
    return new ClientError('새 비밀번호가 너무 약합니다. 12자 이상으로 입력해 주세요.', 400, code);
  if (code.includes('email-already-in-use'))
    return new ClientError(
      '이미 사용 중인 이메일입니다. 다른 이메일을 사용하거나 기존 계정 UID로 권한을 추가해 주세요.',
      409,
      code,
    );
  if (code.includes('invalid-email'))
    return new ClientError('이메일 형식을 확인해 주세요.', 400, code);
  if (code.includes('requires-recent-login'))
    return new ClientError('다시 로그인한 뒤 계정 변경을 시도해 주세요.', 401, code);
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
export async function withDeadline(promise, milliseconds = 20000) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
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
export const errorMessage = (error) => firebaseError(error).message;
let clients = null;
let anonymousLogin = null;
async function initialize() {
  const emulator =
    ['localhost', '127.0.0.1'].includes(location.hostname) &&
    new URLSearchParams(location.search).get('emulator') === '1';
  let config;
  if (emulator) {
    config = {
      apiKey: 'demo-ohsung-key',
      projectId: 'demo-ohsung',
      authDomain: 'demo-ohsung.firebaseapp.com',
      appId: '1:123456789:web:demo-ohsung',
    };
  } else {
    const response = await fetch(new URL('./firebase-config.json', import.meta.url), {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    config = response.ok ? await response.json() : {};
    if (!config.apiKey || !config.projectId || !config.appId)
      throw new ClientError(
        '아직 저장 서버가 연결되지 않았습니다. 운영진에게 알려 주세요.',
        503,
        'FIREBASE_NOT_CONFIGURED',
      );
  }
  const suffix = `${config.projectId}-${emulator ? 'local' : 'cloud'}`;
  const deviceApp = initializeApp(config, `ohsung-device-${suffix}`);
  const adminApp = initializeApp(config, `ohsung-admin-${suffix}`);
  const deviceAuth = initializeAuth(deviceApp, {
    persistence: browserLocalPersistence,
  });
  const adminAuth = initializeAuth(adminApp, {
    persistence: browserSessionPersistence,
  });
  const deviceDb = getFirestore(deviceApp);
  const adminDb = getFirestore(adminApp);
  if (emulator) {
    connectAuthEmulator(deviceAuth, 'http://127.0.0.1:9098', {
      disableWarnings: true,
    });
    connectAuthEmulator(adminAuth, 'http://127.0.0.1:9098', {
      disableWarnings: true,
    });
    connectFirestoreEmulator(deviceDb, '127.0.0.1', 8088);
    connectFirestoreEmulator(adminDb, '127.0.0.1', 8088);
    await Promise.all(
      [deviceAuth, adminAuth].map(async (auth) => {
        await auth.authStateReady();
        try {
          await auth.currentUser?.getIdToken(true);
        } catch (error) {
          const code = error.code ?? '';
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
  return {
    deviceAuth,
    adminAuth,
    deviceDb,
    adminDb,
    emulator,
    projectId: config.projectId,
  };
}
export function getClients() {
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
  if (deviceAuth.currentUser)
    return {
      uid: deviceAuth.currentUser.uid,
      db: deviceDb,
    };
  if (!anonymousLogin)
    anonymousLogin = withDeadline(
      signInAnonymously(deviceAuth).then((result) => result.user.uid),
    ).finally(() => {
      anonymousLogin = null;
    });
  return {
    uid: await anonymousLogin,
    db: deviceDb,
  };
}
export async function adminSession() {
  const { adminAuth, adminDb } = await getClients();
  await adminAuth.authStateReady();
  const user = adminAuth.currentUser;
  if (!user)
    return {
      authenticated: false,
    };
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
  return {
    uid: session.uid,
    db: (await getClients()).adminDb,
  };
}
export async function loginAdmin(email, password) {
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
  return {
    authenticated: false,
  };
}
async function reauthenticateAdmin(password) {
  await adminContext();
  const user = (await getClients()).adminAuth.currentUser;
  if (!user.email) throw new ClientError('이메일 계정으로 다시 로그인해 주세요.', 401);
  await withDeadline(
    reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password)),
  );
  return user;
}
export async function changeAdminPassword(currentPassword, nextPassword) {
  if (nextPassword.length < 12)
    throw new ClientError('새 비밀번호는 12자 이상으로 입력해 주세요.', 400);
  await withDeadline(updatePassword(await reauthenticateAdmin(currentPassword), nextPassword));
}
export async function changeAdminEmail(currentPassword, email) {
  await withDeadline(
    verifyBeforeUpdateEmail(await reauthenticateAdmin(currentPassword), email.trim()),
  );
}
export async function resetAdminPassword(email) {
  await withDeadline(sendPasswordResetEmail((await getClients()).adminAuth, email.trim()));
}
export async function createOperator(email, password) {
  const { db } = await adminContext();
  if (password.length < 12)
    throw new ClientError('초기 비밀번호는 12자 이상으로 입력해 주세요.', 400);
  const clients = await getClients();
  const app = initializeApp(
    clients.adminDb.app.options,
    `ohsung-new-operator-${crypto.randomUUID()}`,
  );
  const auth = initializeAuth(app, {
    persistence: inMemoryPersistence,
  });
  if (clients.emulator)
    connectAuthEmulator(auth, 'http://127.0.0.1:9098', {
      disableWarnings: true,
    });
  try {
    const { user } = await withDeadline(
      createUserWithEmailAndPassword(auth, email.trim(), password),
    );
    try {
      await withDeadline(
        setDoc(doc(db, 'admins', user.uid), {
          enabled: true,
          email: email.trim(),
          created_at: serverTimestamp(),
        }),
      );
    } catch (error) {
      const role = await withDeadline(getDoc(doc(db, 'admins', user.uid)));
      if (role.data()?.enabled !== true) {
        await deleteUser(user);
        throw error;
      }
    }
    return user.uid;
  } finally {
    await signOut(auth);
    await deleteApp(app);
  }
}
export async function watchAdminSession(onChange, onError) {
  const { adminAuth } = await getClients();
  let sequence = 0;
  let previousUid = null;
  return onIdTokenChanged(adminAuth, (user) => {
    const current = ++sequence;
    if (!user || user.uid !== previousUid)
      onChange({
        authenticated: false,
      });
    previousUid = user?.uid ?? null;
    void adminSession()
      .then((session) => {
        if (current === sequence) onChange(session);
      })
      .catch((error) => {
        if (current === sequence) onError(error);
      });
  });
}

export {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
