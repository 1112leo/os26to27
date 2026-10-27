import { useEffect, useState } from 'react';
import type { PublicData } from '../lib/types';
import type { DocumentSnapshot } from 'firebase/firestore';
import { getClients } from '../lib/firebase';
import { readPublicLetters } from '../lib/database';
import { EventNotice, useEvent } from '../components/EventProvider';

export default function WelcomePage() {
  const { config } = useEvent();
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<(DocumentSnapshot | undefined)[]>([undefined]);
  const [nextCursor, setNextCursor] = useState<DocumentSnapshot>();
  const [hasNext, setHasNext] = useState(false);
  const cursor = cursors[page - 1];
  const pageSize = 20;
  useEffect(() => {
    let cancelled = false;
    if (!config) return;
    if (!config.welcomeEnabled) {
      setData({ schemaVersion: 1, publishedAt: null, letters: [] });
      setError('');
      return;
    }
    async function load() {
      setError('');
      setData(null);
      try {
        const payload = await readPublicLetters((await getClients()).deviceDb, cursor);
        if (cancelled) return;
        setData({
          schemaVersion: 1,
          publishedAt: null,
          letters: payload.letters,
        });
        setNextCursor(payload.cursor);
        setHasNext(payload.hasNext);
      } catch {
        if (!cancelled) setError('이야기를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [retry, config?.welcomeEnabled, cursor, page]);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">2027 · 천안오성고등학교</p>
        <h1>새로운 시작을 환영해요.</h1>
        <p>조금 먼저 이곳을 걸어온 선배들이 여러분에게 보내는 이야기입니다.</p>
      </div>
      {!config && <EventNotice />}
      {error ? (
        <div className="notice" role="alert">
          {error} <button onClick={() => setRetry((r) => r + 1)}>다시 불러오기</button>
        </div>
      ) : !data ? (
        <p role="status">선배들의 이야기를 가져오고 있습니다.</p>
      ) : data.letters.length === 0 ? (
        <section className="panel empty">
          <h2>선배들의 이야기를 준비하고 있어요.</h2>
          <p>운영진이 검토한 글은 공개 준비가 끝나면 이곳에서 만날 수 있습니다.</p>
        </section>
      ) : (
        <>
          <p className="muted" role="status">
            선배의 이야기 · {page} 페이지
          </p>
          <div className="letter-list">
            {data.letters.map((letter, index) => (
              <article key={letter.id} className="panel welcome-letter">
                <p className="eyebrow">
                  선배의 이야기 {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                </p>
                <p className="letter-content">{letter.content}</p>
                <footer>— {letter.nickname}</footer>
              </article>
            ))}
          </div>
          {(page > 1 || hasNext) && (
            <nav className="pagination" aria-label="선배 이야기 페이지">
              <button
                disabled={page === 1}
                onClick={() => {
                  setPage((p) => p - 1);
                  window.scrollTo(0, 0);
                }}
              >
                이전 이야기
              </button>
              <span>{page} 페이지</span>
              <button
                disabled={!hasNext}
                onClick={() => {
                  setCursors((previous) => [...previous.slice(0, page), nextCursor]);
                  setPage((p) => p + 1);
                  window.scrollTo(0, 0);
                }}
              >
                다음 이야기
              </button>
            </nav>
          )}
        </>
      )}
      <p className="muted">운영진이 공개 동의와 내용을 확인한 이야기만 소개합니다.</p>
    </>
  );
}
