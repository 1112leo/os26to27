import QRCode from 'qrcode';
import { mkdir, writeFile } from 'node:fs/promises';

try {
  const url = new URL(process.argv[2]);
  if (url.protocol !== 'https:' || !/^\/(?:[a-zA-Z0-9_-]+\/)?welcome\/?$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error();
  await mkdir('artifacts', { recursive: true });
  await QRCode.toFile('artifacts/welcome-qr.png', url.href, { width: 1600, margin: 4, errorCorrectionLevel: 'M' });
  await writeFile('artifacts/welcome-qr.svg', await QRCode.toString(url.href, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' }));
  console.log('인쇄용 QR 생성: artifacts/welcome-qr.png / artifacts/welcome-qr.svg');
} catch { console.error('사용법: npm run qr -- https://확정된도메인/welcome'); process.exitCode = 1; }
