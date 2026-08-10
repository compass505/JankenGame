import { describe, expect, it } from 'vitest';
import {
  NO_HEAT,
  NO_UPGRADES,
  UPGRADE_MAX_PER_HAND,
  advanceHeat,
  applyHeat,
  applyUpgrade,
  buildHandTableWith,
  canUpgrade,
  heatPenalty,
} from '@/domain/handTable';
import type { HandTable, HeatCounts, HeatRule, UpgradeCounts, UpgradeTargets } from '@/domain/handTable';
import type { Hand } from '@/domain/hand';

/**
 * `docs/adr/0003-repetition-window.md` で連打の罰が「熱（溜まって冷める）」から
 * 「直近N手の窓」に変わったことに合わせて全面改訂。
 * 期待値の根拠はすべて `docs/03_detailed-design.md` 節2・節2.5。
 */

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

// ── buildHandTableWith（docs/03 節2。強化の行き先が手ごとに変わった） ─────────

describe('buildHandTableWith', () => {
  // docs/03 節2の「具体例」そのもの。
  const base: HandTable = {
    rock: { damage: 3, heal: 0, stareBonus: 4 },
    scissors: { damage: 5, heal: 0, stareBonus: 0 },
    paper: { damage: 3, heal: 3, stareBonus: 0 },
  };

  it('具体例(節2): targets.rock = "stareBonus" のとき rock は stareBonus だけ+1される', () => {
    const targets: UpgradeTargets = { rock: 'stareBonus', scissors: 'damage', paper: 'damage' };
    const counts: UpgradeCounts = { rock: 1, scissors: 0, paper: 0 };

    const table = buildHandTableWith(base, counts, targets);

    expect(table.rock).toEqual({ damage: 3, heal: 0, stareBonus: 5 });
  });

  it('具体例(節2): targets.paper = "damage" のとき paper は damage だけ+1される', () => {
    const targets: UpgradeTargets = { rock: 'stareBonus', scissors: 'damage', paper: 'damage' };
    const counts: UpgradeCounts = { rock: 0, scissors: 0, paper: 1 };

    const table = buildHandTableWith(base, counts, targets);

    expect(table.paper).toEqual({ damage: 4, heal: 3, stareBonus: 0 });
  });

  it('全部を damage に向けたとき、3手とも damage だけ増え stareBonus は動かない', () => {
    const targets: UpgradeTargets = { rock: 'damage', scissors: 'damage', paper: 'damage' };
    const counts: UpgradeCounts = { rock: 2, scissors: 1, paper: 2 };

    const table = buildHandTableWith(base, counts, targets);

    expect(table.rock.damage).toBe(base.rock.damage + 2);
    expect(table.rock.stareBonus).toBe(base.rock.stareBonus);
    expect(table.scissors.damage).toBe(base.scissors.damage + 1);
    expect(table.scissors.stareBonus).toBe(base.scissors.stareBonus);
    expect(table.paper.damage).toBe(base.paper.damage + 2);
    expect(table.paper.stareBonus).toBe(base.paper.stareBonus);
  });

  it('全部を stareBonus に向けたとき、3手とも stareBonus だけ増え damage は動かない', () => {
    const targets: UpgradeTargets = { rock: 'stareBonus', scissors: 'stareBonus', paper: 'stareBonus' };
    const counts: UpgradeCounts = { rock: 2, scissors: 1, paper: 2 };

    const table = buildHandTableWith(base, counts, targets);

    expect(table.rock.stareBonus).toBe(base.rock.stareBonus + 2);
    expect(table.rock.damage).toBe(base.rock.damage);
    expect(table.scissors.stareBonus).toBe(base.scissors.stareBonus + 1);
    expect(table.scissors.damage).toBe(base.scissors.damage);
    expect(table.paper.stareBonus).toBe(base.paper.stareBonus + 2);
    expect(table.paper.damage).toBe(base.paper.damage);
  });

  it('heal はどちらの向きでも絶対に動かない（強化されると終了保証が壊れるため）', () => {
    const allDamage: UpgradeTargets = { rock: 'damage', scissors: 'damage', paper: 'damage' };
    const allStare: UpgradeTargets = { rock: 'stareBonus', scissors: 'stareBonus', paper: 'stareBonus' };
    const counts: UpgradeCounts = { rock: 2, scissors: 2, paper: 2 };

    const tableDamage = buildHandTableWith(base, counts, allDamage);
    const tableStare = buildHandTableWith(base, counts, allStare);

    expect(tableDamage.rock.heal).toBe(base.rock.heal);
    expect(tableDamage.scissors.heal).toBe(base.scissors.heal);
    expect(tableDamage.paper.heal).toBe(base.paper.heal);
    expect(tableStare.rock.heal).toBe(base.rock.heal);
    expect(tableStare.scissors.heal).toBe(base.scissors.heal);
    expect(tableStare.paper.heal).toBe(base.paper.heal);
  });

  it('NO_UPGRADES を渡すと base と同じ値になる', () => {
    const targets: UpgradeTargets = { rock: 'stareBonus', scissors: 'damage', paper: 'damage' };

    expect(buildHandTableWith(base, NO_UPGRADES, targets)).toEqual(base);
  });

  it('引数の base と counts を書き換えない', () => {
    const targets: UpgradeTargets = { rock: 'stareBonus', scissors: 'damage', paper: 'damage' };
    const counts: UpgradeCounts = { rock: 2, scissors: 2, paper: 2 };
    const baseClone = JSON.parse(JSON.stringify(base)) as HandTable;
    const countsClone = { ...counts };

    buildHandTableWith(base, counts, targets);

    expect(base).toEqual(baseClone);
    expect(counts).toEqual(countsClone);
  });
});

// ── 連打の罰（docs/03 節2.5・docs/adr/0003-repetition-window.md） ────────────
//
// 「溜まって冷める」熱ではなく「直近の履歴を数えるだけ」に変わった。
// 効き方（window/allowed/maxPenalty）はテスト内のローカルなフィクスチャで渡す。
// 実際の値は src/data/heat.ts にあり /balance で動くので、値そのものは検証しない。

const RULE: HeatRule = { window: 4, allowed: 2, maxPenalty: 3 };

describe('NO_HEAT', () => {
  it('NO_HEAT は空配列', () => {
    expect(NO_HEAT).toEqual([]);
  });
});

/**
 * 手の列を先頭から出していったときの、各ターンの弱化量の列を返す。
 * 「その手を出す直前の履歴で heatPenalty を取る → advanceHeat で進める」という
 * docs/03 節2.5 の手順そのもの。
 */
function heatSequence(hands: readonly Hand[], rule: HeatRule): number[] {
  let history: HeatCounts = NO_HEAT;
  const penalties: number[] = [];

  for (const hand of hands) {
    penalties.push(heatPenalty(history, hand, rule));
    history = advanceHeat(history, hand, rule);
  }

  return penalties;
}

describe('heatPenalty（docs/03 節2.5 の具体例の表そのもの。rule = {window:4, allowed:2, maxPenalty:3}）', () => {
  // 「均等回しと2連続は罰なし、3連続から罰」が ADR 0003 の狙いそのもの。
  // 列ごとに1つずつ it を立て、どれが落ちたか名前で分かるようにしてある。
  const rock: Hand = 'rock';
  const scissors: Hand = 'scissors';
  const paper: Hand = 'paper';

  it('均等に回す（グチパグチパグ）: 弱化はすべて0', () => {
    const hands: Hand[] = [rock, scissors, paper, rock, scissors, paper, rock];

    expect(heatSequence(hands, RULE)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('2連続を挟む（ググチパググチ）: 弱化はすべて0', () => {
    const hands: Hand[] = [rock, rock, scissors, paper, rock, rock, scissors];

    expect(heatSequence(hands, RULE)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('3連続（グググチパグ）: 3連続目から弱化1が付く', () => {
    const hands: Hand[] = [rock, rock, rock, scissors, paper, rock];

    expect(heatSequence(hands, RULE)).toEqual([0, 0, 1, 0, 0, 0]);
  });

  it('同じ手だけ（ググググググ・6手）: 弱化1から2で頭打ちになる', () => {
    const hands: Hand[] = [rock, rock, rock, rock, rock, rock];

    expect(heatSequence(hands, RULE)).toEqual([0, 0, 1, 2, 2, 2]);
  });

  it('2手交互（グチグチグチ）: 弱化はすべて0（承知のうえで罰を付けない仕様）', () => {
    const hands: Hand[] = [rock, scissors, rock, scissors, rock, scissors];

    expect(heatSequence(hands, RULE)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('applyHeat', () => {
  const base: HandTable = {
    rock: { damage: 3, heal: 0, stareBonus: 4 },
    scissors: { damage: 5, heal: 0, stareBonus: 0 },
    paper: { damage: 3, heal: 3, stareBonus: 0 },
  };

  it('NO_HEAT を渡すと base と同じ値になる', () => {
    expect(applyHeat(base, NO_HEAT, RULE)).toEqual(base);
  });

  it('heal と stareBonus は動かさない（強化と同じく damage にしか触らない）', () => {
    const history: HeatCounts = ['rock', 'rock', 'rock', 'scissors'];

    const table = applyHeat(base, history, RULE);

    expect(table.rock.heal).toBe(base.rock.heal);
    expect(table.rock.stareBonus).toBe(base.rock.stareBonus);
    expect(table.scissors.heal).toBe(base.scissors.heal);
    expect(table.scissors.stareBonus).toBe(base.scissors.stareBonus);
    expect(table.paper.heal).toBe(base.paper.heal);
    expect(table.paper.stareBonus).toBe(base.paper.stareBonus);
  });

  it('3連続した手だけ damage が下がり、出していない手は下がらない', () => {
    const history: HeatCounts = ['rock', 'rock', 'rock'];

    const table = applyHeat(base, history, RULE);

    expect(table.rock.damage).toBe(base.rock.damage - heatPenalty(history, 'rock', RULE));
    expect(table.scissors.damage).toBe(base.scissors.damage);
    expect(table.paper.damage).toBe(base.paper.damage);
  });

  it('弱化しても damage は1未満にならない', () => {
    const lowBase: HandTable = {
      rock: { damage: 1, heal: 0, stareBonus: 0 },
      scissors: { damage: 1, heal: 0, stareBonus: 0 },
      paper: { damage: 1, heal: 0, stareBonus: 0 },
    };
    const history: HeatCounts = ['rock', 'rock', 'rock'];

    const table = applyHeat(lowBase, history, RULE);

    expect(table.rock.damage).toBe(1);
    expect(table.scissors.damage).toBe(1);
    expect(table.paper.damage).toBe(1);
  });

  it('弱化量は rule.maxPenalty を超えない（window:4, allowed:2 では最大2までしか届かない）', () => {
    const history: HeatCounts = ['rock', 'rock', 'rock'];

    const table = applyHeat(base, history, RULE);
    const actualPenalty = base.rock.damage - table.rock.damage;

    expect(actualPenalty).toBeLessThanOrEqual(RULE.maxPenalty);
    expect(actualPenalty).toBeLessThanOrEqual(2);
  });

  it('maxPenalty が実際に効くケース（window:4/allowed:2 では届かないので別のローカル rule で確認する）', () => {
    // ADR 0003 本文: 「maxPenalty は現状の window/allowed では効かない（最大 c=4 なので弱化は2まで）」。
    // maxPenalty そのものの頭打ちを見るには窓を広げた rule が要る。
    const deepRule: HeatRule = { window: 10, allowed: 0, maxPenalty: 2 };
    const history: HeatCounts = new Array(9).fill('rock') as Hand[];

    const table = applyHeat(base, history, deepRule);

    // maxPenalty が無ければ count=10, penalty=10-0=10 になるはずだが、2で頭打ちになる
    expect(base.rock.damage - table.rock.damage).toBe(deepRule.maxPenalty);
  });

  it('引数の base と history を書き換えない', () => {
    const baseClone = JSON.parse(JSON.stringify(base)) as HandTable;
    const history: HeatCounts = ['rock', 'rock', 'rock'];
    const historyClone = [...history];

    applyHeat(base, history, RULE);

    expect(base).toEqual(baseClone);
    expect(history).toEqual(historyClone);
  });
});

describe('advanceHeat', () => {
  it('新しい手が末尾に付く', () => {
    const history: HeatCounts = ['rock'];

    expect(advanceHeat(history, 'paper', RULE)).toEqual(['rock', 'paper']);
  });

  it('長さが rule.window - 1 を超えたら、古いほう（先頭）から捨てる', () => {
    const history: HeatCounts = ['rock', 'scissors', 'paper']; // すでに window-1 = 3

    expect(advanceHeat(history, 'rock', RULE)).toEqual(['scissors', 'paper', 'rock']);
  });

  it('引数の history を書き換えず、新しい配列を返す', () => {
    const history: HeatCounts = ['rock', 'scissors'];
    const clone = [...history];

    const next = advanceHeat(history, 'paper', RULE);

    expect(history).toEqual(clone);
    expect(next).not.toBe(history);
  });

  it('不変条件: NO_HEAT から何度進めても長さは rule.window - 1 以下', () => {
    let history: HeatCounts = NO_HEAT;

    for (let i = 0; i < 20; i += 1) {
      history = advanceHeat(history, 'rock', RULE);
      expect(history.length).toBeLessThanOrEqual(RULE.window - 1);
    }
  });
});
