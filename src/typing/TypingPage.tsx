import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CHALLENGE } from './challenge';
import { commitInput, compositionEnd, compositionStart, initialInputState, isComplete } from './engine';
import { calculateScore } from './scoring';
import { saveResult } from './storage';
import type { TypingResult } from '../shared/types';
import { EventNotice, useEvent } from '../shared/EventContext';
import { errorMessage } from '../shared/api';
import { downloadFile } from '../shared/download';
import { useLeaveGuard } from '../shared/useLeaveGuard';

type Status = 'ready' | 'armed' | 'running' | 'saving' | 'saved' | 'failed' | 'invalid';

export default function TypingPage() {
  const { config, refresh } = useEvent();
  const [participantId, setParticipantId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<Status>('ready');
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const statusRef = useRef<Status>('ready');
  const engine = useRef(initialInputState());
  const startedAt = useRef<number | null>(null);
  const [input, setInput] = useState('');
  const [errors, setErrors] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<TypingResult | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const saving = useRef(false);
  const blocked = useLeaveGuard(['armed', 'running', 'saving', 'failed'].includes(status));

  function transition(next: Status) { statusRef.current = next; setStatus(next); }

  useEffect(() => {
    const invalidate = () => {
      if (statusRef.current === 'running') {
        statusRef.current = 'invalid'; setStatus('invalid');
        setMessage('브라우저 포커스를 벗어나 이번 시도가 중단되었습니다. 기록은 생성되지 않았습니다.');
      }
    };
    const visibility = () => { if (document.hidden) invalidate(); };
    window.addEventListener('blur', invalidate);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('blur', invalidate); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (status !== 'running') return;
    const timer = window.setInterval(() => setElapsed(performance.now() - startedAt.current!), 100);
    return () => clearInterval(timer);
  }, [status]);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (startingRef.current || statusRef.current !== 'ready' || !participantId.trim() || !displayName.trim()) return;
    startingRef.current = true; setStarting(true);
    try {
      const current = await refresh();
      if (!current?.typingEnabled) { setMessage('현재 타자 대회에 참가할 수 없습니다.'); return; }
      engine.current = initialInputState(); startedAt.current = null;
      setInput(''); setErrors(0); setElapsed(0); setMessage(''); setResult(null);
      transition('armed');
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally { startingRef.current = false; setStarting(false); }
  }

  function beginTiming() {
    if (statusRef.current === 'armed') { startedAt.current = performance.now(); transition('running'); }
  }

  async function persist(record: TypingResult) {
    if (saving.current) return;
    saving.current = true; transition('saving');
    try { await saveResult(record); transition('saved'); setMessage('이 기기에 기록을 저장했습니다. 다음 참가자를 받을 수 있습니다.'); }
    catch (err) { transition('failed'); setMessage(errorMessage(err)); }
    finally { saving.current = false; }
  }

  function process(value: string, endedComposition = false) {
    if (!['armed', 'running'].includes(statusRef.current)) return;
    if (value.length) beginTiming();
    setInput(value);
    engine.current = endedComposition ? compositionEnd(engine.current, value, CHALLENGE.text) : commitInput(engine.current, value, CHALLENGE.text);
    setErrors(engine.current.errors);
    if (isComplete(engine.current, CHALLENGE.text) && startedAt.current !== null) {
      const elapsedMs = Math.max(1, performance.now() - startedAt.current);
      const computed = calculateScore(CHALLENGE.referenceKeystrokes, elapsedMs, engine.current.errors);
      const completed: TypingResult = {
        id: crypto.randomUUID(), participantId: participantId.trim(), displayName: displayName.trim(),
        challengeId: CHALLENGE.challengeId, elapsedMs, ...computed, errors: engine.current.errors,
        completedAt: new Date().toISOString(), prizeReceived: false, practice: CHALLENGE.practice,
      };
      setElapsed(elapsedMs); setResult(completed); transition('saving'); void persist(completed);
    }
  }

  function reset() {
    transition('ready'); setInput(''); setErrors(0); setElapsed(0); setResult(null); setMessage('');
    setParticipantId(''); setDisplayName(''); engine.current = initialInputState(); startedAt.current = null;
  }

  const active = status === 'armed' || status === 'running';
  const inputChars = Array.from(input);
  return <>
    <div className="page-heading"><p className="eyebrow">부스 01</p><h1>타자 대회</h1><p>빠르게, 그리고 정확하게. 한 문장을 끝까지 완성해 보세요.</p></div>
    <EventNotice />
    <p className="notice">현재 문구는 임시 애국가 연습용입니다. 모든 결과는 연습 기록으로 저장됩니다.</p>
    <details><summary>입력·채점 규칙 확인</summary><ul>
      <li>첫 글자 입력부터 시간 측정. 문구를 정확히 완성하면 자동 종료합니다.</li>
      <li>기준 {CHALLENGE.referenceKeystrokes}타 × 60 ÷ 소요 초, 반올림하여 타수를 계산합니다.</li>
      <li>두벌식 글쇠 기준이며 Shift는 별도 타수로 세지 않습니다. 공백·문장부호는 각각 1타입니다.</li>
      <li>잘못 확정한 문자마다 20점 감점. 수정해도 누적하며 최저 점수는 0점입니다.</li>
      <li>동점은 오타 수가 적은 순, 소요 시간이 짧은 순입니다. 모두 같으면 공동 순위입니다.</li>
      <li>붙여넣기를 차단합니다. 창 이탈·새로고침·페이지 이동 시 시도가 중단됩니다.</li>
    </ul></details>
    <section className="panel">
      <h2>참가자 정보</h2>
      <form onSubmit={event => void start(event)} className="form-grid">
        <label>참가번호<input value={participantId} onChange={e => setParticipantId(e.target.value)} required maxLength={30} disabled={starting || status !== 'ready'} autoComplete="off" placeholder="예: 001" /></label>
        <label>표시 이름<input value={displayName} onChange={e => setDisplayName(e.target.value)} required maxLength={30} disabled={starting || status !== 'ready'} autoComplete="off" placeholder="별명도 괜찮아요" /></label>
        {status === 'ready' && <button className="primary" disabled={starting || !config?.typingEnabled}>{starting ? '운영 상태 확인 중…' : '연습 타자 시작'}</button>}
      </form>
      <p className="muted">학번·전화번호는 입력하지 마세요. 참가 횟수 제한은 아직 없으며 중복 기록은 기록 관리에서 표시합니다.</p>
    </section>
    <section className="panel">
      <div className="section-top"><h2>{CHALLENGE.title}</h2><span className="badge">{status === 'running' ? '측정 중' : status === 'armed' ? '첫 입력 대기' : '연습'}</span></div>
      <div className="metrics" aria-live="off"><div><strong>{(elapsed / 1000).toFixed(1)}</strong><span>소요 시간(초)</span></div><div><strong>{errors}</strong><span>누적 오타</span></div><div><strong>{result?.score ?? '—'}</strong><span>최종 점수</span></div></div>
      <p className="challenge" aria-label={`입력할 문구: ${CHALLENGE.text}`}>
        {Array.from(CHALLENGE.text).map((char, i) => <span key={i} className={`${i < inputChars.length ? inputChars[i] === char ? 'correct' : 'incorrect' : ''} ${i === inputChars.length ? 'cursor' : ''}`}>{char}</span>)}
      </p>
      <label>문구 입력<textarea ref={inputRef} value={input} disabled={!active} rows={4} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
        aria-describedby="typing-feedback" placeholder="시작 버튼을 누른 뒤 입력하세요."
        onPaste={e => { e.preventDefault(); setMessage('붙여넣기는 사용할 수 없습니다.'); }}
        onDrop={e => { e.preventDefault(); setMessage('끌어놓기는 사용할 수 없습니다.'); }}
        onBeforeInput={e => {
          const type = (e.nativeEvent as InputEvent).inputType ?? '';
          if (/Paste|Drop|Replacement|history|Yank/i.test(type)) { e.preventDefault(); setMessage('키보드로 직접 입력해 주세요.'); }
          else if (type.startsWith('insert')) beginTiming();
        }}
        onCompositionStart={() => { if (active) { beginTiming(); engine.current = compositionStart(engine.current); } }}
        onCompositionEnd={e => process(e.currentTarget.value, true)}
        onChange={e => process(e.target.value)} /></label>
      <p id="typing-feedback" role="status">{message || (active ? `입력 ${inputChars.length} / ${Array.from(CHALLENGE.text).length}자 · 누적 오타 ${errors}회. 틀린 글자는 밑줄로 표시합니다.` : '한글 두벌식 키보드가 연결된 PC에서 참여해 주세요.')}</p>
      {result && <p><strong>{result.speed}타 · 오타 {result.errors}회 · 최종 {result.score}점</strong></p>}
      {status === 'saving' && <p role="status">기록을 저장하고 있습니다. 잠시 기다려 주세요.</p>}
      {status === 'failed' && result && <div className="actions"><button onClick={() => void persist(result)}>저장 재시도</button><button onClick={() => downloadFile(`typing-${result.participantId}.json`, JSON.stringify(result, null, 2), 'application/json')}>결과 긴급 백업</button></div>}
      {['saved', 'invalid'].includes(status) && <button onClick={reset}>다음 참가자 / 다시 시작</button>}
      {active && <button onClick={() => { transition('invalid'); setMessage('이번 시도를 중단했습니다. 완료 기록은 생성되지 않았습니다.'); }}>이번 시도 중단</button>}
      <p><Link to="/typing/results">이 기기의 참가 기록 보기 →</Link></p>
    </section>
    {blocked.state === 'blocked' && <div className="notice" role="alert"><p>페이지를 떠나면 진행 중인 시도나 저장하지 못한 결과를 잃을 수 있습니다.</p><div className="actions"><button onClick={() => blocked.reset()}>계속 진행</button><button onClick={() => blocked.proceed()}>페이지 떠나기</button></div></div>}
  </>;
}
