import { readFile, writeFile, mkdir } from 'node:fs/promises';
if (process.env.PAGES_BASE_PATH && process.env.VITE_FIREBASE_EMULATORS === 'true') throw new Error('GitHub Pages builds must set VITE_FIREBASE_EMULATORS=false.');
const html = await readFile('dist/index.html', 'utf8');
for (const route of ['typing', 'typing/results', 'write', 'write/complete', 'welcome', 'admin']) {
  await mkdir(`dist/${route}`, { recursive: true });
  await writeFile(`dist/${route}/index.html`, html);
}
await writeFile('dist/404.html', html);
await writeFile('dist/.nojekyll', '');
if (process.env.FIREBASE_CONFIG) {
  const config = JSON.parse(process.env.FIREBASE_CONFIG);
  if (!config.apiKey || !config.projectId || !config.appId) throw new Error('FIREBASE_CONFIG must contain apiKey, projectId and appId.');
  const allowed = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
  if (Object.keys(config).some(key => !allowed.includes(key))) throw new Error('Only Firebase public web app config is allowed. Never use a service account.');
  await writeFile('dist/firebase-config.json', JSON.stringify(config, null, 2));
}
console.log('GitHub Pages: 6 direct route entries generated.');
