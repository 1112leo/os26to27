import { onIdTokenChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getClients } from './client';
import { ClientError, withDeadline } from './errors';

export interface AdminSession { authenticated: boolean; uid?: string; email?: string; }
export async function adminSession(): Promise<AdminSession> {
  const { adminAuth, adminDb } = await getClients();
  await adminAuth.authStateReady();
  const user = adminAuth.currentUser;
  if (!user) return { authenticated: false };
  const role = await withDeadline(getDoc(doc(adminDb, 'admins', user.uid)));
  return { authenticated: role.data()?.enabled === true, uid: user.uid, email: user.email ?? undefined };
}
export async function adminContext() {
  const session = await adminSession();
  if (!session.authenticated || !session.uid) throw new ClientError('관리자 로그인이 필요합니다.', 401, 'UNAUTHENTICATED');
  return { uid: session.uid, db: (await getClients()).adminDb };
}
export async function loginAdmin(email: string, password: string) {
  const { adminAuth } = await getClients();
  await withDeadline(signInWithEmailAndPassword(adminAuth, email.trim(), password));
  const session = await adminSession();
  if (!session.authenticated) {
    await signOut(adminAuth);
    throw new ClientError(`이 계정에 관리자 권한이 없습니다. 운영진이 관리자 UID를 등록해야 합니다. (${session.uid})`, 403, 'NOT_ADMIN');
  }
  return session;
}
export async function logoutAdmin() {
  await signOut((await getClients()).adminAuth);
  return { authenticated: false };
}
export async function watchAdminSession(onChange: (session: AdminSession) => void, onError: (error: unknown) => void) {
  const { adminAuth } = await getClients();
  let sequence = 0;
  return onIdTokenChanged(adminAuth, () => {
    const current = ++sequence;
    onChange({ authenticated: false });
    void adminSession().then(session => { if (current === sequence) onChange(session); }).catch(error => { if (current === sequence) onError(error); });
  });
}
