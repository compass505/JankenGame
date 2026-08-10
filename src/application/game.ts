import {
  STARE_GAIN,
  STARE_MAX,
  STARE_MAX_DRAW_DAMAGE,
  createBattle,
  dealtDamage,
  resolveTurn,
} from '@/domain/battle';
import type { BattleState, TurnLog } from '@/domain/battle';
import { enemyPhase, handProbabilities } from '@/domain/enemy';
import type { EnemyDef, EnemyPhase } from '@/domain/enemy';
import { HANDS, judge } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import {
  applyUpgrade,
  advanceHeat,
  applyHeat,
  buildHandTableWith,
  canUpgrade,
  heatPenalty,
  NO_HEAT,
  NO_UPGRADES,
} from '@/domain/handTable';
import type { HandTable, HandValue, HeatCounts, UpgradeCounts } from '@/domain/handTable';
import { BASE_HANDS, UPGRADE_TARGETS } from '@/data/hands';
import { HEAT_RULE } from '@/data/heat';
import { PLAYER_MAX_HP } from '@/data/player';
import { STAGES } from '@/data/stages';
import type { Rng } from '@/lib/rng';

export type Phase = 'title' | 'battle' | 'upgrade' | 'result';

/** 強化画面に出す、いまの値と強化したあとの値 */
export interface UpgradePreview {
  readonly current: HandValue;
  readonly next: HandValue;
}

/** 敵がいま各手を出す確率と、その手で敵が勝ったときにこちらが受けるダメージ */
export interface EnemyForecast {
  readonly phase: EnemyPhase;
  readonly probability: Readonly<Record<Hand, number>>;
  readonly damage: Readonly<Record<Hand, number>>;
}

/** 手を選んだあとの3つの結果。期待値に丸めず、判断材料をそのまま返す。 */
export interface HandOutlook {
  readonly onWin: number;
  readonly healOnWin: number;
  readonly stareOnDraw: number;
  readonly damageOnDraw: number;
  readonly worstOnLose: number;
  readonly heatCost: number;
}

export interface GameState {
  readonly phase: Phase;
  readonly stageIndex: number;
  readonly upgrades: UpgradeCounts;
  readonly battle: BattleState | null;
  readonly lastLog: TurnLog | null;
  readonly cleared: boolean;
  readonly playerHeat: HeatCounts;
  readonly enemyHeat: HeatCounts;
}

export function createGame(): GameState {
  return {
    phase: 'title',
    stageIndex: 0,
    upgrades: NO_UPGRADES,
    battle: null,
    lastLog: null,
    cleared: false,
    playerHeat: NO_HEAT,
    enemyHeat: NO_HEAT,
  };
}

export function startGame(state: GameState): GameState {
  if (state.phase !== 'title') {
    return state;
  }

  const enemy = STAGES[0];
  if (enemy === undefined) {
    return state;
  }

  const freshGame = createGame();
  return {
    ...freshGame,
    phase: 'battle',
    battle: createBattle(PLAYER_MAX_HP, enemy),
  };
}

export function playHand(state: GameState, hand: Hand, rng: Rng): GameState {
  if (state.phase !== 'battle' || state.battle === null) {
    return state;
  }

  const enemy = STAGES[state.stageIndex];
  if (enemy === undefined) {
    return state;
  }

  // 画面に出す表（playerHandTable）と実ダメージの元をずらさないため、同じ関数から取る
  const playerHands = playerHandTable(state);
  const phase = enemyPhase(state.battle.enemyHp, state.battle.enemyMaxHp);
  const enemyHands = enemyHandTable(state, enemy, phase);
  const result = resolveTurn(
    state.battle,
    hand,
    {
      playerHands,
      enemyHands,
      enemy,
    },
    rng,
  );

  const playerHeat = advanceHeat(state.playerHeat, hand, HEAT_RULE);
  const enemyHeat = advanceHeat(state.enemyHeat, result.log.enemyHand, HEAT_RULE);

  if (result.state.outcome === null) {
    return {
      ...state,
      battle: result.state,
      lastLog: result.log,
      playerHeat,
      enemyHeat,
    };
  }

  if (result.state.outcome === 'playerLose') {
    return {
      ...state,
      phase: 'result',
      battle: result.state,
      lastLog: result.log,
      cleared: false,
      playerHeat,
      enemyHeat,
    };
  }

  if (state.stageIndex === STAGES.length - 1) {
    return {
      ...state,
      phase: 'result',
      battle: result.state,
      lastLog: result.log,
      cleared: true,
      playerHeat,
      enemyHeat,
    };
  }

  return {
    ...state,
    phase: 'upgrade',
    battle: result.state,
    lastLog: result.log,
    playerHeat,
    enemyHeat,
  };
}

export function chooseUpgrade(state: GameState, hand: Hand): GameState {
  if (state.phase !== 'upgrade' || !canUpgrade(state.upgrades, hand)) {
    return state;
  }

  const enemy = STAGES[state.stageIndex + 1];
  if (enemy === undefined) {
    return state;
  }

  return {
    ...state,
    phase: 'battle',
    stageIndex: state.stageIndex + 1,
    upgrades: applyUpgrade(state.upgrades, hand),
    battle: createBattle(PLAYER_MAX_HP, enemy),
    lastLog: null,
    playerHeat: NO_HEAT,
    enemyHeat: NO_HEAT,
  };
}

export function backToTitle(_state: GameState): GameState {
  return createGame();
}

export function currentEnemy(state: GameState): EnemyDef | null {
  return STAGES[state.stageIndex] ?? null;
}

function enemyHandTable(
  state: GameState,
  enemy: EnemyDef,
  phase: EnemyPhase,
): HandTable {
  const base = applyHeat(BASE_HANDS, state.enemyHeat, HEAT_RULE);
  if (phase !== 'desperate' || enemy.desperateBonus <= 0) {
    return base;
  }

  return {
    rock: { ...base.rock, damage: base.rock.damage + enemy.desperateBonus },
    scissors: { ...base.scissors, damage: base.scissors.damage + enemy.desperateBonus },
    paper: { ...base.paper, damage: base.paper.damage + enemy.desperateBonus },
  };
}

/** プレイヤーの表の唯一の組み立て口。強化を足してから弱化を引く（docs/03 節2.5 の適用順序）。
 *  履歴を差し替えられるようにしてあるのは、handOutlook が「次のターンの表」を要るため。
 *  式をここ1箇所に閉じ込めないと、片方だけ直したときに画面の数字と実ダメージがずれる */
function playerHandTableWith(state: GameState, history: HeatCounts): HandTable {
  return applyHeat(
    buildHandTableWith(BASE_HANDS, state.upgrades, UPGRADE_TARGETS),
    history,
    HEAT_RULE,
  );
}

export function playerHandTable(state: GameState): HandTable {
  return playerHandTableWith(state, state.playerHeat);
}

/**
 * 表示用。その手をいま出して勝ったときに実際に与えるダメージ。
 * 強化・熱・耐性・にらみをすべて含む。戦闘中でなければ 0。
 */
export function damagePreview(state: GameState, hand: Hand): number {
  const battle = state.battle;
  const enemy = currentEnemy(state);
  if (state.phase !== 'battle' || battle === null || enemy === null) {
    return 0;
  }

  return dealtDamage(playerHandTable(state)[hand], enemy.resistance[hand], battle.stare);
}

/** 表示用。その手を選んだときの勝ち・あいこ・負けと、次ターンの熱コスト。 */
export function handOutlook(state: GameState, hand: Hand): HandOutlook | null {
  const battle = state.battle;
  const enemy = currentEnemy(state);
  if (state.phase !== 'battle' || battle === null || enemy === null) {
    return null;
  }

  const value = playerHandTable(state)[hand];
  const onWin = dealtDamage(value, enemy.resistance[hand], battle.stare);
  const healOnWin = Math.max(
    0,
    Math.min(value.heal, onWin - 1, battle.playerMaxHp - battle.playerHp),
  );

  const stareOnDraw =
    battle.stare >= STARE_MAX
      ? 0
      : Math.min(STARE_MAX, battle.stare + STARE_GAIN[enemy.drawRule]) - battle.stare;
  const damageOnDraw = battle.stare >= STARE_MAX ? STARE_MAX_DRAW_DAMAGE : 0;

  const forecast = enemyForecast(state);
  let worstOnLose = 0;
  if (forecast !== null) {
    for (const enemyHand of HANDS) {
      if (judge(hand, enemyHand) === 'lose') {
        worstOnLose = Math.max(worstOnLose, forecast.damage[enemyHand]);
      }
    }
  }

  const currentDamage = value.damage;
  const nextHeat = advanceHeat(state.playerHeat, hand, HEAT_RULE);
  const nextDamage = playerHandTableWith(state, nextHeat)[hand].damage;

  return {
    onWin,
    healOnWin,
    stareOnDraw,
    damageOnDraw,
    worstOnLose,
    heatCost: Math.max(0, currentDamage - nextDamage),
  };
}

/**
 * 表示用。強化画面で見せる「いまの値」と「強化したあとの値」。
 * 上限に達している手は両方が同じ値になる（applyUpgrade が counts をそのまま返すため）。
 *
 * 熱は含めない（次の戦闘の頭で NO_HEAT に戻る）。
 * 耐性も含めない（次にどの敵と戦うかは、この画面の関心ではない）。
 */
export function upgradePreview(state: GameState, hand: Hand): UpgradePreview {
  return {
    current: buildHandTableWith(BASE_HANDS, state.upgrades, UPGRADE_TARGETS)[hand],
    next: buildHandTableWith(
      BASE_HANDS,
      applyUpgrade(state.upgrades, hand),
      UPGRADE_TARGETS,
    )[hand],
  };
}

/**
 * 表示用。敵がいま各手を出す確率と、その手で敵が勝ったときにこちらが受けるダメージ。
 * 敵の熱も反映する。戦闘中でなければ null。
 */
export function enemyForecast(state: GameState): EnemyForecast | null {
  const battle = state.battle;
  const enemy = currentEnemy(state);
  if (state.phase !== 'battle' || battle === null || enemy === null) {
    return null;
  }

  const phase = enemyPhase(battle.enemyHp, battle.enemyMaxHp);
  const enemyHands = enemyHandTable(state, enemy, phase);

  return {
    phase,
    probability: handProbabilities(enemy, phase),
    damage: {
      rock: dealtDamage(enemyHands.rock, 1, battle.stare),
      scissors: dealtDamage(enemyHands.scissors, 1, battle.stare),
      paper: dealtDamage(enemyHands.paper, 1, battle.stare),
    },
  };
}

export function heatPenalties(state: GameState): Readonly<Record<Hand, number>> {
  return {
    rock: heatPenalty(state.playerHeat, 'rock', HEAT_RULE),
    scissors: heatPenalty(state.playerHeat, 'scissors', HEAT_RULE),
    paper: heatPenalty(state.playerHeat, 'paper', HEAT_RULE),
  };
}
