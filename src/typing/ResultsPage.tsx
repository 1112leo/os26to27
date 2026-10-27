import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TypingResult } from '../shared/types';
import { listResults, resultsCsv, saveResult } from './storage';
import { rankResults } from './scoring';
import { errorMessage } from '../shared/api';
import { downloadFile, koreanDate } from '../shared/download';

export default function ResultsPage() {
  const [results, setResults] = useState<TypingResult[]>([]);
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  async function load() {
    setLoading(true);
    try { const records = await listResults(); setResults(records); setVersion(v => v || records[0]?.challengeId || ''); setError(''); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const versions = [...new Set(results.map(r => r.challengeId))];
  const ranked = useMemo(() => rankResults(results.filter(r => r.challengeId === version)), [results, version]);
  const shown = ranked.filter(r => `${r.participantId} ${r.displayName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function toggle(result: TypingResult) {
    setUpdating(result.id);
    try { const next = { ...result, prizeReceived: !result.prizeReceived }; await saveResult(next); setResults(all => all.map(r => r.id === next.id ? next : r)); setError(''); }
    catch (err) { setError(errorMessage(err)); }
    finally { setUpdating(null); }
  }
  return <>
    <div className="page-heading"><p className="eyebrow">운영 기기</p><h1>타자 기록 관리</h1><p>현재 브라우저에 저장된 기록입니다. 문구 버전별로 순위를 구분합니다.</p></div>
    <p className="notice">다른 기기의 기록은 자동 합산되지 않습니다. 행사 후 CSV와 JSON을 내려받아 별도로 보관하세요. 브라우저 데이터를 삭제하면 기록도 사라집니다.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <section className="panel"><div className="toolbar">
      <label>참가번호·이름 검색<input value={query} onChange={e => setQuery(e.target.value)} placeholder="참가자 검색" /></label>
      <label>문구 버전<select value={version} onChange={e => setVersion(e.target.value)}><option value="">선택</option>{versions.map(v => <option key={v}>{v}</option>)}</select></label>
      <button onClick={() => void load()} disabled={loading}>새로고침</button>
    </div>
    <div className="actions"><button disabled={!ranked.length} onClick={() => downloadFile(`typing-${version}.csv`, resultsCsv(ranked), 'text/csv;charset=utf-8')}>선택 버전 전체 CSV</button><button disabled={!results.length} onClick={() => downloadFile('typing-backup.json', JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), results }, null, 2), 'application/json')}>전체 기록 JSON 백업</button></div>
    <p className="muted">동점: 오타 수 → 소요 시간. 모두 같으면 공동 순위. 검색해도 원래 순위를 유지하며 CSV는 선택 버전 전체를 내보냅니다.</p>
    {loading ? <p role="status">기록을 불러오고 있습니다.</p> : shown.length ? <div className="table-scroll"><table><caption>참가 기록 {shown.length}건</caption><thead><tr><th>순위</th><th>참가자</th><th>점수</th><th>타수 / 오타</th><th>시간</th><th>완료</th><th>상품</th></tr></thead><tbody>{shown.map(r => <tr key={r.id}><td>{r.rank}{r.practice && <small>연습</small>}</td><td>{r.displayName}<small>{r.participantId}{ranked.filter(x => x.participantId === r.participantId).length > 1 ? ' · 중복 참가' : ''}</small></td><td><strong>{r.score}</strong></td><td>{r.speed}타 / {r.errors}회</td><td>{(r.elapsedMs / 1000).toFixed(2)}초</td><td>{koreanDate(r.completedAt)}</td><td><button disabled={!!updating || r.practice} onClick={() => void toggle(r)} aria-label={`${r.displayName} 상품 ${r.prizeReceived ? '미수령으로 변경' : '수령 처리'}`}>{r.practice ? '연습 기록' : r.prizeReceived ? '수령 완료' : '미수령'}</button></td></tr>)}</tbody></table></div> : <p className="empty">{query ? '검색 결과가 없습니다.' : '아직 완료한 참가 기록이 없습니다.'}</p>}
    </section><Link to="/typing">← 타자 대회로 돌아가기</Link>
  </>;
}
