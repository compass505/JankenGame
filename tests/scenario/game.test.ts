import { describe, expect, it } from 'vitest';
import {
  chooseUpgrade,
  createGame,
  playHand,
  startGame,
} from '@/application/game';
import type { GameState } from '@/application/game';
import { STARE_MAX } from '@/domain/battle';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import { canUpgrade } from '@/domain/handTable';
import { STAGES } from '@/data/stages';
import { createRng } from '@/lib/rng';

/**
 * application/game.ts を通して domain を回す、UI を含まない結合テスト。
 * `docs/04_test-plan.md` の方針どおり3本まで。決着時の状態だけを見る。
 *
 * ターン上限（1試合あたり）。無限ループ化するバグをここで検出する。
 * 5戦分の最大ターン数を大きめに見積もった値。
 */
const MAX_STEPS = 1000;

/** プレイヤーの手を決める単純な巡回戦略。最適な戦略である必要はなく、
 * 「進行して必ず決着する」ことだけを検証できればよい。 */
function pickHand(i: number): Hand {
  const hand = HANDS[i % HANDS.length];
  if (hand === undefined) throw new Error('unreachable: HANDS is not empty');
  return hand;
}

/** 強化選択の手を決める。上限に達している手は飛ばして巡回する。
 * docs/03 の不変条件「選べる手が0になることはない」を前提にしている
 * （もし詰むなら、それ自体がこのテストで検出したいバグ）。 */
function pickUpgradeHand(state: GameState, i: number): Hand {
  for (let offset = 0; offset < HANDS.length; offset += 1) {
    const hand = HANDS[(i + offset) % HANDS.length];
    if (hand !== undefined && canUpgrade(state.upgrades, hand)) {
      return hand;
    }
  }
  throw new Error('強化できる手がありません（詰み）。docs/03 の不変条件違反');
}

/**
 * 1周プレイし切る。phase が 'result' になるまで、または MAX_STEPS に達するまで進める。
 * 上限に達したら例外を投げてテストを失敗させる（無限ループの検出）。
 */
function playToEnd(seed: number): GameState {
  let state = startGame(createGame());
  const rng = createRng(seed);

  for (let i = 0; i < MAX_STEPS && state.phase !== 'result'; i += 1) {
    if (state.phase === 'battle') {
      state = playHand(state, pickHand(i), rng);
    } else if (state.phase === 'upgrade') {
      state = chooseUpgrade(state, pickUpgradeHand(state, i));
    } else {
      // title や想定外の phase で止まった場合はここで打ち切り、下の検証で失敗させる
      break;
    }
  }

  if (state.phase !== 'result') {
    throw new Error(`ターン上限 ${MAX_STEPS} に達しても決着しなかった（seed=${seed}）`);
  }

  return state;
}

/** 候補シードを順に試し、条件に合う最初の結果を返す。見つからなければ null。
 *
 * 勝ち負けはシードと `src/data/` のバランスに依存するため、シードを決め打たない。
 * 見つからなかった場合は「実装のバグ」ではなく「バランスが偏りすぎている」ことを
 * 示す（下の失敗メッセージで切り分けられるようにしてある）。
 * 見つかった時点で打ち切る（全シードを走らせない）。 */
function findResult(
  seeds: readonly number[],
  match: (state: GameState) => boolean,
): GameState | null {
  for (const seed of seeds) {
    const result = playToEnd(seed);
    if (match(result)) return result;
  }
  return null;
}

const CANDIDATE_SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('シナリオ1: プレイヤーが勝つまでの1試合', () => {
  it('決着したとき phase が result で cleared === true、勝者のHPが1以上', () => {
    const winning = findResult(CANDIDATE_SEEDS, (r) => r.cleared);

    // 決着自体は playToEnd が保証している（上限に達したら例外）。
    // ここで null になるのは「300シードすべてで負けた」＝バランスの問題。
    expect(
      winning,
      `${CANDIDATE_SEEDS.length}シードすべてで勝てなかった。` +
        '実装のバグではなくバランスの偏りの可能性が高い（src/data/enemies.ts）',
    ).not.toBeNull();
    if (winning === null) return;

    expect(winning.phase).toBe('result');
    expect(winning.cleared).toBe(true);
    expect(winning.stageIndex).toBe(STAGES.length - 1);
    expect(winning.battle).not.toBeNull();
    if (winning.battle === null) return;
    expect(winning.battle.outcome).toBe('playerWin');
    expect(winning.battle.playerHp).toBeGreaterThanOrEqual(1);
    expect(winning.battle.playerHp).toBeLessThanOrEqual(winning.battle.playerMaxHp);
  });
});

describe('シナリオ2: プレイヤーが負ける1試合', () => {
  it('決着したとき cleared === false、HPが負にならず playerHp === 0 になる', () => {
    const losing = findResult(CANDIDATE_SEEDS, (r) => !r.cleared);

    // null になるのは「300シードすべてで勝ってしまった」＝バランスの問題。
    expect(
      losing,
      `${CANDIDATE_SEEDS.length}シードすべてで負けなかった。` +
        '実装のバグではなくバランスが易しすぎる可能性が高い（src/data/enemies.ts）',
    ).not.toBeNull();
    if (losing === null) return;

    expect(losing.phase).toBe('result');
    expect(losing.cleared).toBe(false);
    expect(losing.battle).not.toBeNull();
    if (losing.battle === null) return;
    expect(losing.battle.outcome).toBe('playerLose');
    expect(losing.battle.playerHp).toBe(0);
    expect(losing.battle.enemyHp).toBeGreaterThanOrEqual(0);
  });
});

describe('シナリオ3: あいこが連続しても進行する', () => {
  it('ターン上限に達する前に必ず決着し、にらみが上限を超えない', () => {
    // シナリオ1/2 と範囲を分けただけで、意味のある値ではない
    const seeds = Array.from({ length: 30 }, (_, i) => i + 10000);

    for (const seed of seeds) {
      let state = startGame(createGame());
      const rng = createRng(seed);
      let steps = 0;

      for (; steps < MAX_STEPS && state.phase !== 'result'; steps += 1) {
        if (state.phase === 'battle') {
          expect(state.battle).not.toBeNull();
          if (state.battle !== null) {
            expect(state.battle.outcome).toBeNull();
            expect(state.battle.stare).toBeGreaterThanOrEqual(0);
            expect(state.battle.stare).toBeLessThanOrEqual(STARE_MAX);
          }
          state = playHand(state, pickHand(steps), rng);
        } else if (state.phase === 'upgrade') {
          state = chooseUpgrade(state, pickUpgradeHand(state, steps));
        } else {
          break;
        }
      }

      // 上限に達する前に必ず決着すること（無限ループの検出）
      expect(state.phase).toBe('result');
    }
  });
});
