// Used only if CLI OAuth is unavailable and a short-lived Pages upload JWT is supplied on stdin.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write('Ready for short-lived Pages upload JWT on stdin (not echoed).\n');
let input = '';
for await (const chunk of process.stdin) {
  input += chunk.toString();
  if (input.includes('\n')) break;
}
const jwt = input.trim();
if (process.stdin.isTTY) process.stdin.setRawMode(false);
if (!jwt || jwt.length > 10000) throw new Error('Upload JWT missing.');
const child = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'pages', 'project', 'upload', 'dist', '--output-manifest-path', 'artifacts/deployment-manifest.json'], {
  env: { ...process.env, CF_PAGES_UPLOAD_JWT: jwt, CLOUDFLARE_API_TOKEN: jwt }, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
});
child.on('exit', code => { process.exitCode = code ?? 1; });
