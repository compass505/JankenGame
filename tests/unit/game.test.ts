import { describe, expect, it } from 'vitest';
import {
  chooseUpgrade,
  createGame,
  currentEnemy,
  damagePreview,
  enemyForecast,
  handOutlook,
  heatPenalties,
  playHand,
  playerHandTable,
  startGame,
  upgradePreview,
} from '@/application/game';
import type { GameState } from '@/application/game';
import { enemyPhase } from '@/domain/enemy';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import {
  NO_HEAT,
  UPGRADE_MAX_PER_HAND,
  advanceHeat,
  applyHeat,
  applyUpgrade,
  buildHandTableWith,
  canUpgrade,
  heatPenalty,
} from '@/domain/handTable';
import type { HeatCounts } from '@/domain/handTable';
import { HEAT_RULE } from '@/data/heat';
import { UPGRADE_TARGETS } from '@/data/hands';
import { STAGES } from '@/data/stages';
import { createRng } from '@/lib/rng';

/**
 * `application/game.ts` の「配線」だけを対象にしたテスト。
 * `docs/03_detailed-design.md` 節5（`GameState` の形、各関数の表、
 * 「`ctx` の組み立て」「敵の手の表」「履歴の更新」「不変条件」）が根拠。
 *
 * `docs/adr/0003-repetition-window.md` で連打の罰が「熱（Record<Hand,number>）」から
 * 「直近の履歴（readonly Hand[]）」に変わったので、それに合わせて全面改訂した。
 *
 * phase遷移・強化の進行・クリア判定などは `tests/scenario/game.test.ts` が
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
    expect(after.playerHeat).toEqual(advanceHeat(before.playerHeat, hand, HEAT_RULE));
    expect(after.enemyHeat).toEqual(advanceHeat(before.enemyHeat, after.lastLog.enemyHand, HEAT_RULE));
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

    expect(after.playerHeat).toEqual(advanceHeat(before.playerHeat, hand, HEAT_RULE));
    expect(after.enemyHeat).toEqual(advanceHeat(before.enemyHeat, after.lastLog.enemyHand, HEAT_RULE));
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

    // リセットの検証として意味を持たせるため、直前の履歴が空でないことを確認しておく
    // （戦闘中に手を出している以上、履歴には少なくとも1手残っているはず）
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

  it('heatPenalties(state)[hand] は heatPenalty(state.playerHeat, hand, HEAT_RULE) と一致する', () => {
    let state = startGame(createGame());
    const rng = createRng(3);

    for (let i = 0; i < 20 && state.phase === 'battle'; i += 1) {
      state = playHand(state, pickHand(i), rng);

      const penalties = heatPenalties(state);
      for (const hand of HANDS) {
        expect(penalties[hand]).toBe(heatPenalty(state.playerHeat, hand, HEAT_RULE));
      }
    }
  });

  it('不変条件: どの局面でも各手の弱化量は 0 以上 rule.maxPenalty 以下', () => {
    let state = startGame(createGame());
    const rng = createRng(3);

    for (let i = 0; i < 20 && state.phase === 'battle'; i += 1) {
      state = playHand(state, pickHand(i), rng);

      const penalties = heatPenalties(state);
      for (const hand of HANDS) {
        expect(penalties[hand]).toBeGreaterThanOrEqual(0);
        expect(penalties[hand]).toBeLessThanOrEqual(HEAT_RULE.maxPenalty);
      }
    }
  });
});

describe('playerHandTable と熱', () => {
  it('連打の履歴があると damage が下がる（heal と stareBonus は動かない）', () => {
    // rng を介さず、履歴だけを直接組み立てた決定的なテスト。
    // window-1 個ぶん同じ手で埋めれば、rule によらず必ず allowed を超える。
    const base = startGame(createGame());
    const zeroTable = playerHandTable(base);

    const heavyHistory: HeatCounts = new Array(HEAT_RULE.window - 1).fill('rock') as Hand[];
    const state: GameState = { ...base, playerHeat: heavyHistory };

    const table = playerHandTable(state);

    expect(table.rock.damage).toBeLessThan(zeroTable.rock.damage);
    expect(table.rock.heal).toBe(zeroTable.rock.heal);
    expect(table.rock.stareBonus).toBe(zeroTable.rock.stareBonus);
    // 出していない手は変化しない
    expect(table.scissors).toEqual(zeroTable.scissors);
    expect(table.paper).toEqual(zeroTable.paper);
  });

  it('playerHandTable は buildHandTableWith → applyHeat の合成と一致する（節5「ctx の組み立て」）', () => {
    // startGame 直後（upgrades=NO_UPGRADES, heat=NO_HEAT）の playerHandTable が
    // 「素の BASE_HANDS」に等しいことを利用し、src/data/hands.ts の値を直接 import しない。
    const zero = startGame(createGame());
    const baseTable = playerHandTable(zero);

    const upgrades = applyUpgrade(applyUpgrade(zero.upgrades, 'scissors'), 'paper');
    const history: HeatCounts = ['rock', 'rock', 'paper'];
    const state: GameState = { ...zero, upgrades, playerHeat: history };

    const expected = applyHeat(buildHandTableWith(baseTable, upgrades, UPGRADE_TARGETS), history, HEAT_RULE);

    expect(playerHandTable(state)).toEqual(expected);
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

// ── 本気モードの敵ダメージ強化（docs/adr/0003-repetition-window.md 決定4） ────────
//
// 敵HPが半分以下（desperate）になると、敵の全手の damage に desperateBonus が足される。
// `ctx.enemyHands` と `enemyForecast` の両方が同じ「敵の手の表」を通ることを縛る
// （節5「敵の手の表（enemyHandTable）」。片方だけ本気の強化を掛けると
// 「負けたら -N」の表示が実ダメージと食い違う）。

describe('敵の本気モード強化（desperate）', () => {
  it('enemyForecast: desperate 局面は normal 局面より、全手の damage が desperateBonus だけ大きい', () => {
    const started = startGame(createGame());
    expect(started.battle).not.toBeNull();
    if (started.battle === null) return;

    const enemy = currentEnemy(started);
    expect(enemy).not.toBeNull();
    if (enemy === null) return;

    // enemyHeat は両方とも NO_HEAT のまま、敵HPだけを操作して2つの局面を作る。
    // desperateBonus 以外の条件（履歴・強化）を揃えることで、差分がちょうど
    // desperateBonus になることを検証できる。
    const normalState: GameState = {
      ...started,
      battle: { ...started.battle, enemyHp: started.battle.enemyMaxHp },
    };
    const desperateState: GameState = {
      ...started,
      battle: { ...started.battle, enemyHp: Math.floor(started.battle.enemyMaxHp / 2) },
    };

    const normalForecast = enemyForecast(normalState);
    const desperateForecast = enemyForecast(desperateState);

    expect(normalForecast).not.toBeNull();
    expect(desperateForecast).not.toBeNull();
    if (normalForecast === null || desperateForecast === null) return;

    expect(normalForecast.phase).toBe('normal');
    expect(desperateForecast.phase).toBe('desperate');

    for (const hand of HANDS) {
      expect(desperateForecast.damage[hand]).toBe(normalForecast.damage[hand] + enemy.desperateBonus);
    }
  });

  it('desperate 局面で負けたターンの damageToPlayer が、その直前の enemyForecast の damage と一致する', () => {
    const seeds = Array.from({ length: 300 }, (_, i) => i + 1);
    const MAX_TURNS_PER_SEED = 60;

    const found = ((): { before: GameState; after: GameState } | null => {
      for (const seed of seeds) {
        let state = startGame(createGame());
        const rng = createRng(seed);

        for (let i = 0; i < MAX_TURNS_PER_SEED && state.phase === 'battle'; i += 1) {
          const before = state;
          const forecastBefore = enemyForecast(before);
          const after = playHand(before, pickHand(i), rng);

          if (
            forecastBefore !== null &&
            forecastBefore.phase === 'desperate' &&
            after.lastLog !== null &&
            after.lastLog.outcome === 'lose'
          ) {
            return { before, after };
          }
          state = after;
        }
      }
      return null;
    })();

    expect(
      found,
      `${seeds.length}シードで desperate 局面かつ負けたターンが見つからなかった。` +
        '実装のバグではなく乱数の巡り合わせの可能性が高い',
    ).not.toBeNull();
    if (found === null) return;

    const { before, after } = found;
    expect(after.lastLog).not.toBeNull();
    if (after.lastLog === null) return;

    const forecast = enemyForecast(before);
    expect(forecast).not.toBeNull();
    if (forecast === null) return;
    expect(forecast.phase).toBe('desperate');

    expect(forecast.damage[after.lastLog.enemyHand]).toBe(after.lastLog.damageToPlayer);
  });
});

// ── upgradePreview（docs/03 節2・節5・節7） ──────────────────────────────
//
// 強化の行き先が手ごとに変わった（ADR 0003）。「next.damage が必ず current.damage+1」は
// もう成り立たない。UPGRADE_TARGETS[hand] が指す側だけが+1になる、という「関係」を見る。
// 「グーは stareBonus」とはテストに直書きしない（UPGRADE_TARGETS を data から import する）。

describe('upgradePreview', () => {
  it('next は UPGRADE_TARGETS[hand] が指す側だけ current より1大きい（もう片方と heal は動かない）', () => {
    const state = startGame(createGame());

    for (const hand of HANDS) {
      const { current, next } = upgradePreview(state, hand);
      const target = UPGRADE_TARGETS[hand];

      if (target === 'damage') {
        expect(next.damage).toBe(current.damage + 1);
        expect(next.stareBonus).toBe(current.stareBonus);
      } else {
        expect(next.stareBonus).toBe(current.stareBonus + 1);
        expect(next.damage).toBe(current.damage);
      }
      expect(next.heal).toBe(current.heal);
    }
  });

  it('上限に達している手は current と next が同じ値', () => {
    let state = startGame(createGame());
    // 強化画面まで進めずに upgrades だけを上限まで積む（表示用の関数なので phase を問わない）
    let counts = state.upgrades;
    for (let i = 0; i < UPGRADE_MAX_PER_HAND; i += 1) {
      counts = applyUpgrade(counts, 'rock');
    }
    state = { ...state, upgrades: counts };

    expect(canUpgrade(state.upgrades, 'rock')).toBe(false);

    const { current, next } = upgradePreview(state, 'rock');
    expect(next).toEqual(current);
  });

  it('強化を選んだあと、次の戦闘の current が前の next と一致する', () => {
    const seeds = Array.from({ length: 100 }, (_, i) => i + 1);

    const upgradeState = ((): GameState | null => {
      for (const seed of seeds) {
        let state = startGame(createGame());
        const rng = createRng(seed);
        for (let i = 0; i < 100 && state.phase === 'battle'; i += 1) {
          state = playHand(state, pickHand(i), rng);
        }
        if (state.phase === 'upgrade') return state;
      }
      return null;
    })();

    expect(
      upgradeState,
      `${seeds.length}シードすべてで強化画面に到達しなかった。実装のバグの可能性が高い`,
    ).not.toBeNull();
    if (upgradeState === null) return;

    const promised = upgradePreview(upgradeState, 'rock').next;
    const afterChoice = chooseUpgrade(upgradeState, 'rock');

    // 次の戦闘の頭は熱が NO_HEAT なので、強化ぶんだけが乗った値になるはず
    expect(upgradePreview(afterChoice, 'rock').current).toEqual(promised);
  });

  it('熱（連打の履歴）を含めない（同じ手を連打した直後でも current が下がらない）', () => {
    const before = startGame(createGame());
    const beforePreview = upgradePreview(before, 'rock');

    const rng = createRng(9);
    const after = playHand(before, 'rock', rng);

    expect(after.playerHeat.length).toBeGreaterThan(0);
    expect(upgradePreview(after, 'rock')).toEqual(beforePreview);
  });
});

// ── handOutlook（docs/03 節5。ADR 0003 決定1の heatCost） ────────────────

describe('handOutlook', () => {
  it('戦闘中でなければ null', () => {
    const state = createGame();

    for (const hand of HANDS) {
      expect(handOutlook(state, hand)).toBeNull();
    }
  });

  it('onWin は damagePreview と同じ値', () => {
    const state = startGame(createGame());

    for (const hand of HANDS) {
      const outlook = handOutlook(state, hand);
      expect(outlook).not.toBeNull();
      if (outlook === null) continue;

      expect(outlook.onWin).toBe(damagePreview(state, hand));
    }
  });

  it('heatCost は 0 以上', () => {
    const state = startGame(createGame());

    for (const hand of HANDS) {
      const outlook = handOutlook(state, hand);
      expect(outlook).not.toBeNull();
      if (outlook === null) continue;

      expect(outlook.heatCost).toBeGreaterThanOrEqual(0);
    }
  });

  it('heatCost は、この手を使った直後の playerHandTable の damage 低下量と一致する（戦闘が続く場合）', () => {
    // **同じ手を出し続ける。** 3手を巡回させると窓の中の回数が allowed を超えないので
    // heatCost が常に 0 になり、「0 と 0 を比べるだけ」のテストになってしまう。
    // 連打してはじめて heatCost > 0 の局面が出る（ADR 0003 決定1）。
    const seeds = Array.from({ length: 100 }, (_, i) => i + 1);
    const MAX_TURNS_PER_SEED = 50;
    const HAND: Hand = 'rock';

    const records = ((): { before: GameState; after: GameState }[] => {
      for (const seed of seeds) {
        let state = startGame(createGame());
        const rng = createRng(seed);
        const turns: { before: GameState; after: GameState }[] = [];

        for (let i = 0; i < MAX_TURNS_PER_SEED && state.phase === 'battle'; i += 1) {
          const before = state;
          const after = playHand(before, HAND, rng);
          if (after.phase !== 'battle') break;
          turns.push({ before, after });
          state = after;
        }

        // 弱化が乗るところまで連打できたシードを採用する
        if (turns.some(({ before }) => handOutlook(before, HAND) !== null)) {
          const withCost = turns.filter(
            ({ before }) => (handOutlook(before, HAND)?.heatCost ?? 0) > 0,
          );
          if (withCost.length > 0) return turns;
        }
      }
      return [];
    })();

    expect(
      records.length,
      `${seeds.length}シードで heatCost > 0 になる連打の局面が見つからなかった。` +
        '実装のバグか、HEAT_RULE の allowed が窓に対して大きすぎる可能性がある',
    ).toBeGreaterThan(0);

    let sawNonZero = false;

    for (const { before, after } of records) {
      const outlook = handOutlook(before, HAND);
      expect(outlook).not.toBeNull();
      if (outlook === null) continue;

      const beforeDamage = playerHandTable(before)[HAND].damage;
      const afterDamage = playerHandTable(after)[HAND].damage;

      expect(outlook.heatCost).toBe(beforeDamage - afterDamage);
      if (outlook.heatCost > 0) sawNonZero = true;
    }

    // 全ターン 0 のまま通ってしまうと、この関係を何も縛っていないのと同じ
    expect(sawNonZero, 'heatCost が一度も 0 より大きくならなかった').toBe(true);
  });
});
