import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Letter, ReviewStatus } from '../lib/types';
import { adminContext, errorMessage } from '../lib/firebase';
import { downloadFile, koreanDate } from '../lib/files';
import { unicodeLength } from '../lib/validation';
import { exportFirebase } from './export';
import {
  deleteLetter,
  readLetters,
  saveLetter,
  synchronizePublicLetters,
  type LetterEdit,
} from '../lib/database';

const labels = {
  pending: '검토 대기',
  approved: '공개 승인',
  rejected: '공개 제외',
};
const empty: LetterEdit = {
  nickname: '',
  content: '',
  published_content: null,
  status: 'pending',
  publish_order: null,
};

function LetterEditor({
  letter,
  onSave,
  onClose,
}: {
  letter: Letter | null;
  onSave: (input: LetterEdit) => Promise<void>;
  onClose: () => void;
}) {
  const [input, setInput] = useState<LetterEdit>(letter ?? empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(!!letter);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !consent) return;
    setBusy(true);
    setError('');
    try {
      await onSave(input);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel review-panel" ref={panel} aria-label="글 편집">
      <div className="section-top">
        <h3>{letter ? '글 수정·검수' : '새 글 추가'}</h3>
        <button disabled={busy} onClick={onClose}>
          닫기
        </button>
      </div>
      {letter && <p className="muted">접수 {koreanDate(letter.created_at)} · 공개 동의 완료</p>}
      <form onSubmit={(event) => void submit(event)}>
        <label>
          별명
          <input
            value={input.nickname ?? ''}
            maxLength={30}
            disabled={busy}
            onChange={(e) => setInput({ ...input, nickname: e.target.value })}
            placeholder="비워 두면 오성고 선배"
          />
        </label>
        <label>
          본문
          <textarea
            rows={6}
            value={input.content}
            required
            disabled={busy}
            onChange={(e) => setInput({ ...input, content: e.target.value })}
          />
        </label>
        <p className="muted">{unicodeLength(input.content)} / 700자 · 10~700자</p>
        <label>
          공개용 본문
          <textarea
            rows={4}
            value={input.published_content ?? ''}
            disabled={busy}
            onChange={(e) => setInput({ ...input, published_content: e.target.value || null })}
            placeholder="비워 두면 본문을 공개합니다"
          />
        </label>
        <p className="muted">
          {unicodeLength(input.published_content ?? '')} / 700자 · 본문과 별도로 공개할 내용을
          다듬을 수 있습니다.
        </p>
        <div className="form-grid">
          <label>
            검수 상태
            <select
              value={input.status}
              disabled={busy}
              onChange={(e) => setInput({ ...input, status: e.target.value as ReviewStatus })}
            >
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            공개 순서
            <input
              type="number"
              min={0}
              max={1000000}
              step={1}
              value={input.publish_order ?? ''}
              disabled={busy}
              onChange={(e) =>
                setInput({
                  ...input,
                  publish_order: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="미지정 시 뒤에 표시"
            />
          </label>
        </div>
        {!letter && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              required
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            작성자의 글 공개 동의를 확인했습니다.
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !consent}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </form>
    </section>
  );
}

export default function AdminPage() {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('desc');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Letter | null | undefined>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const records = await readLetters((await adminContext()).db);
      if (current === sequence.current) setLetters(records);
    } catch (reason) {
      if (current === sequence.current) setError(errorMessage(reason));
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  const filtered = useMemo(
    () =>
      letters
        .filter(
          (letter) =>
            (!status || letter.status === status) &&
            `${letter.nickname ?? ''} ${letter.content} ${letter.published_content ?? ''}`
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase()),
        )
        .sort(
          (a, b) =>
            (sort === 'asc' ? 1 : -1) * a.created_at.localeCompare(b.created_at) ||
            a.id.localeCompare(b.id),
        ),
    [letters, query, status, sort],
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
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
  async function save(input: LetterEdit) {
    const { db, uid } = await adminContext();
    const updated = await saveLetter(db, uid, selected?.id ?? null, input);
    setLetters((all) => [updated, ...all.filter((letter) => letter.id !== updated.id)]);
    setSelected(undefined);
    setMessage('글을 저장했습니다. 승인된 글의 공개 내용도 함께 반영했습니다.');
  }
  function remove(letter: Letter) {
    if (
      !window.confirm(
        `‘${letter.nickname || '오성고 선배'}’의 글을 삭제할까요? 공개 페이지에서도 제거되며 되돌릴 수 없습니다.`,
      )
    )
      return;
    void action(async () => {
      await deleteLetter((await adminContext()).db, letter.id);
      setLetters((all) => all.filter((item) => item.id !== letter.id));
      return '글과 공개 내용을 삭제했습니다.';
    });
  }
  function exportData(scope: 'all' | 'public', format: 'json' | 'csv') {
    void action(async () => {
      const file = await exportFirebase(scope, format);
      downloadFile(file.filename, file.content, file.mime);
      return '파일을 내려받았습니다. 전체 백업에는 비공개 자료가 포함됩니다.';
    });
  }
  return (
    <>
      <div className="section-top">
        <h2>후배에게 한마디 · 글 관리</h2>
        <button
          className="primary"
          disabled={busy || selected !== undefined}
          onClick={() => setSelected(null)}
        >
          새 글 추가
        </button>
      </div>
      <p>
        글 추가·수정·삭제와 공개 승인을 관리합니다. 승인·수정·제외는 재배포 없이 공개 페이지에
        반영됩니다.
      </p>
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
      {selected !== undefined && (
        <LetterEditor
          key={selected?.id ?? 'new'}
          letter={selected}
          onSave={save}
          onClose={() => setSelected(undefined)}
        />
      )}
      <details className="panel">
        <summary>백업·내보내기와 기존 승인 글 반영</summary>
        <div className="actions">
          <button disabled={busy} onClick={() => exportData('all', 'json')}>
            전체 JSON 백업
          </button>
          <button disabled={busy} onClick={() => exportData('all', 'csv')}>
            글 목록 CSV
          </button>
          <button disabled={busy} onClick={() => exportData('public', 'json')}>
            공개 글 JSON
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void action(
                async () =>
                  `기존 승인 글 ${await synchronizePublicLetters((await adminContext()).db)}편을 공개 페이지에 반영했습니다.`,
              )
            }
          >
            기존 승인 글 공개 반영
          </button>
        </div>
        <p className="muted">
          이전 버전에서 승인한 글은 ‘기존 승인 글 공개 반영’을 한 번 실행하세요. 이후 수정은
          자동으로 반영됩니다.
        </p>
      </details>
      <div className="metrics">
        {Object.entries(labels).map(([value, label]) => (
          <div key={value}>
            <strong>{letters.filter((letter) => letter.status === value).length}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="toolbar">
          <label>
            본문·별명 검색
            <input
              value={query}
              maxLength={100}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            검수 상태
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">전체</option>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            작성일 정렬
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="desc">최신순</option>
              <option value="asc">오래된 순</option>
            </select>
          </label>
          <button disabled={loading || busy} onClick={() => void load()}>
            새로고침
          </button>
        </div>
        {loading ? (
          <p role="status">글을 불러오고 있습니다.</p>
        ) : filtered.length ? (
          <ul className="review-list">
            {filtered.slice((currentPage - 1) * 20, currentPage * 20).map((letter) => (
              <li key={letter.id}>
                <div className="section-top">
                  <strong>{letter.nickname || '오성고 선배'}</strong>
                  <span className="badge">{labels[letter.status]}</span>
                </div>
                <p className="letter-content preview-text">{letter.content}</p>
                <small>
                  {koreanDate(letter.created_at)} · 공개 순서 {letter.publish_order ?? '미지정'}
                </small>
                <div className="actions">
                  <button
                    disabled={busy || selected !== undefined}
                    onClick={() => setSelected(letter)}
                  >
                    수정·검수
                  </button>
                  <button
                    className="danger"
                    disabled={busy || selected !== undefined}
                    onClick={() => remove(letter)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">조건에 맞는 글이 없습니다.</p>
        )}
        <div className="pagination">
          <button disabled={currentPage <= 1 || loading} onClick={() => setPage(currentPage - 1)}>
            이전
          </button>
          <span>
            {currentPage} / {Math.max(1, Math.ceil(filtered.length / 20))} 페이지 ·{' '}
            {filtered.length}건
          </span>
          <button
            disabled={currentPage * 20 >= filtered.length || loading}
            onClick={() => setPage(currentPage + 1)}
          >
            다음
          </button>
        </div>
      </section>
    </>
  );
}
