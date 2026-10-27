import type { LetterSubmission } from './types';

export const CONTENT_LIMITS = { min: 10, max: 700 } as const;
export const NICKNAME_MAX = 30;
export const unicodeLength = (value: string) => Array.from(value).length;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').normalize('NFC').trim();
}

export function validateSubmission(input: unknown): { value?: LetterSubmission; error?: string } {
  if (!input || typeof input !== 'object') return { error: '입력 형식을 확인해 주세요.' };
  const data = input as Record<string, unknown>;
  if (typeof data.content !== 'string' || (data.nickname !== undefined && typeof data.nickname !== 'string')) {
    return { error: '본문과 별명은 문자열로 입력해 주세요.' };
  }
  const content = normalizeText(data.content);
  const nickname = normalizeText((data.nickname as string | undefined) ?? '');
  const length = unicodeLength(content);
  if (length < CONTENT_LIMITS.min || length > CONTENT_LIMITS.max) {
    return { error: `본문을 ${CONTENT_LIMITS.min}~${CONTENT_LIMITS.max}자로 작성해 주세요.` };
  }
  if (unicodeLength(nickname) > NICKNAME_MAX || nickname.includes('\n')) return { error: '별명은 줄바꿈 없이 30자 이내로 입력해 주세요.' };
  if (data.consentToPublish !== true) return { error: '글 공개에 동의해 주세요.' };
  if (typeof data.submissionKey !== 'string' || !UUID_PATTERN.test(data.submissionKey)) return { error: '접수 요청 정보가 올바르지 않습니다. 새 글 작성을 눌러 주세요.' };
  return { value: { content, nickname, consentToPublish: true, submissionKey: data.submissionKey } };
}
