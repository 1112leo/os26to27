import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useEvent } from '../components/EventProvider';
import { adminContext, errorMessage } from '../lib/firebase';
import { changeChallenge, readChallenges, saveChallenge, setEvent } from '../lib/database';
import type { EventConfig, TypingChallenge } from '../lib/types';
import { countKeystrokes } from '../typing/scoring';

export default function SettingsPage() {
  const { config, refresh } = useEvent();
  const [settings, setSettings] = useState<EventConfig | null>(null);
  const [challenges, setChallenges] = useState<TypingChallenge[]>([]);
  const [editing, setEditing] = useState<TypingChallenge | undefined>();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [practice, setPractice] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    setSettings(config);
  }, [config]);
  const load = useCallback(
    async () => setChallenges(await readChallenges((await adminContext()).db)),
    [],
  );
  useEffect(() => {
    void load().catch((reason) => setError(errorMessage(reason)));
  }, [load]);
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
  function submit(event: FormEvent, work: () => Promise<string>) {
    event.preventDefault();
    void action(work);
  }
  function edit(challenge?: TypingChallenge) {
    setEditing(challenge);
    setTitle(challenge?.title ?? '');
    setText(challenge?.text ?? '');
    setPractice(challenge?.practice ?? true);
    document.getElementById('challenge-editor')?.scrollIntoView({ behavior: 'smooth' });
  }
  return (
    <>
      <h2>행사·문구 설정</h2>
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
        <h3>운영 상태</h3>
        {settings ? (
          <form
            onSubmit={(event) =>
              submit(event, async () => {
                const {
                  phase,
                  typingEnabled,
                  submissionsEnabled,
                  welcomeEnabled,
                  activeChallengeId,
                } = settings;
                await setEvent((await adminContext()).db, phase, {
                  typingEnabled,
                  submissionsEnabled,
                  welcomeEnabled,
                  activeChallengeId,
                });
                await refresh();
                return '운영 설정을 저장했습니다. 새 참가와 글 제출, 공개 페이지에 적용됩니다.';
              })
            }
          >
            <label>
              행사 단계
              <select
                value={settings.phase}
                disabled={busy}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    phase: e.target.value as EventConfig['phase'],
                  })
                }
              >
                <option value="A">A · 행사 참여</option>
                <option value="B">B · 접수 마감</option>
                <option value="C">C · 입학식</option>
              </select>
            </label>
            <p className="muted">
              타자 참가와 글 접수는 A 단계에서만 열립니다. 신입생 페이지 공개는 별도로 선택합니다.
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.typingEnabled}
                disabled={busy}
                onChange={(e) => setSettings({ ...settings, typingEnabled: e.target.checked })}
              />
              타자 대회 접수 허용
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.submissionsEnabled}
                disabled={busy}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    submissionsEnabled: e.target.checked,
                  })
                }
              />
              후배에게 한마디 접수 허용
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.welcomeEnabled}
                disabled={busy}
                onChange={(e) => setSettings({ ...settings, welcomeEnabled: e.target.checked })}
              />
              승인한 글을 신입생 페이지에 공개
            </label>
            <label>
              참가 화면에서 사용할 문구
              <select
                value={settings.activeChallengeId}
                disabled={busy}
                required
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    activeChallengeId: e.target.value,
                  })
                }
              >
                {challenges
                  .filter((c) => !c.deleted && c.enabled)
                  .map((c) => (
                    <option key={c.challengeId} value={c.challengeId}>
                      {c.title} · {c.practice ? '연습' : '공식'}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              운영 설정 저장
            </button>
          </form>
        ) : (
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await setEvent((await adminContext()).db, 'B');
                await refresh();
                await load();
                return '접수를 닫은 상태로 기본 설정과 연습 문구를 만들었습니다.';
              })
            }
          >
            기본 설정 만들기
          </button>
        )}
      </section>
      <section className="panel">
        <div className="section-top">
          <h3>대회 문구</h3>
          <button disabled={busy} onClick={() => edit()}>
            새 문구 추가
          </button>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
          />
          삭제한 문구도 보기
        </label>
        <ul className="review-list">
          {challenges
            .filter((c) => showDeleted || !c.deleted)
            .map((challenge) => (
              <li key={challenge.challengeId}>
                <div className="section-top">
                  <strong>{challenge.title}</strong>
                  <span className="badge">
                    {challenge.deleted
                      ? '삭제 보관'
                      : challenge.challengeId === config?.activeChallengeId
                        ? '현재 사용'
                        : challenge.enabled
                          ? '접수 가능'
                          : '접수 중지'}{' '}
                    · {challenge.practice ? '연습' : '공식'}
                  </span>
                </div>
                <p className="letter-content preview-text">{challenge.text}</p>
                <small className="break-anywhere">
                  {challenge.referenceKeystrokes}타 · {challenge.challengeId}
                </small>
                <div className="actions">
                  {!challenge.deleted && (
                    <button disabled={busy} onClick={() => edit(challenge)}>
                      수정
                    </button>
                  )}
                  <button
                    disabled={busy || challenge.challengeId === config?.activeChallengeId}
                    onClick={() =>
                      void action(async () => {
                        await changeChallenge(
                          (await adminContext()).db,
                          challenge.challengeId,
                          challenge.deleted
                            ? { deleted: false, enabled: false }
                            : { enabled: !challenge.enabled },
                        );
                        await load();
                        return challenge.deleted
                          ? '문구를 복원했습니다. 사용할 때 접수를 켜 주세요.'
                          : '문구 접수 상태를 변경했습니다.';
                      })
                    }
                  >
                    {challenge.deleted ? '복원' : challenge.enabled ? '접수 끄기' : '접수 켜기'}
                  </button>
                  {!challenge.deleted && (
                    <button
                      className="danger"
                      disabled={busy || challenge.challengeId === config?.activeChallengeId}
                      onClick={() => {
                        if (
                          !window.confirm(
                            '이 문구를 삭제 목록으로 옮길까요? 기존 기록은 보존되며 문구를 복원할 수 있습니다.',
                          )
                        )
                          return;
                        void action(async () => {
                          await changeChallenge((await adminContext()).db, challenge.challengeId, {
                            deleted: true,
                            enabled: false,
                          });
                          await load();
                          return '문구를 삭제 목록으로 옮겼습니다.';
                        });
                      }}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </li>
            ))}
        </ul>
        <p className="muted">
          현재 사용 중인 문구를 삭제하려면 운영 상태에서 다른 문구로 먼저 바꾸세요.
        </p>
      </section>
      <section className="panel" id="challenge-editor">
        <h3>{editing ? '문구 수정' : '새 문구 추가'}</h3>
        <form
          onSubmit={(event) =>
            submit(event, async () => {
              const id = await saveChallenge(
                (await adminContext()).db,
                { title, text, practice },
                editing,
              );
              const forked = editing && id !== editing.challengeId;
              edit();
              await load();
              return forked
                ? '수정한 문구를 새 버전으로 저장했습니다. 운영 상태에서 새 버전을 선택하세요. 이전 기록은 그대로 유지됩니다.'
                : '문구를 저장했습니다. 참가 화면에서 사용하려면 운영 상태에서 선택하세요.';
            })
          }
        >
          <label>
            문구 제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={80}
              disabled={busy}
            />
          </label>
          <label>
            입력할 문구
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              rows={5}
              maxLength={1000}
              disabled={busy}
            />
          </label>
          <p className="muted">
            기준 {countKeystrokes(text.trim().replace(/\s+/g, ' '))}타 · 공백과 줄바꿈은 한 칸으로
            정리합니다.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={practice}
              onChange={(e) => setPractice(e.target.checked)}
              disabled={busy}
            />
            연습 문구 (해제하면 공식 대회 문구)
          </label>
          <p className="muted">
            본문·연습 여부를 바꾸면 기존 기록을 보호하기 위해 새 버전으로 저장합니다. 제목만 바꾸면
            현재 버전을 수정합니다.
          </p>
          <div className="actions">
            <button className="primary" disabled={busy}>
              {busy ? '저장 중…' : '문구 저장'}
            </button>
            {editing && (
              <button type="button" disabled={busy} onClick={() => edit()}>
                수정 취소
              </button>
            )}
          </div>
        </form>
      </section>
    </>
  );
}
