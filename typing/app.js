import { getClients, errorMessage } from '../firebase.js';
import { readEvent, readChallenge } from '../database.js';
import { downloadFile, localHref } from '../common.js';
import {
  initialInputState,
  commitInput,
  compositionStart,
  compositionEnd,
  isComplete,
} from './engine.js';
import { calculateScore } from './scoring.js';
import { saveResult } from './storage.js';

const elements = Object.fromEntries(
  [
    'event-status',
    'reload',
    'participant-form',
    'participant-id',
    'display-name',
    'start',
    'challenge-title',
    'attempt-status',
    'elapsed',
    'errors',
    'score',
    'challenge',
    'typing-input',
    'feedback',
    'result',
    'stop',
    'retry',
    'backup',
    'reset',
    'reference-keys',
  ].map((id) => [id, document.getElementById(id)]),
);

let config = null;
let challenge = null;
let attempt = null;
let participant = null;
let status = 'ready';
let loading = false;
let saving = false;
let engine = initialInputState();
let startedAt = null;
let elapsed = 0;
let result = null;
let spans = [];
let timer = null;

document.querySelector('.page-header a').href = localHref('./admin/');

function message(text, isError = false) {
  elements.feedback.textContent = text;
  elements.feedback.classList.toggle('error', isError);
}

function updateControls() {
  const active = status === 'armed' || status === 'running';
  elements['participant-id'].disabled = loading || status !== 'ready';
  elements['display-name'].disabled = loading || status !== 'ready';
  elements.start.hidden = status !== 'ready';
  elements.start.disabled =
    loading || !config?.typingEnabled || !challenge?.enabled || challenge.deleted;
  elements.start.textContent = loading ? '확인 중' : '시작';
  elements['typing-input'].disabled = !active;
  elements.stop.hidden = !active;
  elements.retry.hidden = status !== 'failed';
  elements.backup.hidden = status !== 'failed';
  elements.reset.hidden = !['saved', 'invalid'].includes(status);
  elements['attempt-status'].textContent = {
    ready: '',
    armed: '첫 입력 대기',
    running: '측정 중',
    saving: '저장 중',
    saved: '저장 완료',
    failed: '저장 실패',
    invalid: '중단',
  }[status];
}

function transition(next) {
  status = next;
  if (next !== 'running') {
    clearInterval(timer);
    timer = null;
  }
  updateControls();
}

function showChallenge(current) {
  elements['challenge-title'].textContent = current.title;
  elements['reference-keys'].textContent = current.referenceKeystrokes;
  elements.challenge.setAttribute('aria-label', `입력할 문구: ${current.text}`);
  spans = Array.from(current.text, (character) => {
    const span = document.createElement('span');
    span.textContent = character;
    return span;
  });
  elements.challenge.replaceChildren(...spans);
  highlight('');
}

function highlight(value) {
  const chars = Array.from(value);
  const target = Array.from((attempt ?? challenge)?.text ?? '');
  spans.forEach((span, index) => {
    span.className =
      index < chars.length
        ? chars[index] === target[index]
          ? 'correct'
          : 'incorrect'
        : index === chars.length
          ? 'cursor'
          : '';
  });
}

function eventStatus() {
  if (!config || !challenge) return;
  elements['event-status'].textContent = !config.typingEnabled
    ? '접수 마감'
    : !challenge.enabled || challenge.deleted
      ? '문구 접수 중지'
      : `${challenge.practice ? '연습' : '공식'} · ${challenge.referenceKeystrokes}타`;
}

async function refresh() {
  loading = true;
  elements.reload.hidden = true;
  updateControls();
  try {
    const { deviceDb } = await getClients();
    const nextConfig = await readEvent(deviceDb);
    const nextChallenge = await readChallenge(deviceDb, nextConfig.activeChallengeId);
    config = nextConfig;
    challenge = nextChallenge;
    if (!attempt) showChallenge(challenge);
    eventStatus();
    return { config, challenge };
  } catch (reason) {
    config = null;
    challenge = null;
    elements['event-status'].textContent = errorMessage(reason);
    elements.reload.hidden = false;
    throw reason;
  } finally {
    loading = false;
    updateControls();
  }
}

function beginTiming() {
  if (status !== 'armed') return;
  startedAt = performance.now();
  transition('running');
  timer = setInterval(() => {
    elapsed = performance.now() - startedAt;
    elements.elapsed.textContent = (elapsed / 1000).toFixed(1);
    if (elapsed > 3600000) invalidate('제한 시간 1시간을 초과했습니다.');
  }, 100);
}

async function persist(record) {
  if (saving) return;
  saving = true;
  transition('saving');
  message('기록 저장 중');
  try {
    const saved = await saveResult(record);
    transition('saved');
    message(saved.backupSaved ? '저장 완료 · 운영진 확인 대기' : '서버 저장 완료 · 기기 백업 실패');
  } catch (reason) {
    transition('failed');
    message(errorMessage(reason), true);
  } finally {
    saving = false;
  }
}

function process(value, endedComposition = false) {
  if (!['armed', 'running'].includes(status) || !attempt) return;
  if (value.length) beginTiming();
  engine = endedComposition
    ? compositionEnd(engine, value, attempt.text)
    : commitInput(engine, value, attempt.text);
  elements.errors.textContent = engine.errors;
  highlight(value);
  message(`입력 ${Array.from(value).length} / ${Array.from(attempt.text).length}자`);
  if (!isComplete(engine, attempt.text) || startedAt === null) return;
  elapsed = Math.max(1, performance.now() - startedAt);
  result = {
    id: crypto.randomUUID(),
    participantId: participant.id,
    displayName: participant.name,
    challengeId: attempt.challengeId,
    elapsedMs: elapsed,
    ...calculateScore(attempt.referenceKeystrokes, elapsed, engine.errors),
    errors: engine.errors,
    completedAt: new Date().toISOString(),
    prizeReceived: false,
    practice: attempt.practice,
  };
  elements.elapsed.textContent = (elapsed / 1000).toFixed(2);
  elements.score.textContent = result.score;
  elements.result.textContent = `${result.speed}타 · 오타 ${result.errors}회 · ${result.score}점`;
  elements.result.hidden = false;
  void persist(result);
}

function invalidate(reason) {
  if (!['armed', 'running'].includes(status)) return;
  transition('invalid');
  message(reason, true);
}

elements['participant-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  if (loading || status !== 'ready') return;
  const id = elements['participant-id'].value.normalize('NFC').trim();
  const name = elements['display-name'].value.normalize('NFC').trim();
  if (!id || !name || Array.from(id).length > 30 || Array.from(name).length > 30) {
    message('참가번호와 이름을 각각 1~30자로 입력하세요.', true);
    return;
  }
  try {
    const current = await refresh();
    if (!current.config.typingEnabled || !current.challenge.enabled || current.challenge.deleted) {
      message('현재 접수할 수 없습니다.', true);
      return;
    }
    participant = { id, name };
    attempt = { ...current.challenge };
    engine = initialInputState();
    startedAt = null;
    elapsed = 0;
    result = null;
    elements['typing-input'].value = '';
    elements.elapsed.textContent = '0.0';
    elements.errors.textContent = '0';
    elements.score.textContent = '—';
    elements.result.hidden = true;
    showChallenge(attempt);
    transition('armed');
    message('첫 입력부터 측정합니다.');
    elements['typing-input'].focus();
  } catch (reason) {
    message(errorMessage(reason), true);
  }
});

const input = elements['typing-input'];
for (const name of ['paste', 'drop'])
  input.addEventListener(name, (event) => {
    event.preventDefault();
    message('직접 입력하세요.', true);
  });
input.addEventListener('beforeinput', (event) => {
  const type = event.inputType ?? '';
  if (/Paste|Drop|Replacement|history|Yank/i.test(type)) {
    event.preventDefault();
    message('직접 입력하세요.', true);
  } else if (type.startsWith('insert')) beginTiming();
});
input.addEventListener('compositionstart', () => {
  if (!['armed', 'running'].includes(status)) return;
  beginTiming();
  engine = compositionStart(engine);
});
input.addEventListener('compositionend', () => process(input.value, true));
input.addEventListener('input', () => process(input.value));
window.addEventListener('blur', () => {
  if (status === 'running') invalidate('창 이탈로 중단했습니다. 기록은 저장하지 않았습니다.');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && status === 'running')
    invalidate('창 이탈로 중단했습니다. 기록은 저장하지 않았습니다.');
});
window.addEventListener('beforeunload', (event) => {
  if (!['armed', 'running', 'saving', 'failed'].includes(status)) return;
  event.preventDefault();
  event.returnValue = '';
});

elements.reload.addEventListener('click', () => {
  void refresh().catch(() => {});
});
elements.stop.addEventListener('click', () =>
  invalidate('중단했습니다. 기록은 저장하지 않았습니다.'),
);
elements.retry.addEventListener('click', () => {
  if (result) void persist(result);
});
elements.backup.addEventListener('click', () => {
  if (result)
    downloadFile(`typing-${result.id}.json`, JSON.stringify(result, null, 2), 'application/json');
});
elements.reset.addEventListener('click', () => {
  attempt = null;
  participant = null;
  engine = initialInputState();
  startedAt = null;
  result = null;
  elapsed = 0;
  input.value = '';
  elements['participant-form'].reset();
  elements.elapsed.textContent = '0.0';
  elements.errors.textContent = '0';
  elements.score.textContent = '—';
  elements.result.hidden = true;
  transition('ready');
  message('시작 후 직접 입력하세요.');
  void refresh().catch(() => {});
  elements['participant-id'].focus();
});

void refresh().catch(() => {});
