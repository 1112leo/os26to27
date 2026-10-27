import {
  inspectEmailAction,
  finishPasswordReset,
  finishEmailAction,
  errorMessage,
} from '../../firebase.js';

const params = new URLSearchParams(location.search);
let mode = params.get('mode');
let code = params.get('oobCode');
const status = document.querySelector('#status');
const section = document.querySelector('#action');
const form = document.querySelector('#reset-password');
const confirmation = document.querySelector('#confirm-email');
const back = document.querySelector('#return');
const titles = {
  resetPassword: '비밀번호 재설정',
  verifyEmail: '이메일 확인',
  verifyAndChangeEmail: '이메일 변경',
  recoverEmail: '이메일 복구',
};
let busy = false;

// 인증 코드를 주소 기록이나 후속 요청의 Referer에 남기지 않습니다.
const localEmulator =
  ['localhost', '127.0.0.1'].includes(location.hostname) && params.get('emulator') === '1';
history.replaceState(null, '', location.pathname + (localEmulator ? '?emulator=1' : ''));
const base = new URL('../../', import.meta.url);
const allowed = ['write/admin/', 'typing/admin/'].map((path) => new URL(path, base));
const requested = params.get('continueUrl');
let target = allowed[0];
if (requested) {
  try {
    const candidate = new URL(requested);
    const page = allowed.find(
      (page) => page.origin === candidate.origin && page.pathname === candidate.pathname,
    );
    if (page) {
      target = page;
      if (candidate.hash === '#account') target.hash = '#account';
    }
  } catch {
    /* 잘못된 복귀 주소는 사용하지 않습니다. */
  }
}
if (localEmulator) target.searchParams.set('emulator', '1');
back.href = target.href;

function message(text, error = false) {
  status.textContent = text;
  status.className = error ? 'error' : '';
  status.setAttribute('role', error ? 'alert' : 'status');
}
async function complete(work) {
  if (busy) return;
  busy = true;
  const controls = [...section.querySelectorAll('input, button')];
  controls.forEach((control) => (control.disabled = true));
  section.setAttribute('aria-busy', 'true');
  try {
    await work();
    code = '';
    form.reset();
    section.hidden = true;
    message('변경 완료. 관리자 페이지에서 다시 로그인하세요.');
  } catch (reason) {
    message(errorMessage(reason), true);
  } finally {
    controls.forEach((control) => (control.disabled = false));
    section.setAttribute('aria-busy', 'false');
    busy = false;
  }
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = new FormData(form);
  if (values.get('password') !== values.get('confirmation')) {
    message('비밀번호 확인이 일치하지 않습니다.', true);
    return;
  }
  void complete(() => finishPasswordReset(code, values.get('password')));
});
confirmation.addEventListener('click', () => void complete(() => finishEmailAction(mode, code)));

const importForm = document.querySelector('#import-link');
importForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const link = new URL(new FormData(importForm).get('link'));
    if (
      link.protocol !== 'https:' ||
      link.hostname !== 'os20th.firebaseapp.com' ||
      link.pathname !== '/__/auth/action'
    )
      throw new Error('이 프로젝트의 Firebase 메일 링크를 입력하세요.');
    params.delete('mode');
    params.delete('oobCode');
    for (const name of ['mode', 'oobCode'])
      for (const value of link.searchParams.getAll(name)) params.append(name, value);
    mode = params.get('mode');
    code = params.get('oobCode');
    importForm.reset();
    void loadAction();
  } catch (reason) {
    message(errorMessage(reason), true);
  }
});

async function loadAction() {
  try {
    if (
      !Object.hasOwn(titles, mode) ||
      params.getAll('mode').length !== 1 ||
      !code ||
      code.length > 4096 ||
      params.getAll('oobCode').length !== 1
    )
      throw new Error('유효한 이메일 링크가 없습니다. 메일의 링크에서 다시 여세요.');
    document.querySelector('#title').textContent = titles[mode];
    document.title = titles[mode];
    // 메일 URL의 apiKey는 사용하지 않고, 이 사이트의 Firebase 설정으로 검증합니다.
    const action = await inspectEmailAction(mode, code);
    document.querySelector('#email').textContent = action.email ?? '';
    section.hidden = false;
    importForm.hidden = true;
    message('');
    if (mode === 'resetPassword') {
      form.hidden = false;
      form.elements.password.focus();
    } else {
      confirmation.hidden = false;
      confirmation.textContent = `${titles[mode]} 확인`;
    }
  } catch (reason) {
    code = '';
    message(errorMessage(reason), true);
  }
}
if (code) void loadAction();
else message('받은 메일에서 링크 주소를 복사해 입력하세요.');
