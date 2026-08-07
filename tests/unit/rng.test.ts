import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/rng';

describe('createRng', () => {
  it('同じシードなら同じ列を返す', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seq = (): number[] => Array.from({ length: 10 }, () => a.next());
    const seqB = (): number[] => Array.from({ length: 10 }, () => b.next());

    expect(seq()).toEqual(seqB());
  });

  it('シードが違えば列も違う', () => {
    const a = createRng(1);
    const b = createRng(2);

    expect(a.next()).not.toBe(b.next());
  });

  it('next は 0 以上 1 未満', () => {
    const rng = createRng(7);

    for (let i = 0; i < 1000; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int は 0 以上 maxExclusive 未満', () => {
    const rng = createRng(7);

    for (let i = 0; i < 1000; i += 1) {
      const v = rng.int(3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
    }
  });

  it('pick は配列の要素を返す', () => {
    const rng = createRng(7);
    const items = ['グー', 'チョキ', 'パー'] as const;

    for (let i = 0; i < 100; i += 1) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it('pick は空配列で例外を投げる', () => {
    const rng = createRng(7);

    expect(() => rng.pick([])).toThrow();
  });
});
