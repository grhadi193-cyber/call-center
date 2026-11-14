import { describe, expect, it } from 'vitest';
import { isAllowedCaller, safeEqual } from '../src/security.js';

describe('caller authorization', () => {
  const callers = new Set(['+989121234567']);

  it('accepts only configured E.164 callers', () => {
    expect(isAllowedCaller('+989121234567', callers)).toBe(true);
    expect(isAllowedCaller('+989121234568', callers)).toBe(false);
    expect(isAllowedCaller(undefined, callers)).toBe(false);
  });

  it('compares signature values safely', () => {
    expect(safeEqual('same', 'same')).toBe(true);
    expect(safeEqual('same', 'different')).toBe(false);
  });
});
