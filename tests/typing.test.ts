import { describe, expect, it } from 'vitest';
import { calculateScore, countKeystrokes, rankResults } from '../src/typing/scoring';
import { CHALLENGE } from '../src/typing/challenge';
import { commitInput, compositionEnd, compositionStart, initialInputState, isComplete } from '../src/typing/engine';
import type { TypingResult } from '../src/shared/types';

describe('타수와 점수', () => {
  it.each([[0, 500], [1, 480], [3, 440], [30, 0]])('500타에서 오타 %i회 = %i점', (errors, score) => {
    expect(calculateScore(500, 60000, errors)).toEqual({ speed: 500, score });
  });
  it('반올림하며 잘못된 측정값을 거부한다', () => {
    expect(calculateScore(1, 40000, 0).speed).toBe(2);
    expect(() => calculateScore(100, 0, 0)).toThrow();
    expect(() => calculateScore(100, NaN, 0)).toThrow();
    expect(() => calculateScore(100, 1000, -1)).toThrow();
  });
  it('겹받침·복합모음·Shift·공백·문장부호의 고정 기준을 검증한다', () => {
    expect(countKeystrokes('가')).toBe(2);
    expect(countKeystrokes('값')).toBe(4);
    expect(countKeystrokes('괜')).toBe(4);
    expect(countKeystrokes('꽉')).toBe(4);
    expect(countKeystrokes('A !')).toBe(3);
    expect(countKeystrokes(CHALLENGE.text)).toBe(CHALLENGE.referenceKeystrokes);
  });
  it('점수→오타→시간으로 정렬하고 완전 동점에는 공동 순위를 부여한다', () => {
    const record = (id: string, score: number, errors: number, elapsedMs: number): TypingResult => ({ id, score, errors, elapsedMs, participantId: id, displayName: id, challengeId: 'v1', speed: score + errors * 20, completedAt: '2026-10-27T00:00:00Z', prizeReceived: false, practice: false });
    const ranked = rankResults([record('a', 500, 2, 10000), record('b', 500, 1, 11000), record('c', 500, 1, 10000), record('d', 500, 1, 10000), record('e', 450, 0, 8000)]);
    expect(ranked.map(r => [r.id, r.rank])).toEqual([['c', 1], ['d', 1], ['b', 3], ['a', 4], ['e', 5]]);
  });
});

describe('한글 입력 판정', () => {
  it('한글 조합 중 변화는 세지 않고 확정된 오타만 1회 센다', () => {
    let state = compositionStart(initialInputState());
    for (const intermediate of ['ㄷ', '도', '동']) state = commitInput(state, intermediate, '동해');
    expect(state.errors).toBe(0);
    state = compositionEnd(state, '동', '동해');
    state = compositionStart(state);
    for (const intermediate of ['동ㅎ', '동허', '동헉']) state = commitInput(state, intermediate, '동해');
    state = compositionEnd(state, '동헉', '동해');
    expect(state.errors).toBe(1);
    state = commitInput(state, '동헉', '동해');
    expect(state.errors).toBe(1);
  });
  it('수정해도 감점을 유지하며 Backspace는 추가 감점하지 않는다', () => {
    let state = commitInput(initialInputState(), '오타', '오성');
    expect(state.errors).toBe(1);
    state = commitInput(state, '오', '오성');
    expect(state.errors).toBe(1);
    state = compositionEnd(compositionStart(state), '오성', '오성');
    expect(state.errors).toBe(1);
    expect(isComplete(state, '오성')).toBe(true);
  });
  it('정확한 완성 전에는 종료하지 않으며 조합 중에도 종료하지 않는다', () => {
    expect(isComplete(commitInput(initialInputState(), '동', '동해'), '동해')).toBe(false);
    expect(isComplete(commitInput(initialInputState(), '동허', '동해'), '동해')).toBe(false);
    const exact = commitInput(initialInputState(), '동해', '동해');
    expect(isComplete(exact, '동해')).toBe(true);
    expect(isComplete(compositionStart(exact), '동해')).toBe(false);
  });
  it('선택 영역 삭제와 중간 글자 수정 시 동일한 오타를 다시 세지 않는다', () => {
    let state = commitInput(initialInputState(), 'aXcd', 'abcd');
    expect(state.errors).toBe(1);
    state = commitInput(state, 'acd', 'abcd');
    expect(state.errors).toBe(1);
    state = commitInput(state, 'abcd', 'abcd');
    expect(state.errors).toBe(1);
  });
});
