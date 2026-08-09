import { describe, expect, it } from 'vitest';
import {
  chooseUpgrade,
  createGame,
  heatPenalties,
  playHand,
  playerHandTable,
  startGame,
} from '@/application/game';
import type { GameState } from '@/application/game';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import { HEAT_MAX_PENALTY, NO_HEAT, advanceHeat } from '@/domain/handTable';
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
