import { describe, expect, it } from 'vitest';
import {
  chooseUpgrade,
  createGame,
  currentEnemy,
  enemyForecast,
  enemyHandTable,
  playHand,
  playerHandTable,
  startGame,
} from '@/application/game';
import type { GameState } from '@/application/game';
import { dealtDamage } from '@/domain/battle';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import { canUpgrade } from '@/domain/handTable';
import type { HeatCounts } from '@/domain/handTable';
import { HEAT_RULE } from '@/data/heat';
import { STAGES } from '@/data/stages';
import { createRng } from '@/lib/rng';

/**
 * `docs/adr/0004-enemy-hand-table.md` と `docs/03_detailed-design.md` 節5
 * （`enemyHandTable(state)`・「敵の手の表」「関数を2つに分ける」）が対象。
 *
 * 組み立ての本体（`enemy.hands ?? base` の分岐）は `domain/enemy.ts` の
 * `buildEnemyHandTable` に移された（節3）。そちらは `tests/unit/buildEnemyHandTable.test.ts` で
 * 任意の `EnemyDef` を直接渡して検証する（`src/data/` に依存しない）。
 *
 * ここで見るのは `application` 側の「委譲」と「表示用の窓口」としての配線だけ。
 * - 戦闘中は `buildEnemyHandTable` が返す値をそのまま返すこと（`ctx.enemyHands` と
 *   `enemyForecast` の両方が同じ値を通ること）
 * - `null` を返す条件が節5で確定した式
 *   （`state.phase !== 'battle' || state.battle === null || currentEnemy(state) === null`）
 *   のとおりであること。**`upgrade` / `result` では `battle` が残っていても `null`。**
 */

function pickHand(i: number): Hand {
  const hand = HANDS[i % HANDS.length];
  if (hand === undefined) throw new Error('unreachable: HANDS is not empty');
  return hand;
}

/** 強化選択の手を決める。上限に達している手は飛ばして巡回する（tests/scenario と同じ書き方）。 */
function pickUpgradeHand(state: GameState, i: number): Hand {
  for (let offset = 0; offset < HANDS.length; offset += 1) {
    const hand = HANDS[(i + offset) % HANDS.length];
    if (hand !== undefined && canUpgrade(state.upgrades, hand)) {
      return hand;
    }
  }
  throw new Error('強化できる手がありません(詰み)。docs/03の不変条件違反');
}

describe('enemyHandTable: null になる条件（docs/03 節5で確定した式）', () => {
  it('タイトル画面（phase !== battle かつ battle === null）では null', () => {
    const state = createGame();

    expect(enemyHandTable(state)).toBeNull();
  });

  it('戦闘中（phase === battle）は null にならない', () => {
    const state = startGame(createGame());

    expect(state.phase).toBe('battle');
    expect(enemyHandTable(state)).not.toBeNull();
  });

  it('phase が battle でも、stageIndex が範囲外で currentEnemy が null なら null（不正な状態への防御）', () => {
    // GameState は判別可能ユニオンではないので、型のうえでは
    // 「phase === 'battle' なのに currentEnemy が引けない」組み合わせも作れる
    // （節5「GameState は判別可能ユニオンではない」）。式の3つ目の条件を直接踏む。
    const started = startGame(createGame());
    const invalid: GameState = { ...started, stageIndex: STAGES.length };

    expect(started.phase).toBe('battle');
    expect(currentEnemy(invalid)).toBeNull();
    expect(enemyHandTable(invalid)).toBeNull();
  });

  it('phase が upgrade のときは battle が残っていても null', () => {
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

    // battle 自体は最後の状態を保持している（節5の不変条件）ことを確認したうえで、
    // enemyHandTable は null になることを見る
    expect(upgradeState.battle).not.toBeNull();
    expect(enemyHandTable(upgradeState)).toBeNull();
  });

  it('phase が result（クリア）のときは battle が残っていても null', () => {
    const seeds = Array.from({ length: 300 }, (_, i) => i + 1);
    const MAX_STEPS = 1000;

    const clearedState = ((): GameState | null => {
      for (const seed of seeds) {
        let state = startGame(createGame());
        const rng = createRng(seed);

        for (let i = 0; i < MAX_STEPS && state.phase !== 'result'; i += 1) {
          if (state.phase === 'battle') {
            state = playHand(state, pickHand(i), rng);
          } else if (state.phase === 'upgrade') {
            state = chooseUpgrade(state, pickUpgradeHand(state, i));
          } else {
            break;
          }
        }

        if (state.phase === 'result' && state.cleared) return state;
      }
      return null;
    })();

    expect(
      clearedState,
      `${seeds.length}シードすべてでクリアできなかった。実装のバグではなくバランスの偏りの可能性が高い`,
    ).not.toBeNull();
    if (clearedState === null) return;

    expect(clearedState.battle).not.toBeNull();
    expect(enemyHandTable(clearedState)).toBeNull();
  });

  it('phase が result（敗北）のときも battle が残っていても null', () => {
    const seeds = Array.from({ length: 300 }, (_, i) => i + 1);
    const MAX_STEPS = 1000;

    const lostState = ((): GameState | null => {
      for (const seed of seeds) {
        let state = startGame(createGame());
        const rng = createRng(seed);

        for (let i = 0; i < MAX_STEPS && state.phase !== 'result'; i += 1) {
          if (state.phase === 'battle') {
            state = playHand(state, pickHand(i), rng);
          } else if (state.phase === 'upgrade') {
            state = chooseUpgrade(state, pickUpgradeHand(state, i));
          } else {
            break;
          }
        }

        if (state.phase === 'result' && !state.cleared) return state;
      }
      return null;
    })();

    expect(
      lostState,
      `${seeds.length}シードすべてで負けなかった。実装のバグではなくバランスが易しすぎる可能性が高い`,
    ).not.toBeNull();
    if (lostState === null) return;

    expect(lostState.battle).not.toBeNull();
    expect(enemyHandTable(lostState)).toBeNull();
  });
});

describe('enemyHandTable: 戦闘中の値の契約', () => {
  it('3手すべてを持ち、damage は1以上の整数、heal と stareBonus は0以上の整数', () => {
    const state = startGame(createGame());
    const table = enemyHandTable(state);

    expect(table).not.toBeNull();
    if (table === null) return;

    for (const hand of HANDS) {
      const v = table[hand];
      expect(Number.isInteger(v.damage)).toBe(true);
      expect(v.damage).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(v.heal)).toBe(true);
      expect(v.heal).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(v.stareBonus)).toBe(true);
      expect(v.stareBonus).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('enemyHandTable: hands を省略した敵のフォールバック（ADR 0004「省略すると BASE_HANDS」）', () => {
  it('戦闘開始直後（熱なし・通常フェーズ）は playerHandTable の初期値（＝素の BASE_HANDS）と一致する', () => {
    // playerHandTable(startGame(createGame())) は upgrades=NO_UPGRADES / playerHeat=NO_HEAT の
    // ときの素の BASE_HANDS に等しい（tests/unit/game.test.ts と同じ理由で、
    // src/data/hands.ts の値を直接 import せずに「素の値」を手に入れている）。
    // enemy.hands を省略した敵は BASE_HANDS（プレイヤーと同じ値）を使う設計なので、
    // 熱なし・通常フェーズの戦闘開始直後は両者が一致するはず。
    //
    // 「enemy.hands を持つ敵ではその値表が実際に使われること」（?? の本体側）は
    // src/data/ に依存せず tests/unit/buildEnemyHandTable.test.ts で直接検証している。
    const state = startGame(createGame());
    const enemy = currentEnemy(state);

    expect(enemy).not.toBeNull();
    if (enemy === null) return;

    // hands を持つ敵が現れた場合はこの等値関係はそもそも成り立たない前提が崩れる。
    // /balance が意図的に敵へ値表を足す変更なので、そのケースはこのテストの対象外にする。
    if (enemy.hands !== undefined) return;

    const base = playerHandTable(state);
    const table = enemyHandTable(state);

    expect(table).not.toBeNull();
    if (table === null) return;

    expect(table).toEqual(base);
  });
});

describe('enemyHandTable: 連打の弱化（enemyHeat）', () => {
  it('enemyHeat に連打の履歴があると damage が下がる（heal・stareBonus は動かない）', () => {
    const base = startGame(createGame());
    const zeroTable = enemyHandTable(base);

    expect(zeroTable).not.toBeNull();
    if (zeroTable === null) return;

    const heavyHistory: HeatCounts = new Array(HEAT_RULE.window - 1).fill('rock') as Hand[];
    const state: GameState = { ...base, enemyHeat: heavyHistory };

    const table = enemyHandTable(state);

    expect(table).not.toBeNull();
    if (table === null) return;

    expect(table.rock.damage).toBeLessThan(zeroTable.rock.damage);
    expect(table.rock.heal).toBe(zeroTable.rock.heal);
    expect(table.rock.stareBonus).toBe(zeroTable.rock.stareBonus);
    // 出していない手は変化しない
    expect(table.scissors).toEqual(zeroTable.scissors);
    expect(table.paper).toEqual(zeroTable.paper);
  });
});

describe('enemyHandTable: 本気モードの強化（desperateBonus）', () => {
  it('desperate は normal より全手の damage が desperateBonus だけ大きい（heal・stareBonus は動かない）', () => {
    const started = startGame(createGame());

    expect(started.battle).not.toBeNull();
    if (started.battle === null) return;

    const enemy = currentEnemy(started);
    expect(enemy).not.toBeNull();
    if (enemy === null) return;

    // enemyHeat は両方とも NO_HEAT のまま、敵HPだけを操作して2つの局面を作る
    // （tests/unit/game.test.ts の enemyForecast の desperate テストと同じ組み立て方）。
    const normalState: GameState = {
      ...started,
      battle: { ...started.battle, enemyHp: started.battle.enemyMaxHp },
    };
    const desperateState: GameState = {
      ...started,
      battle: { ...started.battle, enemyHp: Math.floor(started.battle.enemyMaxHp / 2) },
    };

    const normalTable = enemyHandTable(normalState);
    const desperateTable = enemyHandTable(desperateState);

    expect(normalTable).not.toBeNull();
    expect(desperateTable).not.toBeNull();
    if (normalTable === null || desperateTable === null) return;

    for (const hand of HANDS) {
      expect(desperateTable[hand].damage).toBe(normalTable[hand].damage + enemy.desperateBonus);
      expect(desperateTable[hand].heal).toBe(normalTable[hand].heal);
      expect(desperateTable[hand].stareBonus).toBe(normalTable[hand].stareBonus);
    }
  });
});

describe('enemyHandTable: 唯一の出どころであること（ctx.enemyHands と一致する）', () => {
  it('敵が勝ったターンの damageToPlayer は、直前の enemyHandTable と dealtDamage から求めた値と一致する', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
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
    expect(before.battle).not.toBeNull();
    if (before.battle === null) return;

    const table = enemyHandTable(before);
    expect(table).not.toBeNull();
    if (table === null) return;

    // プレイヤーは耐性を持たないので resistance は常に1（節4「dealtDamage」の契約どおり）
    const expectedDamage = dealtDamage(table[after.lastLog.enemyHand], 1, before.battle.stare);

    expect(after.lastLog.damageToPlayer).toBe(expectedDamage);
  });

  it('enemyForecast(state).damage[hand] は dealtDamage(enemyHandTable(state)[hand], 1, stare) と一致する', () => {
    let state = startGame(createGame());
    const rng = createRng(11);

    for (let i = 0; i < 20 && state.phase === 'battle'; i += 1) {
      const table = enemyHandTable(state);
      const forecast = enemyForecast(state);

      expect(table).not.toBeNull();
      expect(forecast).not.toBeNull();
      expect(state.battle).not.toBeNull();

      if (table !== null && forecast !== null && state.battle !== null) {
        for (const hand of HANDS) {
          expect(forecast.damage[hand]).toBe(dealtDamage(table[hand], 1, state.battle.stare));
        }
      }

      state = playHand(state, pickHand(i), rng);
    }
  });
});
