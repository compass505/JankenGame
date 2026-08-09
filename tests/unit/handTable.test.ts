import { describe, expect, it } from 'vitest';
import {
  NO_UPGRADES,
  UPGRADE_MAX_PER_HAND,
  applyUpgrade,
  buildHandTable,
  canUpgrade,
} from '@/domain/handTable';
import type { HandTable, UpgradeCounts } from '@/domain/handTable';

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
