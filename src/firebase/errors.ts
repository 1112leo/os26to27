export class ClientError extends Error {
  constructor(message: string, public status = 0, public code = 'UNKNOWN') { super(message); }
}

export function firebaseError(error: unknown): ClientError {
  if (error instanceof ClientError) return error;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return new ClientError('이메일 또는 비밀번호를 확인해 주세요.', 401, code);
  if (code.includes('too-many-requests')) return new ClientError('로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429, code);
  if (code.includes('permission-denied')) return new ClientError('저장 권한, 행사 운영 상태 또는 요청 제한을 확인해 주세요. 입력 내용은 유지됩니다.', 403, code);
  if (code.includes('operation-not-allowed')) return new ClientError('Firebase에서 익명 인증과 이메일/비밀번호 인증을 활성화해 주세요.', 503, code);
  if (code.includes('unavailable') || code.includes('network') || code.includes('deadline')) return new ClientError('Firebase에 연결하지 못했습니다. 입력 내용은 유지되며 같은 요청으로 재시도할 수 있습니다.', 503, code);
  return new ClientError(error instanceof Error ? error.message : '처리에 실패했습니다. 다시 시도해 주세요.', 500, code || 'UNKNOWN');
}

export async function withDeadline<T>(promise: Promise<T>, milliseconds = 20000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new ClientError('응답 확인 시간이 초과되었습니다. 내용은 유지됩니다. 같은 요청으로 재시도해 주세요.', 503, 'DEADLINE')), milliseconds);
    })]);
  } catch (error) { throw firebaseError(error); }
  finally { clearTimeout(timeout); }
}
