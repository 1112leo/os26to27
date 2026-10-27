import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAdmin } from '../components/SessionProvider';
import {
  adminContext,
  changeAdminEmail,
  changeAdminPassword,
  createOperator,
  errorMessage,
  withDeadline,
} from '../lib/firebase';

export default function AccountPage() {
  const auth = useAdmin();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [uid, setUid] = useState('');
  const [operators, setOperators] = useState<{ uid: string; email: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const { db } = await adminContext();
    const records = await withDeadline(getDocs(collection(db, 'admins')));
    setOperators(
      records.docs
        .filter((item) => item.data().enabled === true)
        .map((item) => ({
          uid: item.id,
          email:
            item.id === auth.session.uid ? (auth.session.email ?? '') : (item.data().email ?? ''),
        })),
    );
  }, [auth.session.uid, auth.session.email]);
  useEffect(() => {
    void load().catch((reason) => setError(errorMessage(reason)));
  }, [load]);
  async function action(work: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setMessage(await work());
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent, work: () => Promise<string>) {
    event.preventDefault();
    void action(work);
  }
  return (
    <>
      <h2>관리자 계정</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <section className="panel">
        <h3>내 로그인 정보</h3>
        <dl>
          <dt>아이디 (이메일)</dt>
          <dd>{auth.session.email}</dd>
          <dt>계정 UID</dt>
          <dd className="break-anywhere">{auth.session.uid}</dd>
        </dl>
        <p className="muted">
          비밀번호는 조회할 수 없습니다. 변경하려면 현재 비밀번호로 본인을 확인합니다.
        </p>
        <form
          onSubmit={(e) =>
            submit(e, async () => {
              if (password !== confirmation)
                throw new Error('새 비밀번호 확인이 일치하지 않습니다.');
              await changeAdminPassword(current, password);
              setCurrent('');
              setPassword('');
              setConfirmation('');
              return '비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용하세요.';
            })
          }
        >
          <label>
            현재 비밀번호
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
          <div className="form-grid">
            <label>
              새 비밀번호
              <input
                type="password"
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={busy}
              />
            </label>
            <label>
              새 비밀번호 확인
              <input
                type="password"
                minLength={12}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
                autoComplete="new-password"
                disabled={busy}
              />
            </label>
          </div>
          <button disabled={busy} className="primary">
            비밀번호 변경
          </button>
        </form>
        <hr />
        <form
          onSubmit={(e) =>
            submit(e, async () => {
              await changeAdminEmail(current, email);
              setCurrent('');
              setEmail('');
              return '새 이메일로 확인 메일을 보냈습니다. 링크에서 변경을 완료한 뒤 새 이메일로 다시 로그인하세요.';
            })
          }
        >
          <label>
            변경할 아이디 (이메일)
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={busy}
            />
          </label>
          <label>
            현재 비밀번호
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
          <button disabled={busy}>이메일 변경 확인 메일 보내기</button>
        </form>
      </section>
      <section className="panel">
        <div className="section-top">
          <h3>운영진 권한</h3>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await load();
                return '운영진 목록을 새로고침했습니다.';
              })
            }
          >
            새로고침
          </button>
        </div>
        <ul className="review-list">
          {operators.map((operator) => (
            <li key={operator.uid}>
              <strong>{operator.email || '기존 운영진'}</strong>
              <small className="break-anywhere">{operator.uid}</small>
              {operator.uid === auth.session.uid ? (
                <span className="badge">내 계정</span>
              ) : (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `${operator.email || operator.uid} 계정의 관리자 권한을 해제할까요?`,
                      )
                    )
                      return;
                    void action(async () => {
                      await withDeadline(
                        deleteDoc(doc((await adminContext()).db, 'admins', operator.uid)),
                      );
                      await load();
                      return '관리자 권한을 해제했습니다. 해당 계정은 더 이상 운영 자료에 접근할 수 없습니다.';
                    });
                  }}
                >
                  권한 해제
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="muted">
          현재 로그인한 계정의 권한은 해제할 수 없습니다. 권한 해제는 로그인 계정 자체와 기존 기록을
          지우지 않습니다.
        </p>
        <h3>운영진 추가</h3>
        <form
          onSubmit={(e) =>
            submit(e, async () => {
              if (uid.trim()) {
                if (uid.trim() === auth.session.uid)
                  throw new Error('현재 계정은 이미 관리자입니다.');
                await withDeadline(
                  setDoc(doc((await adminContext()).db, 'admins', uid.trim()), {
                    enabled: true,
                    email: newEmail.trim(),
                    created_at: serverTimestamp(),
                  }),
                );
              } else await createOperator(newEmail, newPassword);
              setNewEmail('');
              setNewPassword('');
              setUid('');
              await load();
              return '운영진을 추가했습니다. 해당 계정으로 관리자 페이지에 로그인할 수 있습니다.';
            })
          }
        >
          <label>
            추가할 운영진 이메일
            <input
              type="email"
              maxLength={254}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              disabled={busy}
              autoComplete="off"
            />
          </label>
          {!uid && (
            <label>
              초기 비밀번호 (12자 이상)
              <input
                type="password"
                minLength={12}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={busy}
                autoComplete="new-password"
              />
            </label>
          )}
          <details>
            <summary>이미 Firebase 로그인 계정이 있는 경우</summary>
            <label>
              기존 계정 UID
              <input
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                maxLength={128}
                disabled={busy}
                placeholder="기존 계정에 권한만 추가할 때 입력"
              />
            </label>
          </details>
          <button className="primary" disabled={busy}>
            {busy ? '처리 중…' : uid ? '기존 계정에 관리자 권한 추가' : '관리자 계정 만들기'}
          </button>
        </form>
      </section>
    </>
  );
}
