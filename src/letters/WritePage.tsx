import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../shared/api';
import { EventNotice, useEvent } from '../shared/EventContext';
import type { LetterSubmission } from '../shared/types';
import { normalizeText, unicodeLength, validateSubmission } from '../shared/validation';
import { useLeaveGuard } from '../shared/useLeaveGuard';

export default function WritePage() {
  const navigate = useNavigate();
  const { config } = useEvent();
  const [nickname, setNickname] = useState('');
  const [content, setContent] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const key = useRef(crypto.randomUUID());
  const [pending, setPending] = useState<LetterSubmission | null>(null);
  const [error, setError] = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);
  const accepted = useRef(false);
  const blocker = useLeaveGuard(() => !accepted.current && (busy || !!content || !!nickname));
  const count = unicodeLength(normalizeText(content));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    const candidate = pending ?? { nickname, content, consentToPublish: consent, submissionKey: key.current };
    const { value, error: validationError } = validateSubmission(candidate);
    if (!value) { setError(validationError!); return; }
    busyRef.current = true; setBusy(true); setError(''); setPending(value);
    try {
      const receipt = await api<{ id: string }>('/api/letters', { method: 'POST', body: JSON.stringify(value) });
      accepted.current = true;
      setContent(''); setNickname(''); setConsent(false); setPending(null);
      try { sessionStorage.setItem('ohsung-last-receipt', receipt.id); } catch { /* Receipt remains in navigation state if storage is unavailable. */ }
      navigate('/write/complete', { replace: true, state: { receiptId: receipt.id } });
    } catch (err) { setError(errorMessage(err)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function reset() {
    setContent(''); setNickname(''); setConsent(false); setPending(null); setError('');
    key.current = crypto.randomUUID(); setResetConfirm(false);
  }
  return <>
    <div className="page-heading"><p className="eyebrow">부스 02 · 2027학년도 신입생에게</p><h1>후배에게 전하는 이야기</h1><p>처음의 설렘을 기억하나요? 오성고에서 보낸 당신의 이야기를 들려주세요.</p></div>
    <EventNotice />
    <section className="panel">
      <form onSubmit={event => void submit(event)}>
        <label>별명 <span className="muted">선택 · 최대 30자</span><input value={nickname} onChange={e => setNickname(e.target.value)} disabled={busy || !!pending} autoComplete="off" placeholder="비워 두면 ‘오성고 선배’로 표시합니다" /></label>
        <label>전하고 싶은 이야기 <span className="required">필수</span><textarea rows={10} value={content} onChange={e => setContent(e.target.value)} disabled={busy || !!pending} required aria-describedby="letter-count letter-privacy" placeholder="좋아하는 학교 공간, 기억에 남는 순간, 후배에게 알려주고 싶은 작은 팁…" /></label>
        <p id="letter-count" className={count > 700 ? 'error' : 'muted'}>{count} / 700자 · 최소 10자 · 줄바꿈 가능</p>
        <p id="letter-privacy" className="notice">이름·학번·전화번호 등 개인정보와 다른 사람을 특정하는 내용은 쓰지 마세요. 글과 별명, 공개 동의 정보는 행사 운영진이 검토하며, 승인된 글과 별명은 2027학년도 입학식용 페이지에 공개될 수 있습니다. 보유 기간과 공개 종료 시점은 운영진이 확정해 안내합니다.</p>
        <label className="checkbox"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy || !!pending} required />작성한 글과 별명이 운영진 검토 후 신입생에게 공개되는 데 동의합니다. (필수)</label>
        {error && <p role="alert" className="error">{error}</p>}
        {pending && !busy && <p className="notice">입력 내용은 유지되어 있습니다. 아래 버튼으로 동일한 접수 요청을 재전송하면 중복 저장되지 않습니다. 응답을 확인하기 전에는 내용을 바꿀 수 없습니다.</p>}
        <div className="actions"><button className="primary" disabled={busy || (!config?.submissionsEnabled && !pending)}>{busy ? '접수 결과 확인 중…' : pending ? '동일 내용으로 제출 재시도' : '이야기 제출하기'}</button><button type="button" disabled={busy || !content && !nickname} onClick={() => setResetConfirm(true)}>운영진 입력 초기화</button></div>
        <p className="muted">저장 성공을 확인한 뒤에만 완료 화면으로 이동합니다. 공용 기기에서는 제출 후 입력 내용이 지워집니다.</p>
      </form>
      {resetConfirm && <div role="alert" className="notice"><p>현재 글을 지우고 새 접수를 시작합니다.{pending ? ' 앞선 요청이 이미 저장되었을 수도 있습니다. 운영진이 접수 내역을 확인한 후 초기화하세요.' : ''}</p><div className="actions"><button onClick={reset}>입력 내용을 지우기</button><button onClick={() => setResetConfirm(false)}>취소</button></div></div>}
    </section>
    {blocker.state === 'blocked' && <div className="notice" role="alert"><p>페이지를 떠나면 작성한 글이 지워집니다.</p><div className="actions"><button onClick={() => blocker.reset()}>계속 작성</button><button onClick={() => blocker.proceed()}>작성 취소하고 이동</button></div></div>}
  </>;
}
