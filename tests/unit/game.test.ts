import { describe, expect, it } from 'vitest';
import {
  chooseUpgrade,
  createGame,
  damagePreview,
  enemyForecast,
  heatPenalties,
  playHand,
  playerHandTable,
  startGame,
} from '@/application/game';
import type { GameState } from '@/application/game';
import { enemyPhase } from '@/domain/enemy';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import { HEAT_MAX_PENALTY, NO_HEAT, advanceHeat, canUpgrade } from '@/domain/handTable';
import { STAGES } from '@/data/stages';
import { createRng } from '@/lib/rng';

/**
 * `application/game.ts` の「熱の配線」だけを対象にしたテスト。
 * `docs/03_detailed-design.md` 節5（`GameState` の形、各関数の表、
 * 「`ctx` の組み立て」「熱の更新」「不変条件」）が根拠。
 *
 * phase遷移・強化・クリア判定などの他の挙動は `tests/scenario/game.test.ts` が
 * 既に見ているので、ここでは重複して書かない。
 */

function pickHand(i: number): Hand {
  const hand = HANDS[i % HANDS.length];
  if (hand === undefined) throw new Error('unreachable: HANDS is not empty');
  return hand;
}

describe('startGame と熱の初期化', () => {
  it('startGame 直後は playerHeat と enemyHeat が両方 NO_HEAT になる', () => {
    const state = startGame(createGame());

    expect(state.playerHeat).toEqual(NO_HEAT);
    expect(state.enemyHeat).toEqual(NO_HEAT);
  });
});

describe('playHand と熱の更新', () => {
  it('playHand のあと、playerHeat/enemyHeat が advanceHeat の結果と一致する', () => {
    const before = startGame(createGame());
    const rng = createRng(1);
    const hand: Hand = 'rock';

    const after = playHand(before, hand, rng);

    expect(after.lastLog).not.toBeNull();
    if (after.lastLog === null) return;

    // 敵が出した手は rng の中身ではなく lastLog から取る（乱数の実装詳細に依存させない）
    expect(after.playerHeat).toEqual(advanceHeat(before.playerHeat, hand));
    expect(after.enemyHeat).toEqual(advanceHeat(before.enemyHeat, after.lastLog.enemyHand));
  });

  it('あいこのターンでも playerHeat と enemyHeat が進む（節5「あいこのターンも更新する」）', () => {
    const seeds = Array.from({ length: 100 }, (_, i) => i + 1);
    const MAX_TURNS_PER_SEED = 50;

    const draw = ((): { before: GameState; after: GameState; hand: Hand } | null => {
      for (const seed of seeds) {
        let state = startGame(createGame());
        const rng = createRng(seed);

        for (let i = 0; i < MAX_TURNS_PER_SEED && state.phase === 'battle'; i += 1) {
          const hand = pickHand(i);
          const before = state;
          const after = playHand(before, hand, rng);

          if (after.lastLog !== null && after.lastLog.outcome === 'draw') {
            return { before, after, hand };
          }
          state = after;
        }
      }
      return null;
    })();

    expect(
      draw,
      `${seeds.length}シード×最初の戦闘中にあいこが1回も見つからなかった。` +
        '実装のバグではなく乱数の巡り合わせの可能性が高い',
    ).not.toBeNull();
    if (draw === null) return;

    const { before, after, hand } = draw;
    expect(after.lastLog).not.toBeNull();
    if (after.lastLog === null) return;
    expect(after.lastLog.outcome).toBe('draw');

    expect(after.playerHeat).toEqual(advanceHeat(before.playerHeat, hand));
    expect(after.enemyHeat).toEqual(advanceHeat(before.enemyHeat, after.lastLog.enemyHand));
  });
});

describe('chooseUpgrade と熱のリセット', () => {
  it('chooseUpgrade 直後は playerHeat と enemyHeat が両方 NO_HEAT に戻る', () => {
    const seeds = Array.from({ length: 100 }, (_, i) => i + 1);
    const MAX_TURNS_PER_SEED = 50;

    const upgradeState = ((): GameState | null => {
      for (const seed of seeds) {
        let state = startGame(createGame());
        const rng = createRng(seed);

        for (let i = 0; i < MAX_TURNS_PER_SEED && state.phase === 'battle'; i += 1) {
          state = playHand(state, pickHand(i), rng);
        }

        if (state.phase === 'upgrade') return state;
      }
      return null;
    })();

    expect(
      upgradeState,
      `${seeds.length}シードすべてで upgrade 画面に到達しなかった。実装のバグの可能性が高い`,
    ).not.toBeNull();
    if (upgradeState === null) return;

    // リセットの検証として意味を持たせるため、直前の熱が0でないことを確認しておく
    // （戦闘中に手を出している以上、最後に出した手の熱は必ず HEAT_GAIN 分たまっている）
    expect(upgradeState.playerHeat).not.toEqual(NO_HEAT);

    // 上限に達している手は無いはず（1回目の強化なので upgrades は NO_UPGRADES）
    const after = chooseUpgrade(upgradeState, 'rock');

    expect(after.playerHeat).toEqual(NO_HEAT);
    expect(after.enemyHeat).toEqual(NO_HEAT);
  });
});

describe('heatPenalties', () => {
  it('戦闘開始直後は3手とも0', () => {
    const state = startGame(createGame());

    expect(heatPenalties(state)).toEqual({ rock: 0, scissors: 0, paper: 0 });
  });

  it('不変条件: どの局面でも各手の弱化量は 0 以上 HEAT_MAX_PENALTY 以下', () => {
    let state = startGame(createGame());
    const rng = createRng(3);

    for (let i = 0; i < 20 && state.phase === 'battle'; i += 1) {
      state = playHand(state, pickHand(i), rng);

      const penalties = heatPenalties(state);
      for (const hand of HANDS) {
        expect(penalties[hand]).toBeGreaterThanOrEqual(0);
        expect(penalties[hand]).toBeLessThanOrEqual(HEAT_MAX_PENALTY);
      }
    }
  });
});

describe('playerHandTable と熱', () => {
  it('rock を1回出すと、rock の damage が1下がる（heal と stareBonus は動かない）', () => {
    const before = startGame(createGame());
    const beforeTable = playerHandTable(before);

    const rng = createRng(5);
    const after = playHand(before, 'rock', rng);
    const afterTable = playerHandTable(after);

    // 熱4で弱化1段（floor(HEAT_GAIN / HEAT_GAIN) === 1）。src/data/ の数値には依存しない
    expect(afterTable.rock.damage).toBe(Math.max(1, beforeTable.rock.damage - 1));
    expect(afterTable.rock.heal).toBe(beforeTable.rock.heal);
    expect(afterTable.rock.stareBonus).toBe(beforeTable.rock.stareBonus);
  });

  it('出していない手（scissors・paper）は playerHandTable が変化しない', () => {
    const before = startGame(createGame());
    const beforeTable = playerHandTable(before);

    const rng = createRng(5);
    const after = playHand(before, 'rock', rng);
    const afterTable = playerHandTable(after);

    expect(afterTable.scissors).toEqual(beforeTable.scissors);
    expect(afterTable.paper).toEqual(beforeTable.paper);
  });
});

// ── damagePreview / enemyForecast（docs/03 節5） ────────────────────
//
// 「耐性0.5の敵に対してボタンが『6ダメージ』と表示して実際は3しか入らない」というずれ
// （節4「`dealtDamage` だけを関数に切り出す理由」）を二度と作らないためのテスト。
// `damagePreview` と `enemyForecast` は、画面に出す値と実際の `TurnLog` の値が
// 一致することを検証する。数値そのものではなく「表示値と実値が一致する」という
// 関係を見るので、`src/data/` の数値が `/balance` で動いても壊れない。

/** 強化選択の手を決める。上限に達している手は飛ばして巡回する。
 * tests/scenario/game.test.ts と同じ書き方（docs/03 節5 の不変条件
 * 「選べる手が0になることはない」が前提）。 */
function pickUpgradeHand(state: GameState, i: number): Hand {
  for (let offset = 0; offset < HANDS.length; offset += 1) {
    const hand = HANDS[(i + offset) % HANDS.length];
    if (hand !== undefined && canUpgrade(state.upgrades, hand)) {
      return hand;
    }
  }
  throw new Error('強化できる手がありません(詰み)。docs/03 の不変条件違反');
}

interface TurnRecord {
  readonly before: GameState;
  readonly hand: Hand;
  readonly after: GameState;
}

/**
 * 1試合をシミュレートし、戦闘中の各ターンの記録を返す。
 * `chooseHand` でそのターンに出す手を決める（stageIndex を見て手を強制することもできる）。
 * ターン上限に達したら打ち切る（無限ループの検出は tests/scenario/ の役目なので、
 * ここでは例外にせず単に記録を打ち切って返す）。
 */
function simulate(seed: number, chooseHand: (state: GameState, i: number) => Hand): TurnRecord[] {
  const MAX_STEPS = 1000;
  let state = startGame(createGame());
  const rng = createRng(seed);
  const records: TurnRecord[] = [];

  for (let i = 0; i < MAX_STEPS && state.phase !== 'result'; i += 1) {
    if (state.phase === 'battle') {
      const hand = chooseHand(state, i);
      const before = state;
      const after = playHand(before, hand, rng);
      records.push({ before, hand, after });
      state = after;
    } else if (state.phase === 'upgrade') {
      state = chooseUpgrade(state, pickUpgradeHand(state, i));
    } else {
      break;
    }
  }

  return records;
}

describe('damagePreview', () => {
  it('戦闘中でなければ 0', () => {
    const state = createGame();

    for (const hand of HANDS) {
      expect(damagePreview(state, hand)).toBe(0);
    }
  });

  it('playHand で実際に勝ったターンの damageToEnemy と一致する', () => {
    const seeds = Array.from({ length: 50 }, (_, i) => i + 1);

    const found = ((): TurnRecord | null => {
      for (const seed of seeds) {
        const records = simulate(seed, (_state, i) => pickHand(i));
        const win = records.find((r) => r.after.lastLog !== null && r.after.lastLog.outcome === 'win');
        if (win !== undefined) return win;
      }
      return null;
    })();

    expect(
      found,
      `${seeds.length}シードで一度も勝ちが見つからなかった。実装のバグではなく乱数の巡り合わせの可能性が高い`,
    ).not.toBeNull();
    if (found === null) return;

    expect(found.after.lastLog).not.toBeNull();
    if (found.after.lastLog === null) return;

    expect(damagePreview(found.before, found.hand)).toBe(found.after.lastLog.damageToEnemy);
  });

  it('耐性を持つ敵（チョキ耐性）にチョキで勝ったターンでも damageToEnemy と一致する', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    // 耐性を持つ敵は STAGES から引く。添字を決め打つと /balance で耐性の配置を
    // 変えたときに壊れる（docs/04「src/data/ の数値を検証しない」と同じ理由）
    const RESISTANT_STAGE_INDEXES = STAGES.flatMap((enemy, i) =>
      enemy.resistance.scissors !== 1 ? [i] : [],
    );

    expect(
      RESISTANT_STAGE_INDEXES.length,
      'チョキに耐性を持つ敵が1体もいない。src/data/enemies.ts を確認すること',
    ).toBeGreaterThan(0);

    const found = ((): TurnRecord | null => {
      for (const seed of seeds) {
        const records = simulate(seed, (state, i) =>
          RESISTANT_STAGE_INDEXES.includes(state.stageIndex) ? 'scissors' : pickHand(i),
        );
        const win = records.find(
          (r) =>
            RESISTANT_STAGE_INDEXES.includes(r.before.stageIndex) &&
            r.hand === 'scissors' &&
            r.after.lastLog !== null &&
            r.after.lastLog.outcome === 'win',
        );
        if (win !== undefined) return win;
      }
      return null;
    })();

    expect(
      found,
      `${seeds.length}シードでチョキ耐性の敵にチョキで勝つターンが見つからなかった。` +
        '実装のバグではなく乱数の巡り合わせの可能性が高い',
    ).not.toBeNull();
    if (found === null) return;

    expect(found.after.lastLog).not.toBeNull();
    if (found.after.lastLog === null) return;

    expect(damagePreview(found.before, found.hand)).toBe(found.after.lastLog.damageToEnemy);
  });
});

describe('enemyForecast', () => {
  it('戦闘中でなければ null', () => {
    const state = createGame();

    expect(enemyForecast(state)).toBeNull();
  });

  it('3手の確率の和は1、各手は0.1以上（節3の不変条件）', () => {
    const seeds = [1, 2, 3, 4, 5];

    for (const seed of seeds) {
      let state = startGame(createGame());
      const rng = createRng(seed);

      for (let i = 0; i < 20 && state.phase === 'battle'; i += 1) {
        const forecast = enemyForecast(state);
        expect(forecast).not.toBeNull();

        if (forecast !== null) {
          const sum = forecast.probability.rock + forecast.probability.scissors + forecast.probability.paper;
          expect(sum).toBeCloseTo(1, 10);
          for (const hand of HANDS) {
            expect(forecast.probability[hand]).toBeGreaterThanOrEqual(0.1 - 1e-9);
          }
        }

        state = playHand(state, pickHand(i), rng);
      }
    }
  });

  it('phase は enemyPhase(敵HP, 敵最大HP) と一致する', () => {
    let state = startGame(createGame());
    const rng = createRng(7);

    for (let i = 0; i < 30 && state.phase === 'battle'; i += 1) {
      const forecast = enemyForecast(state);
      expect(forecast).not.toBeNull();
      expect(state.battle).not.toBeNull();

      if (forecast !== null && state.battle !== null) {
        expect(forecast.phase).toBe(enemyPhase(state.battle.enemyHp, state.battle.enemyMaxHp));
      }

      state = playHand(state, pickHand(i), rng);
    }
  });

  it('damage[敵の手] は、敵がその手で勝ったときの damageToPlayer と一致する', () => {
    const seeds = Array.from({ length: 100 }, (_, i) => i + 1);
    const MAX_TURNS_PER_SEED = 50;

    const found = ((): { before: GameState; after: GameState } | null => {
      for (const seed of seeds) {
        let state = startGame(createGame());
        const rng = createRng(seed);

        for (let i = 0; i < MAX_TURNS_PER_SEED && state.phase === 'battle'; i += 1) {
          const before = state;
          const after = playHand(before, pickHand(i), rng);

          if (after.lastLog !== null && after.lastLog.outcome === 'lose') {
            return { before, after };
          }
          state = after;
        }
      }
      return null;
    })();

    expect(
      found,
      `${seeds.length}シードで敵が勝つターンが見つからなかった。実装のバグではなく乱数の巡り合わせの可能性が高い`,
    ).not.toBeNull();
    if (found === null) return;

    const { before, after } = found;
    expect(after.lastLog).not.toBeNull();
    if (after.lastLog === null) return;

    const forecast = enemyForecast(before);
    expect(forecast).not.toBeNull();
    if (forecast === null) return;

    expect(forecast.damage[after.lastLog.enemyHand]).toBe(after.lastLog.damageToPlayer);
  });
});
