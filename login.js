import { loginAdmin, errorMessage } from './firebase.js';
import { escapeHtml as html, localHref } from './common.js';

const sessionKey = `student:${new URL('.', import.meta.url).pathname}`;

export function studentIdentity(studentId, name) {
  const id = String(studentId ?? '')
    .normalize('NFKC')
    .trim();
  const value = String(name ?? '')
    .normalize('NFC')
    .trim();
  if (!/^\d{4,10}$/.test(id)) throw new Error('학번은 숫자 4~10자리로 입력하세요.');
  if (!value || Array.from(value).length > 30 || /[\p{Cc}\p{Cf}]/u.test(value))
    throw new Error('이름은 1~30자로 입력하세요.');
  return { studentId: id, name: value };
}

export function mountLogin({ container, adminPath, onStudent, onLogout, canLogout = () => true }) {
  let student = null;
  let admin = false;
  let busy = false;
  container.innerHTML = `<section id="login-panel" class="panel login-panel">
    <h2>로그인</h2>
    <div class="actions" aria-label="로그인 종류"><button id="student-mode" type="button" aria-pressed="true">학생</button><button id="admin-mode" type="button" aria-pressed="false">관리자</button></div>
    <form id="entry-form">
      <label><span id="identity-label">학번</span><input name="identity" required inputmode="numeric" maxlength="10" autocomplete="off" /></label>
      <label><span id="credential-label">이름</span><input name="credential" required maxlength="30" autocomplete="off" /></label>
      <p id="login-error" class="error" role="alert" hidden></p>
      <button type="submit">로그인</button>
    </form>
    <a id="admin-help" href="${html(localHref(adminPath))}" hidden>비밀번호 재설정</a>
  </section>
  <div id="student-session" class="section-top" hidden><span id="student-name"></span><button id="student-logout" type="button">로그아웃</button></div>`;
  const $ = (selector) => container.querySelector(selector);
  const form = $('#entry-form');
  const error = $('#login-error');
  function showStudent(value) {
    student = value;
    $('#login-panel').hidden = true;
    $('#student-session').hidden = false;
    $('#student-name').textContent = `${value.studentId} ${value.name}`;
    onStudent({ ...value });
  }
  function setMode(isAdmin) {
    if (busy) return;
    admin = isAdmin;
    form.reset();
    error.hidden = true;
    $('#student-mode').setAttribute('aria-pressed', String(!admin));
    $('#admin-mode').setAttribute('aria-pressed', String(admin));
    $('#identity-label').textContent = admin ? '이메일' : '학번';
    $('#credential-label').textContent = admin ? '비밀번호' : '이름';
    form.elements.identity.type = admin ? 'email' : 'text';
    form.elements.identity.inputMode = admin ? 'email' : 'numeric';
    form.elements.identity.maxLength = admin ? 254 : 10;
    form.elements.identity.autocomplete = admin ? 'username' : 'off';
    form.elements.credential.type = admin ? 'password' : 'text';
    form.elements.credential.maxLength = admin ? 4096 : 30;
    form.elements.credential.autocomplete = admin ? 'current-password' : 'off';
    $('#admin-help').hidden = true;
    form.elements.identity.focus();
  }
  $('#student-mode').addEventListener('click', () => setMode(false));
  $('#admin-mode').addEventListener('click', () => setMode(true));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(form);
    busy = true;
    error.hidden = true;
    $('#admin-help').hidden = true;
    container.setAttribute('aria-busy', 'true');
    container.querySelectorAll('input, button').forEach((control) => {
      control.disabled = true;
    });
    try {
      if (admin) {
        await loginAdmin(values.get('identity'), values.get('credential'));
        form.reset();
        location.assign(localHref(adminPath));
      } else {
        const value = studentIdentity(values.get('identity'), values.get('credential'));
        try {
          sessionStorage.setItem(sessionKey, JSON.stringify(value));
        } catch {
          /* 탭의 메모리 세션을 사용합니다. */
        }
        form.reset();
        showStudent(value);
      }
    } catch (reason) {
      error.textContent = errorMessage(reason);
      error.hidden = false;
      if (admin) {
        form.elements.credential.value = '';
        $('#admin-help').hidden = false;
      }
    } finally {
      busy = false;
      container.setAttribute('aria-busy', 'false');
      container.querySelectorAll('input, button').forEach((control) => {
        control.disabled = false;
      });
    }
  });
  $('#student-logout').addEventListener('click', () => {
    if (busy || !canLogout()) return;
    student = null;
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      /* 메모리 세션도 비웁니다. */
    }
    $('#student-name').textContent = '';
    $('#student-session').hidden = true;
    $('#login-panel').hidden = false;
    setMode(false);
    onLogout();
  });
  try {
    const saved = JSON.parse(sessionStorage.getItem(sessionKey));
    if (saved) showStudent(studentIdentity(saved.studentId, saved.name));
  } catch {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      /* 저장 공간을 사용할 수 없습니다. */
    }
  }
  return { current: () => (student ? { ...student } : null) };
}
