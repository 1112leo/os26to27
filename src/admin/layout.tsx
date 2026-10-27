import { useState, type FormEvent } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAdmin } from '../components/SessionProvider';
import { errorMessage, resetAdminPassword } from '../lib/firebase';

export default function AdminLayout() {
  const auth = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await auth.login(email, password);
      setPassword('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!email.trim()) {
      setError('먼저 관리자 이메일을 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await resetAdminPassword(email);
      setMessage('등록된 이메일이면 비밀번호 재설정 안내가 전송됩니다. 메일함을 확인해 주세요.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  if (auth.loading) return <p role="status">관리자 인증을 확인하고 있습니다.</p>;
  if (!auth.session.authenticated)
    return (
      <>
        <div className="page-heading">
          <p className="eyebrow">운영진 전용</p>
          <h1>관리자 로그인</h1>
          <p>
            아이디는 관리자 계정의 이메일입니다. 로그인하면 글·타자 기록·행사 설정·계정을 관리할 수
            있습니다.
          </p>
        </div>
        <section className="panel login-panel">
          <form onSubmit={(event) => void login(event)}>
            <label>
              관리자 아이디 (이메일)
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                disabled={busy}
              />
            </label>
            <label>
              관리자 비밀번호
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={busy}
              />
            </label>
            {(error || auth.error) && (
              <p role="alert" className="error">
                {error || auth.error}
              </p>
            )}
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
            <div className="actions">
              <button className="primary" disabled={busy}>
                {busy ? '처리 중…' : '로그인'}
              </button>
              <button type="button" disabled={busy} onClick={() => void reset()}>
                비밀번호 재설정
              </button>
            </div>
          </form>
        </section>
      </>
    );
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">운영진 전용</p>
        <h1>관리자</h1>
        <p>{auth.session.email} 계정으로 로그인했습니다.</p>
      </div>
      <nav className="admin-nav" aria-label="관리자 메뉴">
        <NavLink to="/admin" end>
          글 관리
        </NavLink>
        <NavLink to="/admin/typing">타자 기록</NavLink>
        <NavLink to="/admin/settings">행사·문구 설정</NavLink>
        <NavLink to="/admin/account">관리자 계정</NavLink>
      </nav>
      <Outlet />
    </>
  );
}
