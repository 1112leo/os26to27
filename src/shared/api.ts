export class ClientError extends Error {
  constructor(message: string, public status = 0, public code = 'NETWORK_ERROR') { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options, credentials: 'same-origin',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      signal: options.signal ?? AbortSignal.timeout(20000),
    });
  } catch { throw new ClientError('서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
    throw new ClientError(body?.error?.message ?? '요청을 처리하지 못했습니다.', response.status, body?.error?.code);
  }
  return await response.json() as T;
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '처리에 실패했습니다. 다시 시도해 주세요.';
