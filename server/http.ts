export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function json(data: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return Response.json(data, { status, headers });
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiError(400, 'INVALID_JSON', 'JSON 형식으로 전송해 주세요.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'EMPTY_BODY', '입력 내용을 확인해 주세요.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); throw new ApiError(400, 'BODY_TOO_LARGE', '입력 내용이 너무 큽니다.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { throw new ApiError(400, 'INVALID_JSON', '입력 형식을 확인해 주세요.'); }
}

export function checkOrigin(request: Request): void {
  const expected = new URL(request.url).origin;
  if (request.headers.get('Origin') !== expected || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    throw new ApiError(403, 'ORIGIN_DENIED', '이 사이트에서 다시 요청해 주세요.');
  }
}
