import { deviceIdentity, errorMessage, getClients } from '../firebase.js';
import { readEvent, submitLetter } from '../database.js';
import { localHref, normalizeText, unicodeLength, validateSubmission } from '../common.js';

document.querySelector('header a').href = localHref('./admin/');

const form = document.querySelector('#write-form');
const nickname = document.querySelector('#nickname');
const content = document.querySelector('#content');
const consent = document.querySelector('#consent');
const submitButton = document.querySelector('#submit');
const resetButton = document.querySelector('#reset');
const error = document.querySelector('#error');
const eventStatus = document.querySelector('#event-status');
const retryEvent = document.querySelector('#retry-event');
const pendingStatus = document.querySelector('#pending-status');
const editor = document.querySelector('#editor');
const complete = document.querySelector('#complete');
const counter = document.querySelector('#content-count');

let submissionKey = crypto.randomUUID();
let pending = null;
let busy = false;
let accepted = false;
let config = null;
let eventRequest = null;

function showError(message = '') {
  error.textContent = message;
  error.hidden = !message;
}

function updateControls() {
  const locked = busy || !!pending;
  nickname.disabled = locked;
  content.disabled = locked;
  consent.disabled = locked;
  submitButton.disabled = busy || !!eventRequest || (!pending && !config?.submissionsEnabled);
  submitButton.textContent = busy ? '제출 중' : pending ? '다시 제출' : '제출';
  resetButton.disabled =
    busy || (!nickname.value && !content.value && !consent.checked && !pending);
  pendingStatus.hidden = !pending || busy;
  retryEvent.disabled = !!eventRequest || busy;
  form.setAttribute('aria-busy', String(busy));
  const length = unicodeLength(normalizeText(content.value));
  counter.textContent = `${length} / 700자 · 최소 10자`;
  counter.className = length > 700 ? 'error' : 'muted';
}

function checkEvent() {
  if (eventRequest) return eventRequest;
  eventStatus.textContent = '접수 상태 확인 중';
  eventRequest = (async () => {
    try {
      config = await readEvent((await getClients()).deviceDb);
      eventStatus.textContent = config.submissionsEnabled ? '접수 중' : '접수 마감';
      retryEvent.hidden = config.submissionsEnabled;
      return config;
    } catch (reason) {
      config = null;
      eventStatus.textContent = '접수 상태 확인 실패';
      retryEvent.hidden = false;
      showError(errorMessage(reason));
      return null;
    } finally {
      eventRequest = null;
      updateControls();
    }
  })();
  updateControls();
  return eventRequest;
}

form.addEventListener('input', updateControls);
retryEvent.addEventListener('click', () => {
  showError();
  void checkEvent();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const candidate = pending ?? {
    nickname: nickname.value,
    content: content.value,
    consentToPublish: consent.checked,
    submissionKey,
  };
  const validated = validateSubmission(candidate);
  if (!validated.value) {
    showError(validated.error);
    return;
  }
  busy = true;
  showError();
  updateControls();
  try {
    if (!pending) {
      const latest = await checkEvent();
      if (!latest?.submissionsEnabled) {
        if (latest) showError('접수가 마감되었습니다.');
        return;
      }
    }
    pending = validated.value;
    updateControls();
    const { db, uid } = await deviceIdentity();
    const receipt = await submitLetter(db, uid, pending);
    accepted = true;
    nickname.value = '';
    content.value = '';
    consent.checked = false;
    pending = null;
    document.querySelector('#receipt').textContent = receipt.id;
    editor.hidden = true;
    complete.hidden = false;
    eventStatus.hidden = true;
    retryEvent.hidden = true;
    complete.scrollIntoView({ block: 'start' });
    complete.focus({ preventScroll: true });
    try {
      sessionStorage.setItem('ohsung-last-receipt', receipt.id);
    } catch {
      /* Optional receipt. */
    }
  } catch (reason) {
    showError(errorMessage(reason));
  } finally {
    busy = false;
    updateControls();
  }
});

function reset() {
  form.reset();
  submissionKey = crypto.randomUUID();
  pending = null;
  accepted = false;
  showError();
  complete.hidden = true;
  editor.hidden = false;
  eventStatus.hidden = false;
  updateControls();
  void checkEvent();
  content.focus();
}

resetButton.addEventListener('click', () => {
  const message = pending
    ? '접수가 이미 저장되었을 수 있습니다. 접수 내역을 확인한 뒤 입력을 초기화할까요?'
    : '입력 내용을 초기화할까요?';
  if (!busy && window.confirm(message)) reset();
});
document.querySelector('#new-letter').addEventListener('click', reset);
window.addEventListener('beforeunload', (event) => {
  if (!accepted && (busy || pending || content.value || nickname.value || consent.checked)) {
    event.preventDefault();
    event.returnValue = '';
  }
});

updateControls();
void checkEvent();
