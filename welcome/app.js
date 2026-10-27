import { errorMessage, getClients } from '../firebase.js';
import { readEvent, readPublicLetters } from '../database.js';

const status = document.querySelector('#status');
const error = document.querySelector('#error');
const retry = document.querySelector('#retry');
const letters = document.querySelector('#letters');
const pagination = document.querySelector('#pagination');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const pageLabel = document.querySelector('#page');

let page = 0;
let cursors = [undefined];
let nextCursor;
let hasNext = false;
let busy = false;

function renderLetter(letter) {
  const article = document.createElement('article');
  article.className = 'panel';
  const text = document.createElement('p');
  text.className = 'letter-content';
  text.style.whiteSpace = 'pre-wrap';
  text.textContent = letter.content;
  const author = document.createElement('p');
  author.className = 'muted';
  author.textContent = letter.nickname || '익명';
  article.append(text, author);
  return article;
}

async function load(targetPage = page) {
  if (busy) return;
  busy = true;
  error.hidden = true;
  retry.hidden = true;
  previous.disabled = true;
  next.disabled = true;
  pagination.hidden = true;
  letters.replaceChildren();
  status.textContent = '불러오는 중';
  try {
    const { deviceDb } = await getClients();
    const config = await readEvent(deviceDb);
    if (!config.welcomeEnabled) {
      status.textContent = '공개 전';
      return;
    }
    const result = await readPublicLetters(deviceDb, cursors[targetPage]);
    page = targetPage;
    nextCursor = result.cursor;
    hasNext = result.hasNext;
    letters.replaceChildren(...result.letters.map(renderLetter));
    status.textContent = result.letters.length ? '' : '등록된 글 없음';
    pageLabel.textContent = `${page + 1} 페이지`;
    pagination.hidden = page === 0 && !hasNext;
  } catch (reason) {
    status.textContent = '';
    error.textContent = errorMessage(reason);
    error.hidden = false;
    retry.hidden = false;
  } finally {
    busy = false;
    previous.disabled = page === 0;
    next.disabled = !hasNext;
  }
}

previous.addEventListener('click', () => {
  if (busy || page === 0) return;
  void load(page - 1).then(() => window.scrollTo(0, 0));
});
next.addEventListener('click', () => {
  if (busy || !hasNext) return;
  cursors = [...cursors.slice(0, page + 1), nextCursor];
  void load(page + 1).then(() => window.scrollTo(0, 0));
});
retry.addEventListener('click', () => void load());
void load();
