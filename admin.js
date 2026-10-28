import {
  adminContext,
  loginAdmin,
  logoutAdmin,
  watchAdminSession,
  errorMessage,
  changeAdminEmail,
  changeAdminPassword,
  createOperator,
  resetAdminPassword,
  withDeadline,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from './firebase.js';
import {
  readLetters,
  saveLetter,
  deleteLetter,
  synchronizePublicLetters,
  exportFirebase,
  readTyping,
  saveTyping,
  deleteTyping,
  reviewTyping,
  readChallenges,
  readEvent,
  setEvent,
  saveChallenge,
  changeChallenge,
} from './database.js';
import {
  escapeHtml as html,
  localHref,
  downloadFile,
  koreanDate,
  normalizeText,
} from './common.js';
import { rankResults, rankedAttempts, calculateScore, countKeystrokes } from './typing/scoring.js';
import {
  pendingResults,
  synchronizePending,
  listLocalResults,
  resultsCsv,
} from './typing/storage.js';
import {
  readStudents,
  readStudentHistory,
  moderateStudent,
  studentGrade,
  writeRestricted,
  readSessionPolicy,
  saveSessionPolicy,
  resetStudentPassword,
  canResetStudentPassword,
  DEFAULT_SESSION_POLICY,
} from './students.js';

const root = document.querySelector('#admin');
const feature = document.body.dataset.feature;
const featureTitle = { typing: '타자 관리', write: '글 관리', welcome: '공개 글 관리' }[feature];
const firstTab = feature === 'typing' ? 'records' : 'letters';
const $ = (selector, scope = document) => scope.querySelector(selector);
const labels = { pending: '검토 대기', approved: '승인', rejected: '제외' };
const verification = { pending: '확인 대기', verified: '확인', rejected: '제외' };
let session = { authenticated: false };
let busy = false;
let viewSequence = 0;
let letters = [];
let results = [];
let challenges = [];
let students = [];
let sessionPolicy = { ...DEFAULT_SESSION_POLICY };
let studentFilter = { query: '', grade: '' };
let studentPage = 1;
let studentDetailSequence = 0;
let config;
let letterPage = 1;
let resultPage = 1;
let letterFilter = { query: '', status: feature === 'welcome' ? 'approved' : '', sort: 'desc' };
let resultFilter = { query: '', version: '', verification: 'all', view: 'ranking' };
let renderedHash = location.hash;
const savedForms = new WeakMap();

function formState(form) {
  return JSON.stringify(
    [...form.elements]
      .filter((control) => control.name)
      .map((control) => [
        control.name,
        control.type === 'checkbox' ? control.checked : control.value,
      ]),
  );
}
function dirtyForms(container = root) {
  const forms = container?.matches('form')
    ? [container]
    : [...(container?.querySelectorAll('form') ?? [])];
  return forms.filter((form) => savedForms.has(form) && savedForms.get(form) !== formState(form));
}
function confirmDiscard(container = root) {
  const forms = dirtyForms(container);
  if (forms.length && !confirm('저장하지 않은 변경을 버릴까요?')) return false;
  forms.forEach((form) => {
    for (const [name, value] of JSON.parse(savedForms.get(form))) {
      const control = [...form.elements].find((element) => element.name === name);
      if (control.type === 'checkbox') control.checked = value;
      else control.value = value;
    }
  });
  return true;
}
function closeEditor() {
  if (confirmDiscard($('#editor'))) $('#editor').replaceChildren();
}
function restoreHash() {
  const url = new URL(location.href);
  url.hash = renderedHash;
  history.replaceState(history.state, '', url);
}
function applySession(next) {
  const entering = !session.authenticated || next.uid !== session.uid;
  session = next;
  if (!next.authenticated) {
    letters = [];
    results = [];
    challenges = [];
    students = [];
    config = undefined;
    if (!$('#login')) showLogin();
  } else if (entering) showAdmin();
  else if ($('#identity')) $('#identity').textContent = next.email ?? '';
}
function sessionFailed(reason) {
  session = { authenticated: false };
  letters = [];
  results = [];
  challenges = [];
  students = [];
  config = undefined;
  showLogin(errorMessage(reason));
}

const field = (name, label, value = '', type = 'text', attrs = '') =>
  `<label>${html(label)}<input name="${name}" type="${type}" value="${html(value)}" ${attrs}></label>`;
const area = (name, label, value = '', rows = 5) =>
  `<label>${html(label)}<textarea name="${name}" rows="${rows}">${html(value)}</textarea></label>`;
const select = (name, label, value, options) =>
  `<label>${html(label)}<select name="${name}">${options
    .map(
      ([key, text]) =>
        `<option value="${html(key)}"${String(value) === String(key) ? ' selected' : ''}>${html(text)}</option>`,
    )
    .join('')}</select></label>`;
const checkbox = (name, label, checked = false) =>
  `<label class="checkbox"><input type="checkbox" name="${name}"${checked ? ' checked' : ''}>${html(label)}</label>`;
const data = (form) => Object.fromEntries(new FormData(form));
const alertError = (reason) => setStatus(errorMessage(reason), true);
function setStatus(text = '', error = false) {
  const element = $('#status');
  if (!element) return;
  element.setAttribute('role', error ? 'alert' : 'status');
  element.textContent = text;
  element.className = error ? 'error' : 'notice';
  element.hidden = !text;
}
async function run(work) {
  if (busy) return;
  busy = true;
  root.setAttribute('aria-busy', 'true');
  setStatus('처리 중');
  const controls = [...root.querySelectorAll('button, input, textarea, select')];
  const previous = controls.map((control) => control.disabled);
  controls.forEach((control) => (control.disabled = true));
  try {
    await work();
  } catch (reason) {
    alertError(reason);
  } finally {
    controls.forEach((control, index) => (control.disabled = previous[index]));
    busy = false;
    root.setAttribute('aria-busy', 'false');
    if (session.authenticated && location.hash !== renderedHash) {
      if (confirmDiscard()) void renderTab();
      else restoreHash();
    }
  }
}
function submit(form, work) {
  if (form.id !== 'login') savedForms.set(form, formState(form));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = data(form);
    void run(async () => {
      const saved = await work(values);
      if (saved !== false && form.isConnected) savedForms.set(form, formState(form));
    });
  });
}
function managementLinks() {
  return `<nav class="actions" aria-label="관리 기능">${[
    ['typing', '타자 관리'],
    ['write', '글 관리'],
    ['welcome', '공개 글 관리'],
  ]
    .map(
      ([name, title]) =>
        `<a href="${html(localHref(`../../${name}/admin/`))}"${name === feature ? ' aria-current="page"' : ''}>${title}</a>`,
    )
    .join('')}</nav>`;
}
function showLogin(error = '') {
  viewSequence++;
  root.innerHTML = `<header class="page-header"><h1>관리자 로그인</h1><a href="${html(localHref('../'))}">돌아가기</a></header>${managementLinks()}
    <p id="status" role="status" hidden></p><form class="panel" id="login">
      ${field('email', '이메일', '', 'email', 'required autocomplete="username"')}
      ${field('password', '비밀번호', '', 'password', 'required autocomplete="current-password"')}
      <div class="actions"><button type="submit">로그인</button><button type="button" id="reset-password">비밀번호 재설정</button></div></form>`;
  if (error) setStatus(error, true);
  submit($('#login'), async (values) => {
    applySession(await loginAdmin(values.email, values.password));
  });
  $('#reset-password').onclick = () =>
    void run(async () => {
      const email = $('#login [name=email]').value;
      if (!email) throw new Error('이메일을 입력하세요.');
      await resetAdminPassword(email);
      setStatus(
        '등록된 이메일이면 재설정 메일이 전송됩니다. 메일의 링크에서 새 비밀번호를 설정하세요.',
      );
    });
}
function showAdmin() {
  root.innerHTML = `<header class="page-header"><h1>${featureTitle}</h1><a href="${html(localHref('../'))}">돌아가기</a></header>${managementLinks()}
    <div class="section-top"><span id="identity">${html(session.email)}</span><button id="logout">로그아웃</button></div>
    <nav class="admin-nav" aria-label="관리자 메뉴"><a href="#${firstTab}">${feature === 'typing' ? '타자 기록' : '글'}</a><a href="#students">학생</a><a href="#settings">설정</a><a href="#account">계정</a></nav>
    <p id="status" role="status" hidden></p><div id="view"></div>`;
  $('#logout').onclick = () =>
    void run(async () => {
      if (!confirmDiscard()) {
        setStatus();
        return;
      }
      await logoutAdmin();
      applySession({ authenticated: false });
    });
  void renderTab();
}
async function renderTab() {
  if (!session.authenticated || !confirmDiscard()) return;
  const sequence = ++viewSequence;
  renderedHash = location.hash;
  const tab = ['settings', 'account', 'students', firstTab].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : firstTab;
  document.querySelectorAll('.admin-nav a').forEach((link) => {
    const active = link.hash === `#${tab}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('#view').textContent = '불러오는 중';
  $('#view').setAttribute('aria-busy', 'true');
  setStatus();
  try {
    const { db } = await adminContext();
    let loaded;
    if (tab === 'letters') loaded = await readLetters(db);
    if (tab === 'records')
      loaded = await Promise.all([readTyping(db), readChallenges(db), readStudents(db)]);
    if (tab === 'settings')
      loaded = await Promise.all([
        readEvent(db).catch(() => null),
        readChallenges(db),
        readSessionPolicy(db),
      ]);
    if (tab === 'students') loaded = await Promise.all([readStudents(db), readSessionPolicy(db)]);
    if (sequence !== viewSequence) return;
    if (tab === 'letters') {
      letters = loaded;
      lettersView();
    } else if (tab === 'records') {
      [results, challenges, students] = loaded;
      await recordsView();
    } else if (tab === 'settings') {
      [config, challenges, sessionPolicy] = loaded;
      settingsView();
    } else if (tab === 'students') {
      [students, sessionPolicy] = loaded;
      studentsView();
    } else await accountView(db, sequence);
  } catch (reason) {
    if (sequence === viewSequence) {
      $('#view').innerHTML = '<button id="retry-view">다시 불러오기</button>';
      $('#retry-view').onclick = renderTab;
      alertError(reason);
    }
  } finally {
    if (sequence === viewSequence) $('#view')?.setAttribute('aria-busy', 'false');
  }
}
window.addEventListener('hashchange', () => {
  if (busy) return;
  if (!confirmDiscard()) {
    restoreHash();
    return;
  }
  void renderTab();
});
root.addEventListener('click', (event) => {
  if (!event.target.closest('a')) return;
  if (busy || !confirmDiscard()) event.preventDefault();
});
window.addEventListener('beforeunload', (event) => {
  if (!busy && !dirtyForms().length) return;
  event.preventDefault();
  event.returnValue = '';
});

function lettersView() {
  $('#view').innerHTML =
    `<div class="actions"><button id="new-letter">추가</button><button id="reload">새로고침</button></div>
    <div id="editor"></div><form id="letter-filter" class="toolbar">
      ${field('query', '검색', letterFilter.query)}${select('status', '상태', letterFilter.status, [['', '전체'], ...Object.entries(labels)])}
      ${select('sort', '작성일', letterFilter.sort, [
        ['desc', '최신순'],
        ['asc', '오래된 순'],
      ])}<button>검색</button></form>
    <p id="letter-count"></p><div id="letter-list"></div><div id="pagination" class="actions"></div>
    <details class="panel"><summary>백업·내보내기</summary><div class="actions">
      <button data-export="all:json">전체 JSON</button><button data-export="all:csv">글 CSV</button><button data-export="public:json">공개 JSON</button><button id="sync-public">기존 승인 글 반영</button></div></details>`;
  $('#new-letter').onclick = () => letterEditor();
  $('#reload').onclick = renderTab;
  $('#letter-filter').onsubmit = (event) => {
    event.preventDefault();
    letterFilter = data(event.currentTarget);
    letterPage = 1;
    renderLetters();
  };
  $('#sync-public').onclick = () =>
    void run(async () =>
      setStatus(`${await synchronizePublicLetters((await adminContext()).db)}건 반영`),
    );
  bindExports();
  renderLetters();
}
function bindExports() {
  document.querySelectorAll('[data-export]').forEach(
    (button) =>
      (button.onclick = () =>
        void run(async () => {
          const [scope, format] = button.dataset.export.split(':');
          const file = await exportFirebase(scope, format);
          downloadFile(file.filename, file.content, file.mime);
          setStatus('다운로드 완료');
        })),
  );
}
function paginate(total, size, page, change) {
  const count = Math.max(1, Math.ceil(total / size));
  $('#pagination').innerHTML =
    `<button id="previous"${page <= 1 ? ' disabled' : ''}>이전</button><span>${page} / ${count} · ${total}건</span><button id="next"${page >= count ? ' disabled' : ''}>다음</button>`;
  $('#previous').onclick = () => change(page - 1);
  $('#next').onclick = () => change(page + 1);
}
function renderLetters() {
  const records = letters
    .filter(
      (letter) =>
        (!letterFilter.status || letter.status === letterFilter.status) &&
        `${letter.nickname ?? ''} ${letter.content} ${letter.published_content ?? ''}`
          .toLowerCase()
          .includes(letterFilter.query.toLowerCase()),
    )
    .sort(
      (a, b) => (letterFilter.sort === 'asc' ? 1 : -1) * a.created_at.localeCompare(b.created_at),
    );
  letterPage = Math.min(letterPage, Math.max(1, Math.ceil(records.length / 20)));
  $('#letter-count').textContent = Object.entries(labels)
    .map(([key, label]) => `${label} ${letters.filter((item) => item.status === key).length}`)
    .join(' · ');
  $('#letter-list').innerHTML =
    records
      .slice((letterPage - 1) * 20, letterPage * 20)
      .map(
        (letter) => `<article class="panel">
    <div class="section-top"><strong>${html(letter.nickname || '익명')}</strong><span>${html(labels[letter.status])}</span></div>
    <p class="letter-content">${html(letter.content)}</p><small>${html(koreanDate(letter.created_at))} · 순서 ${letter.publish_order ?? '미지정'}</small>
    <div class="actions"><button data-edit="${letter.id}">수정·검수</button><button class="danger" data-delete="${letter.id}">삭제</button></div></article>`,
      )
      .join('') || '<p>글 없음</p>';
  document
    .querySelectorAll('[data-edit]')
    .forEach(
      (button) =>
        (button.onclick = () =>
          letterEditor(letters.find((item) => item.id === button.dataset.edit))),
    );
  document.querySelectorAll('[data-delete]').forEach(
    (button) =>
      (button.onclick = () => {
        if (!confirm('글을 삭제할까요? 공개 내용도 삭제되며 되돌릴 수 없습니다.')) return;
        void run(async () => {
          await deleteLetter((await adminContext()).db, button.dataset.delete);
          letters = letters.filter((item) => item.id !== button.dataset.delete);
          renderLetters();
          setStatus('삭제 완료');
        });
      }),
  );
  paginate(records.length, 20, letterPage, (value) => {
    letterPage = value;
    renderLetters();
  });
}
function letterEditor(letter) {
  if (!confirmDiscard($('#editor'))) return;
  const creationKey = crypto.randomUUID();
  $('#editor').innerHTML =
    `<form id="letter-editor" class="panel"><h2>${letter ? '글 수정' : '글 추가'}</h2>
    ${field('nickname', '별명', letter?.nickname ?? '', 'text', 'maxlength="30"')}${area('content', '본문', letter?.content ?? '')}
    ${area('published_content', '공개용 본문 (비워 두면 본문 사용)', letter?.published_content ?? '')}
    <div class="form-grid">${select('status', '상태', letter?.status ?? 'pending', Object.entries(labels))}${field('publish_order', '공개 순서', letter?.publish_order ?? '', 'number', 'min="0" max="1000000" step="1"')}</div>
    ${letter ? '' : checkbox('consent', '작성자의 공개 동의를 확인했습니다.')}
    <div class="actions"><button>저장</button><button type="button" id="close-editor">취소</button></div></form>`;
  $('#editor').scrollIntoView({ block: 'start' });
  $('#close-editor').onclick = closeEditor;
  submit($('#letter-editor'), async (values) => {
    if (!letter && !values.consent) throw new Error('공개 동의를 확인하세요.');
    const { db, uid } = await adminContext();
    const saved = await saveLetter(
      db,
      uid,
      letter?.id ?? null,
      {
        ...values,
        published_content: values.published_content || null,
        publish_order: values.publish_order === '' ? null : Number(values.publish_order),
      },
      creationKey,
    );
    letters = [saved, ...letters.filter((item) => item.id !== saved.id)];
    $('#editor').replaceChildren();
    renderLetters();
    setStatus('저장 완료');
  });
}

async function recordsView() {
  resultFilter.version ||=
    results[0]?.challengeId ||
    challenges.find((item) => item.enabled && !item.deleted)?.challengeId ||
    '';
  $('#view').innerHTML =
    `<div class="actions"><button id="new-result">추가</button><button id="reload">새로고침</button><button id="result-csv">CSV</button><button id="result-json">JSON</button></div>
    <div id="editor"></div><form id="result-filter" class="toolbar">${field('query', '학번·이름 검색', resultFilter.query)}
      ${select(
        'version',
        '문구',
        resultFilter.version,
        challenges.map((item) => [
          item.challengeId,
          `${item.title} (${item.practice ? '연습' : '공식'})`,
        ]),
      )}
      ${select('verification', '확인 상태', resultFilter.verification, [['all', '전체'], ...Object.entries(verification)])}
      ${select('view', '보기', resultFilter.view, [
        ['ranking', '학번별 최고 기록'],
        ['attempts', '전체 시도'],
      ])}<button>검색</button></form>
    <div class="table-scroll" id="result-list"></div><div class="actions" id="pagination"></div>
    <details class="panel"><summary>기기 백업</summary><p id="pending-count"></p><div class="actions"><button id="sync-pending">미전송 기록 접수</button><button id="local-json">기기 JSON</button></div></details>`;
  $('#new-result').onclick = () => resultEditor();
  $('#reload').onclick = renderTab;
  $('#result-filter').onsubmit = (event) => {
    event.preventDefault();
    resultFilter = data(event.currentTarget);
    resultPage = 1;
    renderResults();
  };
  $('#result-csv').onclick = () =>
    downloadFile(
      'typing.csv',
      resultsCsv(scopedResults(), { rankedOnly: resultFilter.view !== 'attempts' }),
      'text/csv;charset=utf-8',
    );
  $('#result-json').onclick = () =>
    downloadFile(
      'typing.json',
      JSON.stringify({ schemaVersion: 1, results }, null, 2),
      'application/json',
    );
  $('#sync-pending').onclick = () =>
    void run(async () => {
      const result = await synchronizePending();
      setStatus(
        `${result.synced}건 접수 · ${result.remaining}건 미전송${result.error ? ` · ${result.error}` : ''}`,
      );
      results = await readTyping((await adminContext()).db);
      renderResults();
      await pendingCount();
    });
  $('#local-json').onclick = () =>
    void run(async () => {
      downloadFile(
        'typing-local.json',
        JSON.stringify({ schemaVersion: 1, results: await listLocalResults() }, null, 2),
        'application/json',
      );
      setStatus('다운로드 완료');
    });
  renderResults();
  await pendingCount();
}
async function pendingCount() {
  const element = $('#pending-count');
  if (!element) return;
  try {
    element.textContent = `미전송 ${(await pendingResults()).length}건`;
  } catch {
    element.textContent = '기기 저장소 사용 불가';
  }
}
function scopedResults() {
  const aliases = new Map(students.map((student) => [student.student_id, student.login_id]));
  return results
    .filter(
      (item) =>
        item.challengeId === resultFilter.version &&
        (resultFilter.verification === 'all' ||
          item.verificationStatus === resultFilter.verification),
    )
    .map((item) => ({ ...item, loginId: aliases.get(item.participantId) ?? null }));
}
function filteredResults() {
  return resultFilter.view === 'attempts'
    ? rankedAttempts(scopedResults())
    : rankResults(scopedResults());
}
function renderResults() {
  const ranked = filteredResults();
  const records = ranked.filter((item) =>
    `${item.loginId ?? ''} ${item.participantId} ${item.displayName}`
      .toLowerCase()
      .includes(resultFilter.query.toLowerCase()),
  );
  resultPage = Math.min(resultPage, Math.max(1, Math.ceil(records.length / 50)));
  $('#result-list').innerHTML =
    `<table><caption>${records.length}건 · ${resultFilter.view === 'attempts' ? '전체 시도' : '학번별 최고 기록'} · 점수 → 오타 → 시간</caption><thead><tr><th>순위</th><th>참가자</th><th>점수</th><th>타수·오타</th><th>시간</th><th>확인</th><th>상품</th><th>편집</th></tr></thead><tbody>${records
      .slice((resultPage - 1) * 50, resultPage * 50)
      .map(
        (item) => `<tr>
    <td>${item.rank ?? '—'}${item.practice ? ' (연습)' : ''}</td><td>${html(item.displayName)}<small>${html(item.loginId || item.participantId)}</small></td><td>${item.score}</td><td>${item.speed} / ${item.errors}</td><td>${(item.elapsedMs / 1000).toFixed(2)}초</td>
    <td>${select(`review-${item.id}`, '확인', item.verificationStatus ?? 'pending', Object.entries(verification))}</td>
    <td><button data-prize="${item.id}"${item.practice || item.verificationStatus !== 'verified' ? ' disabled' : ''}>${item.prizeReceived ? '수령' : '미수령'}</button></td>
    <td><button data-edit="${item.id}">수정</button><button class="danger" data-delete="${item.id}">삭제</button></td></tr>`,
      )
      .join('')}</tbody></table>`;
  document.querySelectorAll('[name^="review-"]').forEach(
    (control) =>
      (control.onchange = () =>
        void run(async () => {
          const id = control.name.slice(7);
          const patch = {
            verificationStatus: control.value,
            ...(control.value !== 'verified' ? { prizeReceived: false } : {}),
          };
          try {
            await reviewTyping((await adminContext()).db, id, patch);
          } catch (reason) {
            control.value = results.find((item) => item.id === id)?.verificationStatus ?? 'pending';
            throw reason;
          }
          Object.assign(
            results.find((item) => item.id === id),
            patch,
          );
          renderResults();
          setStatus('저장 완료');
        })),
  );
  document.querySelectorAll('[data-prize]').forEach(
    (button) =>
      (button.onclick = () =>
        void run(async () => {
          const item = results.find((item) => item.id === button.dataset.prize);
          const patch = { prizeReceived: !item.prizeReceived };
          await reviewTyping((await adminContext()).db, item.id, patch);
          Object.assign(item, patch);
          renderResults();
          setStatus('저장 완료');
        })),
  );
  document
    .querySelectorAll('[data-edit]')
    .forEach(
      (button) =>
        (button.onclick = () =>
          resultEditor(results.find((item) => item.id === button.dataset.edit))),
    );
  document.querySelectorAll('[data-delete]').forEach(
    (button) =>
      (button.onclick = () => {
        if (!confirm('기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
        void run(async () => {
          await deleteTyping((await adminContext()).db, button.dataset.delete);
          results = results.filter((item) => item.id !== button.dataset.delete);
          renderResults();
          setStatus('삭제 완료');
        });
      }),
  );
  paginate(records.length, 50, resultPage, (page) => {
    resultPage = page;
    renderResults();
  });
}
function resultEditor(result) {
  if (!confirmDiscard($('#editor'))) return;
  const creationKey = crypto.randomUUID();
  $('#editor').innerHTML =
    `<form id="result-editor" class="panel"><h2>${result ? '기록 수정' : '기록 추가'}</h2>
    <div class="form-grid">${field('participantId', '입학 ID (기록 식별자)', result?.participantId, 'text', 'required maxlength="30"')}${field('displayName', '이름', result?.displayName, 'text', 'required maxlength="30"')}</div>
    ${select(
      'challengeId',
      '문구',
      result?.challengeId ?? resultFilter.version,
      challenges.map((item) => [item.challengeId, item.title]),
    )}
    <div class="form-grid">${field('seconds', '시간 (초)', result ? result.elapsedMs / 1000 : '', 'number', 'required min="0.001" max="3600" step="any"')}${field('errors', '오타', result?.errors ?? 0, 'number', 'required min="0" max="10000" step="1"')}</div>
    ${select('verificationStatus', '확인 상태', result?.verificationStatus ?? 'pending', Object.entries(verification))}<p id="score-preview"></p>
    <div class="actions"><button>저장</button><button id="close-editor" type="button">취소</button></div></form>`;
  $('#editor').scrollIntoView({ block: 'start' });
  $('#close-editor').onclick = closeEditor;
  const form = $('#result-editor');
  form.oninput = () => {
    const values = data(form);
    const challenge = challenges.find((item) => item.challengeId === values.challengeId);
    try {
      const score = calculateScore(
        challenge.referenceKeystrokes,
        Number(values.seconds) * 1000,
        Number(values.errors),
      );
      $('#score-preview').textContent = `${score.speed}타 · ${score.score}점`;
    } catch {
      $('#score-preview').textContent = '';
    }
  };
  submit(form, async (values) => {
    const { db, uid } = await adminContext();
    const challenge = challenges.find((item) => item.challengeId === values.challengeId);
    await saveTyping(
      db,
      uid,
      result?.id ?? null,
      {
        participantId: values.participantId,
        displayName: values.displayName,
        challengeId: values.challengeId,
        elapsedMs: Number(values.seconds) * 1000,
        errors: Number(values.errors),
        verificationStatus: values.verificationStatus,
        prizeReceived:
          !!result?.prizeReceived &&
          !challenge.practice &&
          values.verificationStatus === 'verified',
      },
      creationKey,
    );
    results = await readTyping(db);
    $('#editor').replaceChildren();
    renderResults();
    setStatus('저장 완료');
  });
}

function studentsView() {
  studentDetailSequence++;
  $('#view').innerHTML = `<form id="student-filter" class="toolbar">
    ${field('query', '학번·이름 검색', studentFilter.query)}
    ${select('grade', '학년', studentFilter.grade, [
      ['', '전체'],
      ['1', '1학년'],
      ['2', '2학년'],
      ['3', '3학년'],
      ['other', '그 외'],
    ])}
    <button>검색</button><button id="reload-students" type="button">새로고침</button></form><div class="table-scroll" id="student-list"></div>
    <div class="actions" id="pagination"></div><div id="student-detail"></div>`;
  $('#student-filter').onsubmit = (event) => {
    event.preventDefault();
    studentFilter = data(event.currentTarget);
    studentPage = 1;
    renderStudents();
  };
  $('#reload-students').onclick = renderTab;
  renderStudents();
}
function renderStudents() {
  const query = normalizeText(studentFilter.query).toLocaleLowerCase();
  const filtered = students.filter((student) => {
    const grade = studentGrade(student, sessionPolicy.academicYear);
    return (
      `${student.login_id ?? ''} ${student.student_id} ${student.student_name}`
        .toLocaleLowerCase()
        .includes(query) &&
      (!studentFilter.grade ||
        (studentFilter.grade === 'other' ? grade === null : grade === Number(studentFilter.grade)))
    );
  });
  studentPage = Math.min(studentPage, Math.max(1, Math.ceil(filtered.length / 50)));
  $('#student-list').innerHTML =
    `<table><caption>${filtered.length}명 · ${sessionPolicy.academicYear}학년도</caption>
    <thead><tr><th>학번</th><th>이름</th><th>학년</th><th>계정</th><th>글 작성</th><th>관리</th></tr></thead><tbody>${filtered
      .slice((studentPage - 1) * 50, studentPage * 50)
      .map(
        (student) => `<tr>
      <td>${html(student.login_id || '미연결')}<small>${html(student.student_id)}</small></td><td>${html(student.student_name)}</td>
      <td>${studentGrade(student, sessionPolicy.academicYear) ?? '—'}</td>
      <td>${student.is_active ? '활성' : '비활성'}</td><td>${writeRestricted(student) ? '제한' : '허용'}</td>
      <td><button data-student="${html(student.student_id)}">상세</button></td></tr>`,
      )
      .join('')}</tbody></table>`;
  document.querySelectorAll('[data-student]').forEach((button) => {
    button.onclick = () => {
      if (!confirmDiscard($('#student-detail'))) return;
      void studentDetail(button.dataset.student).catch(alertError);
    };
  });
  paginate(filtered.length, 50, studentPage, (page) => {
    studentPage = page;
    renderStudents();
  });
}
const moderationLabels = {
  block_write: '글 작성 제한',
  unblock_write: '글 작성 제한 해제',
  deactivate: '계정 비활성화',
  activate: '계정 재활성화',
  reset_password: '비밀번호 재발급',
};
async function studentDetail(studentId) {
  const detailSequence = ++studentDetailSequence;
  const sequence = viewSequence;
  const student = students.find((item) => item.student_id === studentId);
  if (!student) throw new Error('학생 정보를 찾지 못했습니다. 새로 불러오세요.');
  const container = $('#student-detail');
  container.innerHTML = `<section class="panel"><h2>${html(student.student_id)} ${html(student.student_name)}</h2>
    <p>${student.is_active ? '활성' : '비활성'} · 글 작성 ${writeRestricted(student) ? '제한' : '허용'}${student.blocked_until ? ` · 제한 종료 ${html(koreanDate(student.blocked_until.toDate().toISOString()))}` : ''}</p>
    <div id="student-actions">불러오는 중</div><div id="student-history"></div></section>`;
  container.scrollIntoView({ block: 'start' });
  const { db } = await adminContext();
  const history = await readStudentHistory(db, studentId);
  const passwordReady = await canResetStudentPassword();
  if (
    sequence !== viewSequence ||
    detailSequence !== studentDetailSequence ||
    !session.authenticated
  )
    return;
  $('#student-actions').innerHTML = `<form id="student-moderation">
    ${select('action', '조치', student.write_blocked ? 'unblock_write' : 'block_write', [
      ['block_write', '글 작성 제한'],
      ['unblock_write', '글 작성 제한 해제'],
      [
        student.is_active ? 'deactivate' : 'activate',
        student.is_active ? '계정 비활성화' : '계정 재활성화',
      ],
    ])}
    ${field('blocked_until', '제한 종료 (비워두면 직접 해제)', '', 'datetime-local')}
    ${select('related_letter_id', '관련 글', '', [['', '없음'], ...history.letters.map((letter) => [letter.id, `${koreanDate(letter.created_at?.toDate().toISOString() ?? '')} · ${letter.id}`])])}
    ${area('reason', '조치 사유', '', 3)}<button>적용</button></form>
    <form id="student-password"><h3>비밀번호 재발급</h3>${area('reason', '재발급 사유', '', 2)}<button${passwordReady ? '' : ' disabled'}>임시 비밀번호 발급</button>${passwordReady ? '' : '<p class="muted">비밀번호 재발급은 현재 보류 중입니다.</p>'}
    <p id="temporary-password" role="status" hidden></p><button id="clear-temporary-password" type="button" hidden>임시 비밀번호 숨기기</button></form>`;
  for (const form of [$('#student-moderation'), $('#student-password')]) {
    form.elements.reason.required = true;
    form.elements.reason.maxLength = 500;
  }
  const until = $('#student-moderation').elements.blocked_until;
  until.disabled = student.write_blocked;
  $('#student-moderation').elements.action.addEventListener('change', (event) => {
    until.disabled = event.currentTarget.value !== 'block_write';
  });
  submit($('#student-moderation'), async (values) => {
    const saved = await moderateStudent(studentId, values);
    students = students.map((item) =>
      item.student_id === studentId ? { ...saved, id: studentId } : item,
    );
    renderStudents();
    await studentDetail(studentId);
    setStatus('학생 상태 저장 완료');
  });
  submit($('#student-password'), async (values) => {
    const result = await resetStudentPassword(studentId, values.reason);
    const output = $('#temporary-password');
    if (sequence !== viewSequence || detailSequence !== studentDetailSequence || !output) return;
    output.textContent = `임시 비밀번호: ${result.password}`;
    output.hidden = false;
    $('#clear-temporary-password').hidden = false;
    $('#student-password').reset();
    setStatus('임시 비밀번호 재발급 완료');
  });
  $('#clear-temporary-password').onclick = () => {
    $('#temporary-password').textContent = '';
    $('#temporary-password').hidden = true;
    $('#clear-temporary-password').hidden = true;
  };
  $('#student-history').innerHTML = `<h3>작성 내역</h3>${
    history.letters.length
      ? history.letters
          .map(
            (letter) => `<article class="record">
    <strong>${html(labels[letter.status] ?? letter.status)}</strong> · ${html(koreanDate(letter.created_at?.toDate().toISOString() ?? ''))}
    <p class="letter-content">${html(letter.content)}</p><small>접수번호 ${html(letter.id)} · 별명 ${html(letter.nickname || '익명')}</small></article>`,
          )
          .join('')
      : '<p>작성 내역 없음</p>'
  }
    <h3>관리 기록</h3>${
      history.logs.length
        ? history.logs
            .map(
              (
                log,
              ) => `<article class="record"><strong>${html(moderationLabels[log.action] ?? log.action)}</strong> · ${html(koreanDate(log.created_at?.toDate().toISOString() ?? ''))}
    <p>${html(log.reason)}</p><small>관리자 ${html(log.operator_uid)}${log.related_letter_id ? ` · 관련 글 ${html(log.related_letter_id)}` : ''}</small></article>`,
            )
            .join('')
        : '<p>관리 기록 없음</p>'
    }`;
}

function settingsView() {
  $('#view').innerHTML = `<form class="panel" id="event-settings"><h2>운영 설정</h2>
    ${select('phase', '단계', config?.phase ?? 'B', [
      ['A', 'A · 접수'],
      ['B', 'B · 마감'],
      ['C', 'C · 공개'],
    ])}
    ${checkbox('typingEnabled', '타자 접수', config?.typingEnabled)}${checkbox('submissionsEnabled', '글 접수', config?.submissionsEnabled)}${checkbox('welcomeEnabled', '승인 글 공개', config?.welcomeEnabled)}
    ${select(
      'activeChallengeId',
      '사용 문구',
      config?.activeChallengeId ?? '',
      challenges
        .filter((item) => item.enabled && !item.deleted)
        .map((item) => [item.challengeId, item.title]),
    )}
    <p class="muted">접수는 A 단계에서만 가능합니다.</p><button>저장</button></form>
    <form class="panel" id="session-policy"><h2>학생 로그인 설정</h2>
    ${checkbox('boothMode', '공용 기기 모드', sessionPolicy.boothMode)}
    ${field('idleMinutes', '미사용 로그아웃 (분)', sessionPolicy.idleMinutes, 'number', 'required min="1" max="120" step="1"')}
    ${field('academicYear', '기준 학년도', sessionPolicy.academicYear, 'number', 'required min="2020" max="2100" step="1"')}
    <button>저장</button></form>
    ${feature === 'typing' ? '<section class="panel"><h2>문구</h2><button id="new-challenge">추가</button><div id="challenges"></div></section><div id="editor"></div>' : ''}`;
  submit($('#event-settings'), async (values) => {
    await setEvent((await adminContext()).db, values.phase, {
      typingEnabled: !!values.typingEnabled,
      submissionsEnabled: !!values.submissionsEnabled,
      welcomeEnabled: !!values.welcomeEnabled,
      activeChallengeId: values.activeChallengeId,
    });
    setStatus('저장 완료');
    config = await readEvent((await adminContext()).db);
    if (feature === 'typing') renderChallenges();
  });
  submit($('#session-policy'), async (values) => {
    const { db } = await adminContext();
    await saveSessionPolicy(db, { ...values, boothMode: !!values.boothMode });
    sessionPolicy = await readSessionPolicy(db);
    setStatus('로그인 설정 저장 완료');
  });
  if (feature !== 'typing') return;
  $('#new-challenge').onclick = () => challengeEditor();
  renderChallenges();
}
function renderChallenges() {
  $('#challenges').innerHTML = challenges
    .map(
      (
        item,
      ) => `<article class="record"><strong>${html(item.title)}</strong> · ${item.practice ? '연습' : '공식'} · ${item.referenceKeystrokes}타${item.deleted ? ' · 삭제 보관' : ''}
    <p class="letter-content">${html(item.text)}</p><small>${html(item.challengeId)}</small><div class="actions">
    ${item.deleted ? `<button data-restore="${item.challengeId}">복원</button>` : `<button data-edit="${item.challengeId}">수정</button><button data-toggle="${item.challengeId}"${item.challengeId === config?.activeChallengeId ? ' disabled' : ''}>${item.enabled ? '접수 끄기' : '접수 켜기'}</button><button class="danger" data-delete="${item.challengeId}"${item.challengeId === config?.activeChallengeId ? ' disabled' : ''}>삭제</button>`}</div></article>`,
    )
    .join('');
  $('#challenges').onclick = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = Object.values(button.dataset)[0];
    const item = challenges.find((item) => item.challengeId === id);
    if (button.dataset.edit) {
      challengeEditor(item);
      return;
    }
    if (!confirmDiscard()) return;
    if (button.dataset.delete && !confirm('문구를 삭제 목록에 보관할까요? 기존 기록은 유지됩니다.'))
      return;
    void run(async () => {
      await changeChallenge(
        (await adminContext()).db,
        id,
        button.dataset.restore
          ? { deleted: false, enabled: false }
          : button.dataset.delete
            ? { deleted: true, enabled: false }
            : { enabled: !item.enabled },
      );
      challenges = await readChallenges((await adminContext()).db);
      settingsView();
      setStatus('저장 완료');
    });
  };
}
function challengeEditor(challenge) {
  if (!confirmDiscard($('#editor'))) return;
  let creationKey = crypto.randomUUID();
  let previousIntent;
  $('#editor').innerHTML =
    `<form id="challenge-editor" class="panel"><h2>문구 ${challenge ? '수정' : '추가'}</h2>
    ${field('title', '제목', challenge?.title, 'text', 'required maxlength="80"')}${area('text', '문구', challenge?.text)}${checkbox('practice', '연습', challenge?.practice ?? true)}
    <p class="muted">본문·연습 여부 변경은 새 버전으로 저장됩니다. 사용 문구는 운영 설정에서 선택하세요.</p><p id="keys"></p><div class="actions"><button>저장</button><button type="button" id="close-editor">취소</button></div></form>`;
  $('#editor').scrollIntoView({ block: 'start' });
  $('#close-editor').onclick = closeEditor;
  $('#challenge-editor').oninput = (event) => {
    $('#keys').textContent =
      `${countKeystrokes(event.currentTarget.elements.text.value.trim().replace(/\s+/g, ' '))}타`;
  };
  submit($('#challenge-editor'), async (values) => {
    if (!confirmDiscard($('#event-settings'))) {
      setStatus();
      return false;
    }
    const intent = JSON.stringify([
      normalizeText(values.text).replace(/\s+/g, ' '),
      !!values.practice,
    ]);
    if (previousIntent && intent !== previousIntent) creationKey = crypto.randomUUID();
    previousIntent = intent;
    const id = await saveChallenge(
      (await adminContext()).db,
      { title: values.title, text: values.text, practice: !!values.practice },
      challenge,
      creationKey,
    );
    challenges = await readChallenges((await adminContext()).db);
    settingsView();
    setStatus(
      challenge && id !== challenge.challengeId
        ? '새 버전 저장 완료 · 사용 문구를 선택하세요.'
        : '저장 완료',
    );
  });
}

async function accountView(db, sequence = viewSequence) {
  const roles = await withDeadline(getDocs(collection(db, 'admins')));
  if (sequence !== viewSequence || !session.authenticated) return;
  $('#view').innerHTML =
    `<section class="panel"><h2>계정</h2><p>이메일: ${html(session.email)}</p><p>UID: <code>${html(session.uid)}</code></p>
    <form id="password"><h3>비밀번호 변경</h3>${field('current', '현재 비밀번호', '', 'password', 'required autocomplete="current-password"')}${field('next', '새 비밀번호', '', 'password', 'required minlength="12" autocomplete="new-password"')}${field('confirmation', '새 비밀번호 확인', '', 'password', 'required minlength="12" autocomplete="new-password"')}<button>변경</button></form>
    <form id="email"><h3>이메일 변경</h3>${field('email', '새 이메일', '', 'email', 'required')}${field('current', '현재 비밀번호', '', 'password', 'required autocomplete="current-password"')}<button>확인 메일 전송</button></form></section>
    <section class="panel"><h2>관리자 권한</h2><ul class="review-list" id="operators">${operatorItems(roles)}</ul>
    <form id="operator"><h3>관리자 추가</h3>${field('email', '이메일', '', 'email', 'required maxlength="254"')}${field('password', '초기 비밀번호', '', 'password', 'minlength="12" autocomplete="new-password"')}
    <details><summary>기존 계정에 권한 추가</summary>${field('uid', '기존 UID', '', 'text', 'maxlength="128"')}</details><button>추가</button></form></section>`;
  submit($('#password'), async (values) => {
    if (values.next !== values.confirmation) throw new Error('비밀번호 확인이 일치하지 않습니다.');
    await changeAdminPassword(values.current, values.next);
    $('#password').reset();
    setStatus('비밀번호 변경 완료');
  });
  submit($('#email'), async (values) => {
    await changeAdminEmail(values.current, values.email);
    $('#email').reset();
    setStatus('새 이메일에서 확인 후 다시 로그인하세요.');
  });
  submit($('#operator'), async (values) => {
    if (values.uid.trim())
      await withDeadline(
        setDoc(doc((await adminContext()).db, 'admins', values.uid.trim()), {
          enabled: true,
          email: values.email.trim(),
          created_at: serverTimestamp(),
        }),
      );
    else await createOperator(values.email, values.password);
    $('#operator').reset();
    await refreshOperators((await adminContext()).db, sequence);
    setStatus('추가 완료');
  });
  bindOperatorActions(sequence);
}
function operatorItems(roles) {
  return roles.docs
    .filter((item) => item.data().enabled)
    .map(
      (item) =>
        `<li>${html(item.id === session.uid ? session.email : item.data().email || item.id)} ${item.id === session.uid ? '(현재 계정)' : `<button class="danger" data-revoke="${html(item.id)}">권한 해제</button>`}</li>`,
    )
    .join('');
}
async function refreshOperators(db, sequence) {
  const roles = await withDeadline(getDocs(collection(db, 'admins')));
  if (sequence !== viewSequence || !$('#operators')) return;
  $('#operators').innerHTML = operatorItems(roles);
  bindOperatorActions(sequence);
}
function bindOperatorActions(sequence) {
  document.querySelectorAll('[data-revoke]').forEach(
    (button) =>
      (button.onclick = () => {
        if (!confirm('관리자 권한을 해제할까요?')) return;
        void run(async () => {
          await withDeadline(
            deleteDoc(doc((await adminContext()).db, 'admins', button.dataset.revoke)),
          );
          await refreshOperators((await adminContext()).db, sequence);
          setStatus('권한 해제 완료');
        });
      }),
  );
}

try {
  await watchAdminSession(applySession, sessionFailed);
} catch (reason) {
  sessionFailed(reason);
}
