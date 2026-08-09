import { createBattle, resolveTurn } from '@/domain/battle';
import type { BattleState, TurnLog } from '@/domain/battle';
import type { EnemyDef } from '@/domain/enemy';
import type { Hand } from '@/domain/hand';
import {
  applyUpgrade,
  advanceHeat,
  applyHeat,
  buildHandTable,
  canUpgrade,
  HEAT_GAIN,
  HEAT_MAX_PENALTY,
  NO_HEAT,
  NO_UPGRADES,
} from '@/domain/handTable';
import type { HandTable, HeatCounts, UpgradeCounts } from '@/domain/handTable';
import { BASE_HANDS } from '@/data/hands';
import { STAGES } from '@/data/stages';
import type { Rng } from '@/lib/rng';

export type Phase = 'title' | 'battle' | 'upgrade' | 'result';

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

export const PLAYER_MAX_HP = 15;

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
  const enemyHands = applyHeat(BASE_HANDS, state.enemyHeat);
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

  const playerHeat = advanceHeat(state.playerHeat, hand);
  const enemyHeat = advanceHeat(state.enemyHeat, result.log.enemyHand);

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

export function playerHandTable(state: GameState): HandTable {
  return applyHeat(buildHandTable(BASE_HANDS, state.upgrades), state.playerHeat);
}

export function heatPenalties(state: GameState): Readonly<Record<Hand, number>> {
  return {
    rock: Math.min(HEAT_MAX_PENALTY, Math.floor(state.playerHeat.rock / HEAT_GAIN)),
    scissors: Math.min(HEAT_MAX_PENALTY, Math.floor(state.playerHeat.scissors / HEAT_GAIN)),
    paper: Math.min(HEAT_MAX_PENALTY, Math.floor(state.playerHeat.paper / HEAT_GAIN)),
  };
}
