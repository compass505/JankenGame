import { describe, expect, it } from 'vitest';
import {
  NO_HEAT,
  NO_UPGRADES,
  UPGRADE_MAX_PER_HAND,
  advanceHeat,
  applyHeat,
  applyUpgrade,
  buildHandTable,
  canUpgrade,
} from '@/domain/handTable';
import type { HandTable, HeatCounts, HeatRule, UpgradeCounts } from '@/domain/handTable';

describe('NO_UPGRADES / UPGRADE_MAX_PER_HAND', () => {
  it('NO_UPGRADES はすべて0', () => {
    expect(NO_UPGRADES).toEqual({ rock: 0, scissors: 0, paper: 0 });
  });

  it('UPGRADE_MAX_PER_HAND は2', () => {
    expect(UPGRADE_MAX_PER_HAND).toBe(2);
  });
});

describe('canUpgrade', () => {
  it('上限未満なら true', () => {
    const counts: UpgradeCounts = { rock: 0, scissors: 1, paper: 1 };

    expect(canUpgrade(counts, 'rock')).toBe(true);
    expect(canUpgrade(counts, 'scissors')).toBe(true);
    expect(canUpgrade(counts, 'paper')).toBe(true);
  });

  it('上限に達していたら false（その手だけ）', () => {
    const counts: UpgradeCounts = { rock: 2, scissors: 0, paper: 1 };

    expect(canUpgrade(counts, 'rock')).toBe(false);
    expect(canUpgrade(counts, 'scissors')).toBe(true);
    expect(canUpgrade(counts, 'paper')).toBe(true);
  });
});

describe('applyUpgrade', () => {
  it('上限未満なら1増える', () => {
    const counts: UpgradeCounts = { rock: 0, scissors: 0, paper: 0 };

    const once = applyUpgrade(counts, 'rock');
    expect(once).toEqual({ rock: 1, scissors: 0, paper: 0 });

    const twice = applyUpgrade(once, 'rock');
    expect(twice).toEqual({ rock: 2, scissors: 0, paper: 0 });
  });

  it('上限に達していたら counts をそのまま返す（例外を投げない）', () => {
    const counts: UpgradeCounts = { rock: 2, scissors: 0, paper: 0 };

    expect(() => applyUpgrade(counts, 'rock')).not.toThrow();
    expect(applyUpgrade(counts, 'rock')).toEqual({ rock: 2, scissors: 0, paper: 0 });
  });

  it('指定した手以外は変化しない', () => {
    const counts: UpgradeCounts = { rock: 1, scissors: 1, paper: 1 };

    expect(applyUpgrade(counts, 'paper')).toEqual({ rock: 1, scissors: 1, paper: 2 });
  });

  it('引数の counts を書き換えない', () => {
    const counts: UpgradeCounts = { rock: 0, scissors: 0, paper: 0 };
    const clone = { ...counts };

    applyUpgrade(counts, 'rock');

    expect(counts).toEqual(clone);
  });

  it('不変条件: 何度適用しても 0 <= counts[hand] <= UPGRADE_MAX_PER_HAND', () => {
    let counts: UpgradeCounts = NO_UPGRADES;

    for (let i = 0; i < 10; i += 1) {
      counts = applyUpgrade(counts, 'scissors');
      expect(counts.scissors).toBeGreaterThanOrEqual(0);
      expect(counts.scissors).toBeLessThanOrEqual(UPGRADE_MAX_PER_HAND);
    }

    expect(counts.scissors).toBe(UPGRADE_MAX_PER_HAND);
  });
});

describe('buildHandTable', () => {
  const base: HandTable = {
    rock: { damage: 3, heal: 0, stareBonus: 2 },
    scissors: { damage: 6, heal: 0, stareBonus: 0 },
    paper: { damage: 4, heal: 3, stareBonus: 0 },
  };

  it('具体例: rock を1回強化すると damage だけ+1される', () => {
    const counts: UpgradeCounts = { rock: 1, scissors: 0, paper: 0 };

    const table = buildHandTable(base, counts);

    expect(table.rock).toEqual({ damage: 4, heal: 0, stareBonus: 2 });
    expect(table.scissors).toEqual(base.scissors);
    expect(table.paper).toEqual(base.paper);
  });

  it('強化は damage にのみ加算し、heal と stareBonus は動かさない', () => {
    const counts: UpgradeCounts = { rock: 2, scissors: 1, paper: 2 };

    const table = buildHandTable(base, counts);

    expect(table.rock.damage).toBe(base.rock.damage + 2);
    expect(table.rock.heal).toBe(base.rock.heal);
    expect(table.rock.stareBonus).toBe(base.rock.stareBonus);

    expect(table.scissors.damage).toBe(base.scissors.damage + 1);
    expect(table.scissors.heal).toBe(base.scissors.heal);

    expect(table.paper.damage).toBe(base.paper.damage + 2);
    expect(table.paper.heal).toBe(base.paper.heal);
  });

  it('NO_UPGRADES を渡すと base と同じ値になる', () => {
    expect(buildHandTable(base, NO_UPGRADES)).toEqual(base);
  });

  it('引数の base を書き換えない', () => {
    const clone = JSON.parse(JSON.stringify(base)) as HandTable;

    buildHandTable(base, { rock: 2, scissors: 2, paper: 2 });

    expect(base).toEqual(clone);
  });
});

/**
 * 熱の効き方はテスト内のローカルなフィクスチャにする。
 * 実際の値は src/data/heat.ts にあり、/balance で動く（docs/04「data の数値を検証しない」）。
 * 下の具体例はすべて docs/03 節2.5 のもので、この rule のときの値。
 */
const RULE: HeatRule = { gain: 4, maxPenalty: 3 };

describe('NO_HEAT', () => {
  it('NO_HEAT はすべて0', () => {
    expect(NO_HEAT).toEqual({ rock: 0, scissors: 0, paper: 0 });
  });
});

describe('applyHeat', () => {
  // docs/03_detailed-design.md 節2.5 の具体例そのもの
  const base: HandTable = {
    rock: { damage: 3, heal: 0, stareBonus: 2 },
    scissors: { damage: 5, heal: 0, stareBonus: 0 },
    paper: { damage: 4, heal: 3, stareBonus: 0 },
  };

  it('NO_HEAT を渡すと base と同じ値になる', () => {
    expect(applyHeat(base, NO_HEAT, RULE)).toEqual(base);
  });

  it('heal と stareBonus は動かさない（強化と同じく damage にしか触らない）', () => {
    const heat: HeatCounts = { rock: 10, scissors: 10, paper: 10 };

    const table = applyHeat(base, heat, RULE);

    expect(table.rock.heal).toBe(base.rock.heal);
    expect(table.rock.stareBonus).toBe(base.rock.stareBonus);
    expect(table.scissors.heal).toBe(base.scissors.heal);
    expect(table.scissors.stareBonus).toBe(base.scissors.stareBonus);
    expect(table.paper.heal).toBe(base.paper.heal);
    expect(table.paper.stareBonus).toBe(base.paper.stareBonus);
  });

  it.each([
    [0, 5],
    [4, 4],
    [7, 4], // floor(7/4) = 1段。2段にならないことが要点
    [13, 2],
    [40, 2], // 上限で止まる
  ])('具体例: 熱%iのとき damage は%iになる（floor(熱/rule.gain)段の弱化）', (heat, expected) => {
    const table = applyHeat(base, { rock: 0, scissors: heat, paper: 0 }, RULE);

    expect(table.scissors.damage).toBe(expected);
  });

  it('弱化しても damage は1未満にならない', () => {
    const lowBase: HandTable = {
      rock: { damage: 1, heal: 0, stareBonus: 0 },
      scissors: { damage: 1, heal: 0, stareBonus: 0 },
      paper: { damage: 1, heal: 0, stareBonus: 0 },
    };
    const heavyHeat: HeatCounts = { rock: 100, scissors: 100, paper: 100 };

    const table = applyHeat(lowBase, heavyHeat, RULE);

    expect(table.rock.damage).toBe(1);
    expect(table.scissors.damage).toBe(1);
    expect(table.paper.damage).toBe(1);
  });

  it('弱化量は rule.maxPenalty で頭打ち（熱13でも熱40でも同じdamage）', () => {
    const table13 = applyHeat(base, { rock: 0, scissors: 13, paper: 0 }, RULE);
    const table40 = applyHeat(base, { rock: 0, scissors: 40, paper: 0 }, RULE);

    expect(table13.scissors.damage).toBe(table40.scissors.damage);
    expect(table40.scissors.damage).toBe(base.scissors.damage - RULE.maxPenalty);
  });

  it('引数の base と heat を書き換えない', () => {
    const baseClone = JSON.parse(JSON.stringify(base)) as HandTable;
    const heat: HeatCounts = { rock: 0, scissors: 13, paper: 0 };
    const heatClone = { ...heat };

    applyHeat(base, heat, RULE);

    expect(base).toEqual(baseClone);
    expect(heat).toEqual(heatClone);
  });
});

describe('advanceHeat', () => {
  it('具体例: 熱4の手をもう一度出すと、先に1冷めてから+4されて7になる', () => {
    const heat: HeatCounts = { rock: 0, scissors: 4, paper: 0 };

    expect(advanceHeat(heat, 'scissors', RULE)).toEqual({ rock: 0, scissors: 7, paper: 0 });
  });

  it('具体例: 出さなかった手（熱4）は1冷め、出した手（rock）は0から+4される', () => {
    const heat: HeatCounts = { rock: 0, scissors: 4, paper: 0 };

    expect(advanceHeat(heat, 'rock', RULE)).toEqual({ rock: 4, scissors: 3, paper: 0 });
  });

  it('熱が0の手は冷ましても0未満にならない', () => {
    const heat: HeatCounts = { rock: 0, scissors: 0, paper: 0 };

    const next = advanceHeat(heat, 'scissors', RULE);

    expect(next.rock).toBe(0);
    expect(next.paper).toBe(0);
  });

  it('引数の heat を書き換えない', () => {
    const heat: HeatCounts = { rock: 1, scissors: 4, paper: 2 };
    const clone = { ...heat };

    advanceHeat(heat, 'scissors', RULE);

    expect(heat).toEqual(clone);
  });

  it('不変条件: 何度適用しても heat[h] は0以上', () => {
    let heat: HeatCounts = NO_HEAT;

    for (let i = 0; i < 5; i += 1) {
      heat = advanceHeat(heat, 'rock', RULE);
      expect(heat.rock).toBeGreaterThanOrEqual(0);
      expect(heat.scissors).toBeGreaterThanOrEqual(0);
      expect(heat.paper).toBeGreaterThanOrEqual(0);
    }
  });
});
