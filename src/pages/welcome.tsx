import { useEffect, useState } from 'react';
import type { PublicData } from '../lib/types';
import { validatePublicData } from '../lib/public-data';

export default function WelcomePage() {
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      setError('');
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/welcome.json`, {
          signal: abort.signal,
          cache: 'no-cache',
        });
        if (!response.ok) throw new Error();
        const payload: unknown = await response.json();
        if (!validatePublicData(payload)) throw new Error();
        setData(payload);
        setPage(1);
      } catch {
        if (!abort.signal.aborted)
          setError('이야기를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.');
      }
    }
    void load();
    return () => abort.abort();
  }, [retry]);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">2027 · 천안오성고등학교</p>
        <h1>새로운 시작을 환영해요.</h1>
        <p>조금 먼저 이곳을 걸어온 선배들이 여러분에게 보내는 이야기입니다.</p>
      </div>
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
            선배의 이야기 {data.letters.length}편 · {page} /{' '}
            {Math.ceil(data.letters.length / pageSize)} 페이지
          </p>
          <div className="letter-list">
            {data.letters.slice((page - 1) * pageSize, page * pageSize).map((letter, index) => (
              <article key={letter.id} className="panel welcome-letter">
                <p className="eyebrow">
                  선배의 이야기 {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                </p>
                <p className="letter-content">{letter.content}</p>
                <footer>— {letter.nickname}</footer>
              </article>
            ))}
          </div>
          {data.letters.length > pageSize && (
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
              <span>
                {page} / {Math.ceil(data.letters.length / pageSize)}
              </span>
              <button
                disabled={page * pageSize >= data.letters.length}
                onClick={() => {
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
