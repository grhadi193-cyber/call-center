import { describe, expect, it } from 'vitest';
import { decodeUlaw, encodeUlaw, resamplePcm16 } from '../src/audio/ulaw.js';

describe('telephony audio conversion', () => {
  it('round-trips G.711 μ-law into a bounded lossy PCM signal', () => {
    const original = new Int16Array([-12000, -1000, 0, 1000, 12000]);
    const decoded = decodeUlaw(encodeUlaw(original));
    for (let index = 0; index < original.length; index++) expect(Math.abs(decoded[index]! - original[index]!)).toBeLessThan(800);
  });

  it('converts between the fixed sample rates used by the providers', () => {
    const input = new Int16Array([1, 2, 3]);
    expect(Array.from(resamplePcm16(input, 8_000, 16_000))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(Array.from(resamplePcm16(new Int16Array([1, 1, 2, 2]), 16_000, 8_000))).toEqual([1, 2]);
  });
});
