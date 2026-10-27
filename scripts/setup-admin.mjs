import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { emitKeypressEvents } from 'node:readline';
import { resolve } from 'node:path';

const local = process.argv.includes('--local');
const generated = process.argv.includes('--generate-local') || process.argv.includes('--generate');
if (process.argv.includes('--generate-local') && !local) throw new Error('--generate-local은 --local과 함께 사용하세요.');

async function readPassword() {
  if (!process.stdin.isTTY) {
    let value = '';
    for await (const chunk of process.stdin) value += chunk;
    return value.replace(/\r?\n$/, '');
  }
  process.stdout.write('관리자 비밀번호 (12자 이상, 입력 숨김): ');
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  return new Promise((accept, reject) => {
    let value = '';
    const handler = (text, key) => {
      if (key?.ctrl && key.name === 'c') { cleanup(); reject(new Error('취소했습니다.')); }
      else if (key?.name === 'return') { cleanup(); accept(value); }
      else if (key?.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
      else if (text && !key?.ctrl) value += text;
    };
    function cleanup() { process.stdin.off('keypress', handler); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); }
    process.stdin.on('keypress', handler);
  });
}

try {
  if (local) {
    try { await readFile('.dev.vars'); throw new Error('.dev.vars가 이미 있습니다. 기존 설정을 확인하고 별도 보관한 뒤 다시 실행하세요.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const password = generated ? randomBytes(24).toString('base64url') : await readPassword();
  if (password.length < 12 || password.length > 256) throw new Error('비밀번호는 12~256자로 설정하세요.');
  const salt = randomBytes(16).toString('base64url');
  const digest = pbkdf2Sync(password, Buffer.from(salt, 'base64url'), 100000, 32, 'sha256').toString('base64url');
  const secrets = { ADMIN_PASSWORD_HASH: `pbkdf2$100000$${salt}$${digest}`, SESSION_SECRET: randomBytes(48).toString('base64url') };
  if (local) {
    await writeFile('.dev.vars', Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
    if (generated) { await mkdir('artifacts', { recursive: true }); await writeFile('artifacts/local-admin-password.txt', password, { mode: 0o600 }); }
    console.log('로컬 인증 설정을 .dev.vars에 저장했습니다. Git에는 포함되지 않습니다.');
    if (generated) console.log(`로컬 테스트용 비밀번호 파일: ${resolve('artifacts/local-admin-password.txt')}`);
  } else {
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/admin-secrets.json', JSON.stringify(secrets), { flag: 'wx', mode: 0o600 });
    if (generated) await writeFile('artifacts/deployment-admin-password.txt', password, { flag: 'wx', mode: 0o600 });
    console.log('artifacts/admin-secrets.json을 생성했습니다. wrangler pages secret bulk로 등록한 뒤 안전하게 제거하세요.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
