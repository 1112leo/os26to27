import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TypingResult } from '../lib/types';
import {
  pendingResults,
  resultsCsv,
  synchronizePending,
  listLocalResults,
} from '../typing/storage';
import { rankResults } from '../typing/scoring';
import { adminContext, errorMessage } from '../lib/firebase';
import { downloadFile, koreanDate } from '../lib/files';
import { useAdmin } from '../components/SessionProvider';
import { readTyping, reviewTyping } from '../lib/database';

const verificationLabels = { pending: '확인 대기', verified: '운영진 확인', rejected: '제외' };
export default function ResultsPage() {
  const auth = useAdmin();
  const [results, setResults] = useState<TypingResult[]>([]);
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState('');
  const [verification, setVerification] = useState('all');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [synchronizing, setSynchronizing] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const records = await readTyping((await adminContext()).db);
      setResults(records);
      setVersion((current) => current || records[0]?.challengeId || '');
      try {
        setPending((await pendingResults()).length);
      } catch {
        /* Cloud records remain available if local storage is disabled. */
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (auth.session.authenticated) void load();
    else setResults([]);
  }, [auth.session.authenticated, load]);
  const versions = [...new Set(results.map((result) => result.challengeId))];
  const ranked = useMemo(
    () =>
      rankResults(
        results.filter(
          (result) =>
            result.challengeId === version &&
            (verification === 'all' || result.verificationStatus === verification),
        ),
      ),
    [results, version, verification],
  );
  const matched = ranked.filter((result) =>
    `${result.participantId} ${result.displayName}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const shown = matched.slice((page - 1) * 50, page * 50);

  async function update(
    result: TypingResult,
    patch: { prizeReceived?: boolean; verificationStatus?: 'pending' | 'verified' | 'rejected' },
  ) {
    setUpdating(result.id);
    setError('');
    try {
      await reviewTyping((await adminContext()).db, result.id, patch);
      setResults((all) =>
        all.map((item) => (item.id === result.id ? { ...item, ...patch } : item)),
      );
      setMessage('변경 내용을 서버에 저장했습니다.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setUpdating(null);
    }
  }
  async function synchronize() {
    setSynchronizing(true);
    setError('');
    try {
      const result = await synchronizePending();
      setMessage(`${result.synced}건 DB 접수 완료 · 이 기기 미전송 ${result.remaining}건`);
      await load();
      if (result.error) setError(result.error);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSynchronizing(false);
    }
  }
  async function localBackup() {
    try {
      downloadFile(
        'ohsung-local-typing-backup.json',
        JSON.stringify(
          {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            results: await listLocalResults(),
          },
          null,
          2,
        ),
        'application/json',
      );
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  if (auth.loading) return <p role="status">관리자 인증을 확인하고 있습니다.</p>;
  if (!auth.session.authenticated)
    return (
      <section className="panel">
        <h1>운영진 기록·순위 관리</h1>
        <p>여러 기기의 타자 기록과 참가자 정보를 보호하기 위해 관리자 로그인이 필요합니다.</p>
        <Link className="button primary" to="/admin">
          관리자 로그인
        </Link>
      </section>
    );
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">모든 운영 기기 · 서버 DB</p>
        <h1>타자 기록 관리</h1>
        <p>대회 기록은 서버에 모이며, 운영진 확인 전에는 공식 기록으로 확정되지 않습니다.</p>
      </div>
      <p className="notice">
        브라우저에서 측정한 시간은 참가자가 조작할 수 있습니다. 실제 운영 기기에서 진행한 시도를
        확인한 뒤 승인하세요. 공식 순위는 ‘운영진 확인’ 필터에서 문구별로 확인합니다. 연습 기록에는
        상품 수령을 기록할 수 없습니다.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <section className="panel">
        <h2>이 기기의 전송 대기·백업</h2>
        <p>DB 접수 확인 전인 로컬 기록 {pending}건</p>
        <div className="actions">
          <button disabled={synchronizing || !pending} onClick={() => void synchronize()}>
            {synchronizing ? '재전송 중…' : '미전송·기존 기기 기록 DB 접수'}
          </button>
          <button onClick={() => void localBackup()}>이 기기 전체 JSON 백업</button>
        </div>
        <p className="muted">
          현재 문구와 채점 규칙에 맞는 기록만 접수합니다. 같은 기록 ID를 재전송해도 중복 생성되지
          않습니다.
        </p>
      </section>
      <section className="panel">
        <div className="toolbar">
          <label>
            참가번호·이름 검색
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="참가자 검색"
            />
          </label>
          <label>
            문구 버전
            <select
              value={version}
              onChange={(event) => {
                setVersion(event.target.value);
                setPage(1);
              }}
            >
              <option value="">선택</option>
              {versions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            운영진 확인
            <select
              value={verification}
              onChange={(event) => {
                setVerification(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">전체</option>
              {Object.entries(verificationLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => void load()} disabled={loading}>
            서버 새로고침
          </button>
        </div>
        <div className="actions">
          <button
            disabled={!ranked.length}
            onClick={() =>
              downloadFile(
                `ohsung-typing-${version}.csv`,
                resultsCsv(ranked),
                'text/csv;charset=utf-8',
              )
            }
          >
            선택 버전·확인 상태 CSV
          </button>
          <button
            disabled={!results.length}
            onClick={() =>
              downloadFile(
                'ohsung-typing-backup.json',
                JSON.stringify(
                  { schemaVersion: 1, exportedAt: new Date().toISOString(), results },
                  null,
                  2,
                ),
                'application/json',
              )
            }
          >
            서버 타자 기록 JSON
          </button>
        </div>
        <p className="muted">
          점수 → 오타 수 → 소요 시간 순입니다. 모두 같으면 공동 순위이며 검색해도 원래 순위를
          유지합니다.
        </p>
        {loading ? (
          <p role="status">서버 기록을 불러오고 있습니다.</p>
        ) : shown.length ? (
          <div className="table-scroll">
            <table>
              <caption>검색 결과 {matched.length}건</caption>
              <thead>
                <tr>
                  <th>{verification === 'verified' ? '확인 기록 순위' : '목록 순서'}</th>
                  <th>참가자</th>
                  <th>점수</th>
                  <th>타수 / 오타</th>
                  <th>시간</th>
                  <th>서버 접수</th>
                  <th>확인</th>
                  <th>상품</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((result) => (
                  <tr key={result.id}>
                    <td>
                      {result.rank}
                      {result.practice && <small>연습</small>}
                    </td>
                    <td>
                      {result.displayName}
                      <small>
                        {result.participantId}
                        {ranked.filter((item) => item.participantId === result.participantId)
                          .length > 1
                          ? ' · 중복 참가'
                          : ''}
                      </small>
                    </td>
                    <td>
                      <strong>{result.score}</strong>
                    </td>
                    <td>
                      {result.speed}타 / {result.errors}회
                    </td>
                    <td>{(result.elapsedMs / 1000).toFixed(2)}초</td>
                    <td>{koreanDate(result.receivedAt || result.completedAt)}</td>
                    <td>
                      <label className="sr-only" htmlFor={`review-${result.id}`}>
                        참가자 {result.displayName} 확인 상태
                      </label>
                      <select
                        id={`review-${result.id}`}
                        value={result.verificationStatus ?? 'pending'}
                        disabled={!!updating}
                        onChange={(event) =>
                          void update(result, {
                            verificationStatus: event.target.value as
                              'pending' | 'verified' | 'rejected',
                            ...(event.target.value !== 'verified' ? { prizeReceived: false } : {}),
                          })
                        }
                      >
                        {Object.entries(verificationLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        disabled={
                          !!updating || result.practice || result.verificationStatus !== 'verified'
                        }
                        onClick={() =>
                          void update(result, { prizeReceived: !result.prizeReceived })
                        }
                      >
                        {result.practice
                          ? '연습 기록'
                          : result.prizeReceived
                            ? '수령 완료'
                            : '미수령'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            {query ? '검색 결과가 없습니다.' : '아직 서버에 접수된 기록이 없습니다.'}
          </p>
        )}
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            이전
          </button>
          <span>
            {page} / {Math.max(1, Math.ceil(matched.length / 50))}
          </span>
          <button
            disabled={page * 50 >= matched.length}
            onClick={() => setPage((current) => current + 1)}
          >
            다음
          </button>
        </div>
      </section>
      <Link to="/typing">← 타자 대회로 돌아가기</Link>
    </>
  );
}
