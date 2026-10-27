import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Letter, ReviewStatus } from '../shared/types';
import { api, ClientError, errorMessage } from '../shared/api';
import { downloadFile, koreanDate } from '../shared/download';
import { unicodeLength } from '../shared/validation';
import { useAdmin } from './SessionContext';
import { exportFirebase } from '../firebase/export';
import { adminContext } from '../firebase/admin';
import { setEvent } from '../firebase/repository';
import { useEvent } from '../shared/EventContext';
import { Link } from 'react-router-dom';

type ListResponse = { letters: Letter[]; total: number; page: number; pageSize: number; stats: Partial<Record<ReviewStatus, number>> };
const labels = { pending: '검토 대기', approved: '공개 승인', rejected: '공개 제외' };

function ReviewEditor({ letter, onSave, onClose }: { letter: Letter; onSave: (patch: object) => Promise<void>; onClose: () => void }) {
  const [status, setStatus] = useState<ReviewStatus>(letter.status);
  const [published, setPublished] = useState(letter.published_content ?? '');
  const [order, setOrder] = useState(letter.publish_order?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await onSave({ status, published_content: published || null, publish_order: order === '' ? null : Number(order) }); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className="panel review-panel" aria-label="선택한 글 검수">
    <div className="section-top"><h2>글 검수 · {letter.nickname || '오성고 선배'}</h2><button disabled={busy} onClick={onClose}>닫기</button></div>
    <p className="muted">{koreanDate(letter.created_at)} · 공개 동의 {letter.consent_to_publish === 1 ? '완료' : '없음'}</p>
    <h3>제출 원문</h3><blockquote className="letter-content original">{letter.content}</blockquote>
    <form onSubmit={event => void submit(event)}>
      <label>공개용 본문<textarea rows={6} value={published} onChange={e => setPublished(e.target.value)} disabled={busy} placeholder="비워 두면 제출 원문을 사용합니다" /></label>
      <p className="muted">{unicodeLength(published)} / 700자. 원문은 보존됩니다.</p>
      <div className="form-grid"><label>검수 상태<select value={status} onChange={e => setStatus(e.target.value as ReviewStatus)} disabled={busy}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>공개 순서<input type="number" min="0" max="1000000" step="1" value={order} onChange={e => setOrder(e.target.value)} disabled={busy} placeholder="미지정 시 뒤에 표시" /></label></div>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy || unicodeLength(published) > 700}>{busy ? '저장 중…' : '검수 내용 저장'}</button>
    </form>
  </section>;
}

export default function AdminPage() {
  const auth = useAdmin();
  const authenticated = auth.session.authenticated;
  const { config, refresh: refreshEvent } = useEvent();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('desc');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [downloading, setDownloading] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async (force = false) => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    try {
      const response = await api<ListResponse>(`/api/admin/letters?${new URLSearchParams({ page: String(page), status, q: search, sort, refresh: force ? '1' : '0' })}`);
      if (current === sequence.current) setData(response);
    } catch (err) { if (current === sequence.current) { setError(errorMessage(err)); if (err instanceof ClientError && err.status === 401) { setData(null); setSelected(null); void auth.refresh(); } } }
    finally { if (current === sequence.current) setLoading(false); }
  }, [page, status, search, sort]);
  useEffect(() => { if (authenticated) void load(); }, [authenticated, load]);

  async function login(event: FormEvent) {
    event.preventDefault(); if (authBusy) return;
    setAuthBusy(true); setError('');
    try { await auth.login(email, password); setPassword(''); }
    catch (err) { setError(errorMessage(err)); }
    finally { setAuthBusy(false); }
  }
  async function logout() {
    setAuthBusy(true);
    try { await auth.logout(); setData(null); setSelected(null); setMessage(''); }
    catch (err) { setError(errorMessage(err)); }
    finally { setAuthBusy(false); }
  }
  async function review(patch: object) {
    if (!selected) return;
    const response = await api<{ letter: Letter }>(`/api/admin/letters/${selected.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    setSelected(response.letter); setMessage('검수 내용을 저장했습니다. 공개 페이지에 반영하려면 공개 JSON을 내보내고 다시 배포하세요.'); await load();
  }
  async function exportData(scope: 'all' | 'public', format: 'json' | 'csv') {
    setDownloading(true); setError('');
    try {
      const file = await exportFirebase(scope, format);
      downloadFile(file.filename, file.content, file.mime);
      setMessage(scope === 'public' ? '공개 JSON을 내려받았습니다. 파일을 검증·반영하고 재배포해야 공개 페이지가 변경됩니다.' : '백업 파일을 내려받았습니다. DB와 다른 안전한 위치에 보관하세요.');
    } catch (err) { setError(errorMessage(err)); }
    finally { setDownloading(false); }
  }
  async function changePhase(phase: 'A' | 'B' | 'C') {
    setAuthBusy(true); setError('');
    try { await setEvent((await adminContext()).db, phase); await refreshEvent(); setMessage(`운영 단계 ${phase}를 저장했습니다.`); }
    catch (err) { setError(errorMessage(err)); }
    finally { setAuthBusy(false); }
  }
  if (auth.loading) return <p role="status">관리자 인증을 확인하고 있습니다.</p>;
  if (!authenticated) return <><div className="page-heading"><p className="eyebrow">운영진 전용</p><h1>관리자 로그인</h1><p>Firebase에 등록된 운영진 계정으로 로그인합니다.</p></div><section className="panel login-panel"><form onSubmit={event => void login(event)}><label>관리자 이메일<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" disabled={authBusy} /></label><label>관리자 비밀번호<input type="password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={256} autoComplete="current-password" disabled={authBusy} /></label>{(error || auth.error) && <p role="alert" className="error">{error || auth.error}</p>}<button className="primary" disabled={authBusy}>{authBusy ? '확인 중…' : '로그인'}</button></form><p className="muted">계정 생성과 권한 부여는 운영진이 별도로 진행합니다. 공용 기기에서는 작업 후 로그아웃하세요.</p></section></>;
  return <>
    <div className="section-top page-heading"><div><p className="eyebrow">운영진 전용</p><h1>이야기 검수</h1></div><button disabled={authBusy} onClick={() => void logout()}>로그아웃</button></div>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="notice">{message}</p>}
    <section className="panel"><h2>행사 운영</h2><p>현재 단계: <strong>{config?.phase ?? '초기 설정 필요'}</strong></p><div className="actions"><button disabled={authBusy} onClick={() => void changePhase('A')}>A · 행사 참여 허용</button><button disabled={authBusy} onClick={() => void changePhase('B')}>B · 접수 마감</button><button disabled={authBusy} onClick={() => void changePhase('C')}>C · 입학식 공개</button><Link className="button" to="/typing/results">타자 기록·상품 관리</Link></div><p className="muted">설정을 저장하면 현재 코드의 대회 문구도 DB에 등록됩니다. 공개 페이지는 별도로 생성한 승인 JSON을 사용합니다.</p></section>
    <section className="panel"><h2>자료 내보내기</h2><div className="actions"><button disabled={downloading} onClick={() => void exportData('all', 'json')}>전체 JSON 백업</button><button disabled={downloading} onClick={() => void exportData('all', 'csv')}>검수 목록 CSV</button><button disabled={downloading} onClick={() => void exportData('public', 'json')}>입학식 공개 JSON</button></div><p className="muted">공개 JSON에는 승인된 글의 공개용 본문과 표시명만 포함됩니다. 원문·접수 정보는 제외합니다.</p></section>
    <div className="metrics">{Object.entries(labels).map(([value, label]) => <div key={value}><strong>{data?.stats[value as ReviewStatus] ?? 0}</strong><span>{label}</span></div>)}</div>
    <section className="panel"><form className="toolbar" onSubmit={e => { e.preventDefault(); setPage(1); setSearch(query); setSelected(null); }}><label>키워드 검색<input value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="본문·별명" /></label><button disabled={loading}>검색</button><label>검수 상태<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); setSelected(null); }}><option value="">전체</option>{Object.entries(labels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>작성일 정렬<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); setSelected(null); }}><option value="desc">최신순</option><option value="asc">오래된 순</option></select></label><button type="button" onClick={() => void load(true)} disabled={loading}>새로고침</button></form>
    {loading ? <p role="status">글을 불러오고 있습니다.</p> : data?.letters.length ? <ul className="review-list">{data.letters.map(letter => <li key={letter.id}><div className="section-top"><strong>{letter.nickname || '오성고 선배'}</strong><span className="badge">{labels[letter.status]}</span></div><p className="letter-content preview-text">{letter.content}</p><div className="section-top"><small>{koreanDate(letter.created_at)} · 공개 순서 {letter.publish_order ?? '미지정'}</small><button onClick={() => setSelected(letter)}>상세·검수</button></div></li>)}</ul> : <p className="empty">조건에 맞는 글이 없습니다.</p>}
    <div className="pagination"><button disabled={page <= 1 || loading} onClick={() => { setPage(p => p - 1); setSelected(null); }}>이전</button><span>{page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 20))} 페이지 · {data?.total ?? 0}건</span><button disabled={loading || !data || page * 20 >= data.total} onClick={() => { setPage(p => p + 1); setSelected(null); }}>다음</button></div></section>
    {selected && <ReviewEditor key={`${selected.id}-${selected.reviewed_at}`} letter={selected} onSave={review} onClose={() => setSelected(null)} />}
  </>;
}
