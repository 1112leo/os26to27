import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { EventNotice, EventProvider, useEvent } from './EventProvider';
import { SessionProvider, useAdmin } from './SessionProvider';

export function Layout() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <SessionProvider>
      <EventProvider>
        <a href="#main" className="skip-link">
          본문으로 바로가기
        </a>
        <header className="site-header">
          <div className="header-inner">
            <Link className="brand" to="/">
              천안오성고 <span>OHSUNG · 2026 → 2027</span>
            </Link>
            <nav aria-label="주요 메뉴">
              <NavLink to="/typing">타자 대회</NavLink>
              <NavLink to="/write">후배에게 한마디</NavLink>
              <NavLink to="/welcome">신입생 환영</NavLink>
            </nav>
          </div>
        </header>
        <AdminBar />
        <main id="main" className="container">
          <Outlet />
        </main>
        <footer className="site-footer">
          <div className="container">
            <p>천안오성고등학교 행사 · 2027학년도 신입생을 기다리며</p>
            <div>
              <Link to="/typing/results">타자 기록 관리</Link>
              <Link to="/admin">관리자</Link>
            </div>
          </div>
        </footer>
      </EventProvider>
    </SessionProvider>
  );
}

function AdminBar() {
  const { session, logout } = useAdmin();
  if (!session.authenticated) return null;
  return (
    <div className="admin-bar container">
      <span>관리자 모드 · {session.email}</span>
      <button onClick={() => void logout()}>로그아웃</button>
    </div>
  );
}

export function HomePage() {
  const { config } = useEvent();
  return (
    <>
      <div className="page-heading home-heading">
        <p className="eyebrow">천안오성고등학교 행사</p>
        <h1>
          지금 우리의 이야기,
          <br />
          다음 오성에게.
        </h1>
        <p>
          함께 즐기는 타자 대회와 후배에게 전하는 학교 이야기.
          <br />두 가지 참여를 한곳에서 만나보세요.
        </p>
      </div>
      <EventNotice />
      <div className="booth-grid">
        <section className="panel booth">
          <p className="eyebrow">부스 01 · PC 키보드</p>
          <h2>타자 대회</h2>
          <p>
            같은 문구를 얼마나 빠르고 정확하게 칠 수 있을까요? 오타 하나에 20점 감점, 최저 점수는
            0점입니다.
          </p>
          <p className="muted">현재 임시 애국가 연습 문구를 운영합니다.</p>
          <Link className="button primary" to="/typing">
            {config?.typingEnabled ? '타자 대회 참여하기' : '타자 대회 안내 보기'} →
          </Link>
        </section>
        <section className="panel booth">
          <p className="eyebrow">부스 02 · 모바일 참여 가능</p>
          <h2>후배에게 한마디</h2>
          <p>
            학교의 좋은 점, 잊지 못할 순간, 꼭 전하고 싶은 응원. 2027학년도 신입생에게 이야기를 남겨
            주세요.
          </p>
          <p className="muted">10~700자 · 별명 선택 · 운영진 검토 후 공개</p>
          <Link className="button primary" to="/write">
            이야기 남기기 →
          </Link>
        </section>
      </div>
      <section className="panel">
        <p className="eyebrow">2027학년도 신입생에게</p>
        <h2>여러분의 새로운 시작을 응원합니다.</h2>
        <p>
          선배들의 이야기는 운영진 검토와 공개 준비가 끝난 뒤 신입생 페이지에서 만나볼 수 있습니다.
        </p>
        <Link to="/welcome">신입생 환영 페이지 →</Link>
      </section>
    </>
  );
}

export function NotFoundPage() {
  return (
    <section className="panel">
      <h1>페이지를 찾을 수 없습니다.</h1>
      <Link to="/">행사 메인으로 돌아가기</Link>
    </section>
  );
}
