import { describe, expect, it } from 'vitest';
import {
  STARE_GAIN,
  STARE_MAX,
  STARE_MAX_DRAW_DAMAGE,
  createBattle,
  dealtDamage,
  resolveTurn,
} from '@/domain/battle';
import type { BattleContext, BattleState, TurnResult } from '@/domain/battle';
import type { EnemyDef, HandWeights } from '@/domain/enemy';
import type { Hand } from '@/domain/hand';
import type { HandTable, HandValue } from '@/domain/handTable';
import { createRng } from '@/lib/rng';
import type { Rng } from '@/lib/rng';

// ── テスト用ヘルパ ──────────────────────────────────────────────
// domain のテストは src/data の数値に依存しない。自前で組み立てる。

const DEFAULT_HAND_VALUE: HandValue = { damage: 1, heal: 0, stareBonus: 0 };

function handTable(overrides: Partial<Record<Hand, HandValue>> = {}): HandTable {
  return {
    rock: overrides.rock ?? DEFAULT_HAND_VALUE,
    scissors: overrides.scissors ?? DEFAULT_HAND_VALUE,
    paper: overrides.paper ?? DEFAULT_HAND_VALUE,
  };
}

/** 指定した手の重みだけを立てた HandWeights。decideEnemyHand の出す手を固定するために使う */
function forcedWeights(hand: Hand): HandWeights {
  return {
    rock: hand === 'rock' ? 1 : 0,
    scissors: hand === 'scissors' ? 1 : 0,
    paper: hand === 'paper' ? 1 : 0,
  };
}

function enemyDef(overrides: Partial<EnemyDef> = {}): EnemyDef {
  return {
    id: 'test',
    name: 'テスト敵',
    maxHp: 20,
    weightsNormal: { rock: 1, scissors: 1, paper: 1 },
    weightsDesperate: { rock: 1, scissors: 1, paper: 1 },
    resistance: { rock: 1, scissors: 1, paper: 1 },
    // resolveTurn は本気の強化を知らない（application が enemyHands に織り込む。docs/03 節5）
    desperateBonus: 0,
    drawRule: 'standard',
    hint: 'テスト用',
    ...overrides,
  };
}

function state(overrides: Partial<BattleState> = {}): BattleState {
  return {
    playerHp: 15,
    playerMaxHp: 15,
    enemyHp: 12,
    enemyMaxHp: 12,
    stare: 0,
    turn: 0,
    outcome: null,
    ...overrides,
  };
}

/**
 * next() が常に固定値を返す Rng。
 * forcedWeights と組み合わせると、weight を集中させた手の累積確率区間は
 * 常に [UNIFORM_MIX/3, 1 - UNIFORM_MIX/3] = [0.1, 0.9] を含むため、
 * 0.5 を返せば forcedWeights で狙った手が必ず選ばれる。
 */
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

/** 敵の手を hand に固定した BattleContext を作る */
function ctxForcingEnemyHand(
  hand: Hand,
  overrides: { playerHands?: HandTable; enemyHands?: HandTable; enemyOverrides?: Partial<EnemyDef> } = {},
): BattleContext {
  return {
    playerHands: overrides.playerHands ?? handTable(),
    enemyHands: overrides.enemyHands ?? handTable(),
    enemy: enemyDef({
      weightsNormal: forcedWeights(hand),
      weightsDesperate: forcedWeights(hand),
      ...overrides.enemyOverrides,
    }),
  };
}

const RNG_FOR_FORCED_HAND = fixedRng(0.5);

// ── createBattle ────────────────────────────────────────────────

describe('createBattle', () => {
  it('初期状態を作る', () => {
    const enemy = enemyDef({ maxHp: 12 });

    const s = createBattle(15, enemy);

    expect(s).toEqual({
      playerHp: 15,
      playerMaxHp: 15,
      enemyHp: 12,
      enemyMaxHp: 12,
      stare: 0,
      turn: 0,
      outcome: null,
    });
  });
});

// ── 手順0: 決着済みの state ─────────────────────────────────────

describe('resolveTurn: 決着済みの state', () => {
  it('rng を呼ばず、state をそのまま返す', () => {
    const s = state({ outcome: 'playerWin', turn: 7, stare: 1, playerHp: 10, enemyHp: 0 });
    const { rng, calls } = countingRng(fixedRng(0.5));
    const ctx = ctxForcingEnemyHand('rock');

    const result = resolveTurn(s, 'scissors', ctx, rng);

    expect(calls()).toBe(0);
    expect(result.state).toEqual(s);
  });

  it('ログはダミーではなく、現在のにらみ値で埋められる', () => {
    const s = state({ outcome: 'playerLose', turn: 3, stare: 2 });
    const ctx = ctxForcingEnemyHand('rock');

    const result = resolveTurn(s, 'paper', ctx, fixedRng(0.5));

    expect(result.log).toEqual({
      playerHand: 'paper',
      enemyHand: 'paper',
      outcome: 'draw',
      damageToEnemy: 0,
      damageToPlayer: 0,
      healToPlayer: 0,
      healToEnemy: 0,
      stareBefore: 2,
      stareAfter: 2,
    });
  });
});

// ── 具体例（docs/03 節4） ───────────────────────────────────────

describe('resolveTurn: 具体例', () => {
  it('例1: にらみを乗せてグーで勝つ', () => {
    const s = state({ playerHp: 15, playerMaxHp: 15, enemyHp: 12, enemyMaxHp: 12, stare: 2, turn: 5 });
    const ctx = ctxForcingEnemyHand('scissors', {
      playerHands: handTable({ rock: { damage: 3, heal: 0, stareBonus: 2 } }),
    });

    const result = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);

    expect(result.log.enemyHand).toBe('scissors');
    expect(result.log.outcome).toBe('win');
    expect(result.log.damageToEnemy).toBe(7);
    expect(result.state.enemyHp).toBe(5);
    expect(result.state.stare).toBe(0);
    expect(result.state.turn).toBe(6);
    expect(result.state.outcome).toBeNull();
  });

  it('例2: パーで勝つ（削られている）', () => {
    const s = state({ playerHp: 10, playerMaxHp: 15, enemyHp: 12, enemyMaxHp: 12, stare: 0, turn: 0 });
    const ctx = ctxForcingEnemyHand('rock', {
      playerHands: handTable({ paper: { damage: 4, heal: 3, stareBonus: 0 } }),
    });

    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    expect(result.log.damageToEnemy).toBe(4);
    expect(result.log.healToPlayer).toBe(3);
    expect(result.state.playerHp).toBe(13);
    expect(result.state.enemyHp).toBe(8);
    // HP総和は1減る
    expect(result.state.playerHp + result.state.enemyHp - (s.playerHp + s.enemyHp)).toBe(-1);
  });

  it('例3: パーで勝つ（耐性0.5の敵）', () => {
    const s = state({ playerHp: 10, playerMaxHp: 15, enemyHp: 12, enemyMaxHp: 12, stare: 0, turn: 0 });
    const ctx = ctxForcingEnemyHand('rock', {
      playerHands: handTable({ paper: { damage: 4, heal: 3, stareBonus: 0 } }),
      enemyOverrides: { resistance: { rock: 1, scissors: 1, paper: 0.5 } },
    });

    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    expect(result.log.damageToEnemy).toBe(2);
    expect(result.log.healToPlayer).toBe(1);
    // dealt-1 の頭打ちがないと総和が+1になってしまう箇所
    expect(result.state.playerHp + result.state.enemyHp - (s.playerHp + s.enemyHp)).toBe(-1);
  });

  it('例4: にらみが上限のあいこ', () => {
    const s = state({ playerHp: 15, playerMaxHp: 15, enemyHp: 12, enemyMaxHp: 12, stare: 2, turn: 3 });
    const ctx = ctxForcingEnemyHand('paper');

    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    expect(result.log.outcome).toBe('draw');
    expect(result.log.damageToPlayer).toBe(1);
    expect(result.log.damageToEnemy).toBe(1);
    expect(result.state.stare).toBe(2);
    expect(result.state.playerHp).toBe(14);
    expect(result.state.enemyHp).toBe(11);
  });

  it('例5: 同時に0以下ならプレイヤーの敗北（引き分けは作らない）', () => {
    const s = state({ playerHp: 1, playerMaxHp: 15, enemyHp: 1, enemyMaxHp: 12, stare: 2, turn: 9 });
    const ctx = ctxForcingEnemyHand('paper');

    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.playerHp).toBe(0);
    expect(result.state.enemyHp).toBe(0);
    expect(result.state.outcome).toBe('playerLose');
  });
});

// ── あいこの分岐 ───────────────────────────────────────────────

describe('resolveTurn: あいこ', () => {
  it('にらみが上限未満なら HP は動かず、にらみだけ standard分 (+1) 増える', () => {
    const s = state({ stare: 0 });
    const ctx = ctxForcingEnemyHand('rock', { enemyOverrides: { drawRule: 'standard' } });

    const result = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.stare).toBe(1);
    expect(result.state.playerHp).toBe(s.playerHp);
    expect(result.state.enemyHp).toBe(s.enemyHp);
    expect(result.log.damageToPlayer).toBe(0);
    expect(result.log.damageToEnemy).toBe(0);
  });

  it('stareDouble なら1回のあいこで上限まで増える。ただしHPはまだ動かない', () => {
    const s = state({ stare: 0 });
    const ctx = ctxForcingEnemyHand('rock', { enemyOverrides: { drawRule: 'stareDouble' } });

    const result = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.stare).toBe(2);
    expect(result.state.playerHp).toBe(s.playerHp);
    expect(result.state.enemyHp).toBe(s.enemyHp);
  });

  it('にらみが STARE_MAX を超えて積み上がることはない', () => {
    const s = state({ stare: 1 });
    const ctx = ctxForcingEnemyHand('rock', { enemyOverrides: { drawRule: 'stareDouble' } });

    const result = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.stare).toBe(STARE_MAX);
  });
});

// ── 定数 ──────────────────────────────────────────────────────

describe('定数', () => {
  it('STARE_MAX は 2', () => {
    expect(STARE_MAX).toBe(2);
  });

  it('STARE_MAX_DRAW_DAMAGE は 1', () => {
    expect(STARE_MAX_DRAW_DAMAGE).toBe(1);
  });

  it('STARE_GAIN は standard:1, stareDouble:2', () => {
    expect(STARE_GAIN).toEqual({ standard: 1, stareDouble: 2 });
  });
});

// ── 不変条件（docs/03 節4） ─────────────────────────────────────

describe('resolveTurn: 不変条件', () => {
  it('1: ダメージがHPを超えても0未満にならない（プレイヤー側）', () => {
    const s = state({ playerHp: 2, enemyHp: 20 });
    const ctx = ctxForcingEnemyHand('scissors', {
      enemyHands: handTable({ scissors: { damage: 100, heal: 0, stareBonus: 0 } }),
    });

    // paper は scissors に負ける
    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.playerHp).toBe(0);
    expect(result.state.playerHp).toBeGreaterThanOrEqual(0);
    expect(result.state.outcome).toBe('playerLose');
  });

  it('1: ダメージがHPを超えても0未満にならない（敵側）', () => {
    const s = state({ playerHp: 15, enemyHp: 2 });
    // scissors はpaperに勝つ
    const ctx = ctxForcingEnemyHand('paper', {
      playerHands: handTable({ scissors: { damage: 100, heal: 0, stareBonus: 0 } }),
    });

    const result = resolveTurn(s, 'scissors', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.enemyHp).toBe(0);
    expect(result.state.enemyHp).toBeGreaterThanOrEqual(0);
    expect(result.state.outcome).toBe('playerWin');
  });

  it('2: にらみは 0 <= stare <= STARE_MAX の範囲に収まる', () => {
    let s = state({ stare: 0 });
    const ctx = ctxForcingEnemyHand('rock', { enemyOverrides: { drawRule: 'standard' } });

    for (let i = 0; i < 5; i += 1) {
      const result = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);
      expect(result.state.stare).toBeGreaterThanOrEqual(0);
      expect(result.state.stare).toBeLessThanOrEqual(STARE_MAX);
      s = result.state;
    }
  });

  it('3: 未決着の state に対しては turn がちょうど+1される', () => {
    const s = state({ turn: 4 });
    const ctx = ctxForcingEnemyHand('rock');

    const result = resolveTurn(s, 'scissors', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.turn).toBe(5);
  });

  it('4: 相手が生き残るターンは HP総和が必ず1以上減る（プレイヤー勝ち）', () => {
    const s = state({ playerHp: 15, playerMaxHp: 15, enemyHp: 20, enemyMaxHp: 20, stare: 0 });
    const ctx = ctxForcingEnemyHand('rock', {
      playerHands: handTable({ scissors: { damage: 6, heal: 0, stareBonus: 0 } }),
    });

    const result = resolveTurn(s, 'scissors', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.outcome).toBeNull();
    const sumBefore = s.playerHp + s.enemyHp;
    const sumAfter = result.state.playerHp + result.state.enemyHp;
    expect(sumAfter).toBeLessThanOrEqual(sumBefore - 1);
  });

  it('4: 相手が生き残るターンは HP総和が必ず1以上減る（敵勝ち）', () => {
    const s = state({ playerHp: 15, playerMaxHp: 15, enemyHp: 12, enemyMaxHp: 12, stare: 0 });
    const ctx = ctxForcingEnemyHand('scissors', {
      enemyHands: handTable({ scissors: { damage: 6, heal: 0, stareBonus: 0 } }),
    });

    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.outcome).toBeNull();
    const sumBefore = s.playerHp + s.enemyHp;
    const sumAfter = result.state.playerHp + result.state.enemyHp;
    expect(sumAfter).toBeLessThanOrEqual(sumBefore - 1);
  });

  it('4: 相手を倒したターンだけは回復ぶんでHP総和が増えうる', () => {
    const s = state({ playerHp: 10, playerMaxHp: 15, enemyHp: 2, enemyMaxHp: 20, stare: 0 });
    const ctx = ctxForcingEnemyHand('rock', {
      playerHands: handTable({ paper: { damage: 4, heal: 3, stareBonus: 0 } }),
    });

    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.outcome).toBe('playerWin');
    expect(result.state.enemyHp).toBe(0);
    expect(result.state.playerHp).toBe(13);
    const sumBefore = s.playerHp + s.enemyHp;
    const sumAfter = result.state.playerHp + result.state.enemyHp;
    expect(sumAfter).toBeGreaterThan(sumBefore);
  });

  it('5: にらみが上限のあいこでは HP総和がちょうど2減る', () => {
    const s = state({ playerHp: 15, enemyHp: 12, stare: STARE_MAX });
    const ctx = ctxForcingEnemyHand('paper');

    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    const sumBefore = s.playerHp + s.enemyHp;
    const sumAfter = result.state.playerHp + result.state.enemyHp;
    expect(sumBefore - sumAfter).toBe(2);
  });

  it('6: にらみが上限未満のあいこでは HP が動かない', () => {
    const s = state({ playerHp: 15, enemyHp: 12, stare: 0 });
    const ctx = ctxForcingEnemyHand('paper');

    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    expect(result.state.playerHp).toBe(s.playerHp);
    expect(result.state.enemyHp).toBe(s.enemyHp);
    expect(result.state.stare).toBe(s.stare + STARE_GAIN.standard);
  });

  it('7: 引数の state を書き換えず、新しいオブジェクトを返す', () => {
    const s = state({ stare: 0 });
    const clone = { ...s };
    const ctx = ctxForcingEnemyHand('rock');

    const result = resolveTurn(s, 'scissors', ctx, RNG_FOR_FORCED_HAND);

    expect(s).toEqual(clone);
    expect(result.state).not.toBe(s);
  });

  it('8: standard では HP が変化しないあいこが連続するのは高々2回', () => {
    const ctx = ctxForcingEnemyHand('rock', { enemyOverrides: { drawRule: 'standard' } });
    let s = state({ stare: 0 });

    const r1 = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);
    expect(r1.state.playerHp + r1.state.enemyHp).toBe(s.playerHp + s.enemyHp);
    s = r1.state;

    const r2 = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);
    expect(r2.state.playerHp + r2.state.enemyHp).toBe(s.playerHp + s.enemyHp);
    expect(r2.state.stare).toBe(STARE_MAX);
    s = r2.state;

    const r3 = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);
    expect(r3.state.playerHp + r3.state.enemyHp).toBe(s.playerHp + s.enemyHp - 2);
  });

  it('8: stareDouble では HP が変化しないあいこが連続するのは高々1回', () => {
    const ctx = ctxForcingEnemyHand('rock', { enemyOverrides: { drawRule: 'stareDouble' } });
    let s = state({ stare: 0 });

    const r1 = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);
    expect(r1.state.playerHp + r1.state.enemyHp).toBe(s.playerHp + s.enemyHp);
    expect(r1.state.stare).toBe(STARE_MAX);
    s = r1.state;

    const r2 = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);
    expect(r2.state.playerHp + r2.state.enemyHp).toBe(s.playerHp + s.enemyHp - 2);
  });
});

// ── 再現性 ────────────────────────────────────────────────────

describe('再現性', () => {
  it('同じシードの Rng なら同じ結果の列になる', () => {
    const ctx: BattleContext = {
      playerHands: handTable({
        rock: { damage: 3, heal: 0, stareBonus: 2 },
        scissors: { damage: 6, heal: 0, stareBonus: 0 },
        paper: { damage: 4, heal: 3, stareBonus: 0 },
      }),
      enemyHands: handTable({
        rock: { damage: 3, heal: 0, stareBonus: 2 },
        scissors: { damage: 6, heal: 0, stareBonus: 0 },
        paper: { damage: 4, heal: 3, stareBonus: 0 },
      }),
      enemy: enemyDef({ maxHp: 12 }),
    };
    const hands: Hand[] = ['rock', 'scissors', 'paper'];

    const run = (): TurnResult[] => {
      let s = createBattle(15, ctx.enemy);
      const rng = createRng(42);
      const results: TurnResult[] = [];

      for (let i = 0; i < 30 && s.outcome === null; i += 1) {
        const hand = hands[i % hands.length];
        if (hand === undefined) throw new Error('unreachable');
        const result = resolveTurn(s, hand, ctx, rng);
        results.push(result);
        s = result.state;
      }

      return results;
    };

    expect(run()).toEqual(run());
  });
});

// ── dealtDamage（docs/03 節4） ───────────────────────────────────
//
// 「耐性0.5の敵に対してボタンが『6ダメージ』と表示して実際は3しか入らない」
// というずれ（節4「`dealtDamage` だけを関数に切り出す理由」）を二度と作らないためのテスト。

describe('dealtDamage', () => {
  it('耐性が1のとき damage + stare * stareBonus になる', () => {
    const v: HandValue = { damage: 5, heal: 0, stareBonus: 3 };

    expect(dealtDamage(v, 1, 2)).toBe(5 + 2 * 3);
  });

  it('耐性は damage にだけ掛かり、にらみのぶんには掛からない', () => {
    const v: HandValue = { damage: 4, heal: 0, stareBonus: 2 };

    // 耐性0.5: floor(4 * 0.5) = 2 に、耐性の掛からない stare*stareBonus (2*2=4) を足す
    expect(dealtDamage(v, 0.5, 2)).toBe(2 + 2 * 2);
  });

  it('耐性を掛けた結果は Math.floor される', () => {
    const v: HandValue = { damage: 5, heal: 0, stareBonus: 0 };

    // floor(5 * 0.5) = 2（切り捨てなければ 2.5 になってしまう）
    expect(dealtDamage(v, 0.5, 0)).toBe(2);
  });

  it('耐性でダメージが0以下になっても1で止まる', () => {
    const v: HandValue = { damage: 1, heal: 0, stareBonus: 0 };

    // floor(1 * 0.1) = 0 → max(1, 0) で1に戻る
    expect(dealtDamage(v, 0.1, 0)).toBe(1);
  });

  it('stare が0のときは耐性を適用した damage のみになる', () => {
    const v: HandValue = { damage: 5, heal: 0, stareBonus: 3 };

    expect(dealtDamage(v, 1, 0)).toBe(5);
  });
});

// ── resolveTurn の damageToEnemy は dealtDamage と一致する（docs/03 節4 具体例1〜3） ──

describe('resolveTurn の damageToEnemy は dealtDamage と一致する', () => {
  it('例1: にらみを乗せてグーで勝つ', () => {
    const s = state({ playerHp: 15, playerMaxHp: 15, enemyHp: 12, enemyMaxHp: 12, stare: 2, turn: 5 });
    const value: HandValue = { damage: 3, heal: 0, stareBonus: 2 };
    const ctx = ctxForcingEnemyHand('scissors', { playerHands: handTable({ rock: value }) });

    const result = resolveTurn(s, 'rock', ctx, RNG_FOR_FORCED_HAND);

    expect(result.log.damageToEnemy).toBe(dealtDamage(value, ctx.enemy.resistance.rock, s.stare));
  });

  it('例2: パーで勝つ（耐性1）', () => {
    const s = state({ playerHp: 10, playerMaxHp: 15, enemyHp: 12, enemyMaxHp: 12, stare: 0, turn: 0 });
    const value: HandValue = { damage: 4, heal: 3, stareBonus: 0 };
    const ctx = ctxForcingEnemyHand('rock', { playerHands: handTable({ paper: value }) });

    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    expect(result.log.damageToEnemy).toBe(dealtDamage(value, ctx.enemy.resistance.paper, s.stare));
  });

  it('例3: パーで勝つ（耐性0.5の敵）', () => {
    const s = state({ playerHp: 10, playerMaxHp: 15, enemyHp: 12, enemyMaxHp: 12, stare: 0, turn: 0 });
    const value: HandValue = { damage: 4, heal: 3, stareBonus: 0 };
    const ctx = ctxForcingEnemyHand('rock', {
      playerHands: handTable({ paper: value }),
      enemyOverrides: { resistance: { rock: 1, scissors: 1, paper: 0.5 } },
    });

    const result = resolveTurn(s, 'paper', ctx, RNG_FOR_FORCED_HAND);

    expect(result.log.damageToEnemy).toBe(dealtDamage(value, ctx.enemy.resistance.paper, s.stare));
    // 節4の具体例3そのもの。耐性適用後の値がずれていないことも直接確かめる
    expect(result.log.damageToEnemy).toBe(2);
  });
});
