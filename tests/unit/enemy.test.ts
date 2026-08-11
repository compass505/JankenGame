import { describe, expect, it } from 'vitest';
import { UNIFORM_MIX, decideEnemyHand, enemyPhase, handProbabilities } from '@/domain/enemy';
import type { EnemyDef, HandWeights } from '@/domain/enemy';
import type { Hand } from '@/domain/hand';
import { HANDS } from '@/domain/hand';
import { createRng } from '@/lib/rng';
import type { Rng } from '@/lib/rng';

function makeEnemy(overrides: Partial<EnemyDef> = {}): EnemyDef {
  return {
    id: 'test',
    name: 'テスト敵',
    maxHp: 20,
    weightsNormal: { rock: 1, scissors: 1, paper: 1 },
    weightsDesperate: { rock: 1, scissors: 1, paper: 1 },
    resistance: { rock: 1, scissors: 1, paper: 1 },
    // 本気の攻撃強化は application が掛ける（docs/03 節5）。domain 側は値を持つだけ
    desperateBonus: 0,
    drawRule: 'standard',
    ...overrides,
  };
}

/** next() が常に固定値を返す Rng。しきい値の境界を正確に制御するために使う */
function fixedRng(value: number): Rng {
  return {
    next: () => value,
    int: (maxExclusive: number) => Math.floor(value * maxExclusive),
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(value * items.length)];
      if (item === undefined) throw new Error('fixedRng.pick: 空配列');
      return item;
    },
  };
}

/** rng.next() の呼び出し回数を数える */
function countingRng(inner: Rng): { rng: Rng; calls: () => number } {
  let count = 0;
  return {
    calls: () => count,
    rng: {
      next: () => {
        count += 1;
        return inner.next();
      },
      int: (m: number) => inner.int(m),
      pick: <T>(items: readonly T[]): T => inner.pick(items),
    },
  };
}

describe('enemyPhase', () => {
  it('HPが最大HPの半分ちょうどなら desperate', () => {
    expect(enemyPhase(6, 12)).toBe('desperate');
  });

  it('HPが最大HPの半分より上なら normal', () => {
    expect(enemyPhase(7, 12)).toBe('normal');
  });

  it('HPが最大HPの半分未満なら desperate', () => {
    expect(enemyPhase(5, 12)).toBe('desperate');
  });

  it('満タンHPなら normal', () => {
    expect(enemyPhase(12, 12)).toBe('normal');
  });

  it('HPが0なら desperate', () => {
    expect(enemyPhase(0, 12)).toBe('desperate');
  });
});

describe('handProbabilities', () => {
  it('具体例: w={rock:0.6, scissors:0.2, paper:0.2} → p={rock:0.52, scissors:0.24, paper:0.24}', () => {
    const enemy = makeEnemy({ weightsNormal: { rock: 0.6, scissors: 0.2, paper: 0.2 } });

    const p = handProbabilities(enemy, 'normal');

    expect(p.rock).toBeCloseTo(0.52, 10);
    expect(p.scissors).toBeCloseTo(0.24, 10);
    expect(p.paper).toBeCloseTo(0.24, 10);
  });

  it('確率の和は1になる', () => {
    const weightSets: HandWeights[] = [
      { rock: 1, scissors: 1, paper: 1 },
      { rock: 5, scissors: 1, paper: 1 },
      { rock: 0, scissors: 0, paper: 1 },
      { rock: 100, scissors: 0.01, paper: 3 },
    ];

    for (const weightsNormal of weightSets) {
      const p = handProbabilities(makeEnemy({ weightsNormal }), 'normal');
      expect(p.rock + p.scissors + p.paper).toBeCloseTo(1, 10);
    }
  });

  it('すべての手の確率が 0.1 以上になる（極端な偏りでも）', () => {
    const enemy = makeEnemy({ weightsNormal: { rock: 1000, scissors: 0, paper: 0 } });

    const p = handProbabilities(enemy, 'normal');

    expect(p.rock).toBeGreaterThanOrEqual(UNIFORM_MIX / 3 - 1e-9);
    expect(p.scissors).toBeGreaterThanOrEqual(UNIFORM_MIX / 3 - 1e-9);
    expect(p.paper).toBeGreaterThanOrEqual(UNIFORM_MIX / 3 - 1e-9);
    expect(p.scissors).toBeCloseTo(UNIFORM_MIX / 3, 10);
    expect(p.paper).toBeCloseTo(UNIFORM_MIX / 3, 10);
  });

  it('負の重みは0として扱われる', () => {
    const withNegative = handProbabilities(
      makeEnemy({ weightsNormal: { rock: -5, scissors: 1, paper: 1 } }),
      'normal',
    );
    const withZero = handProbabilities(
      makeEnemy({ weightsNormal: { rock: 0, scissors: 1, paper: 1 } }),
      'normal',
    );

    expect(withNegative).toEqual(withZero);
  });

  it('重みの合計が0以下なら3手とも1/3になる（データ不備の保険）', () => {
    const allZero = handProbabilities(
      makeEnemy({ weightsNormal: { rock: 0, scissors: 0, paper: 0 } }),
      'normal',
    );
    const allNegative = handProbabilities(
      makeEnemy({ weightsNormal: { rock: -1, scissors: -2, paper: -3 } }),
      'normal',
    );

    for (const p of [allZero, allNegative]) {
      expect(p.rock).toBeCloseTo(1 / 3, 10);
      expect(p.scissors).toBeCloseTo(1 / 3, 10);
      expect(p.paper).toBeCloseTo(1 / 3, 10);
    }
  });

  it('重みの大小関係は確率の大小関係に保たれる', () => {
    const enemy = makeEnemy({ weightsNormal: { rock: 5, scissors: 2, paper: 1 } });

    const p = handProbabilities(enemy, 'normal');

    expect(p.rock).toBeGreaterThan(p.scissors);
    expect(p.scissors).toBeGreaterThan(p.paper);
  });

  it('phase により weightsNormal / weightsDesperate を切り替える', () => {
    const enemy = makeEnemy({
      weightsNormal: { rock: 1, scissors: 0, paper: 0 },
      weightsDesperate: { rock: 0, scissors: 0, paper: 1 },
    });

    const normal = handProbabilities(enemy, 'normal');
    const desperate = handProbabilities(enemy, 'desperate');

    expect(normal.rock).toBeGreaterThan(normal.paper);
    expect(desperate.paper).toBeGreaterThan(desperate.rock);
  });
});

describe('decideEnemyHand', () => {
  it('rng.next() をちょうど1回だけ呼ぶ', () => {
    const { rng, calls } = countingRng(createRng(1));
    const enemy = makeEnemy();

    decideEnemyHand(enemy, 20, 20, rng);

    expect(calls()).toBe(1);
  });

  it('同じ乱数値・同じ敵の状態なら常に同じ手を返す（決定的）', () => {
    const enemy = makeEnemy();

    const a = decideEnemyHand(enemy, 10, 20, fixedRng(0.05));
    const b = decideEnemyHand(enemy, 10, 20, fixedRng(0.05));

    expect(a).toBe(b);
  });

  it('返す値は必ず3手のいずれか', () => {
    const enemy = makeEnemy();

    for (const r of [0, 0.1, 0.33, 0.5, 0.66, 0.9, 0.999999]) {
      const hand = decideEnemyHand(enemy, 20, 20, fixedRng(r));
      expect(HANDS).toContain(hand);
    }
  });

  it('累積確率のしきい値どおりに手を選ぶ（重みが均等なとき）', () => {
    // weightsNormal が均等なら handProbabilities も概ね均等 (1/3 ずつ) になる。
    // HANDS の順序 rock, scissors, paper で累積するため、r の位置で選ばれる手が決まる。
    const enemy = makeEnemy({ weightsNormal: { rock: 1, scissors: 1, paper: 1 } });

    expect(decideEnemyHand(enemy, 20, 20, fixedRng(0.1))).toBe('rock');
    expect(decideEnemyHand(enemy, 20, 20, fixedRng(0.5))).toBe('scissors');
    expect(decideEnemyHand(enemy, 20, 20, fixedRng(0.9))).toBe('paper');
  });

  it('浮動小数の誤差で累積がrに届かなくても最後は paper を返す', () => {
    const enemy = makeEnemy({ weightsNormal: { rock: 1, scissors: 1, paper: 1 } });

    const hand = decideEnemyHand(enemy, 20, 20, fixedRng(0.999999999));

    expect(hand).toBe('paper');
  });

  it('再現性: 同じシードの Rng を渡すと同じ手の列になる', () => {
    const enemy = makeEnemy({ weightsNormal: { rock: 3, scissors: 1, paper: 1 } });

    const seqA: Hand[] = [];
    const seqB: Hand[] = [];
    const rngA = createRng(42);
    const rngB = createRng(42);

    for (let i = 0; i < 50; i += 1) {
      seqA.push(decideEnemyHand(enemy, 20, 20, rngA));
      seqB.push(decideEnemyHand(enemy, 20, 20, rngB));
    }

    expect(seqA).toEqual(seqB);
  });
});
