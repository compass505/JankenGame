/**
 * シード付き乱数。
 *
 * ゲーム内で乱数が必要な箇所は必ずここを経由する。`Math.random()` を直接呼ぶと
 * 同じ試合を再現できなくなり、テストもバランス検証も成立しなくなる。
 * 同じシードを渡せば、必ず同じ試合が再現される。
 */
export interface Rng {
  /** 0 以上 1 未満 */
  next(): number;
  /** 0 以上 maxExclusive 未満の整数 */
  int(maxExclusive: number): number;
  /** 配列から1つ選ぶ */
  pick<T>(items: readonly T[]): T;
}

/** mulberry32 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,

    int(maxExclusive: number): number {
      return Math.floor(next() * maxExclusive);
    },

    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) {
        throw new Error('pick: 空の配列からは選べません');
      }
      return item;
    },
  };
}
