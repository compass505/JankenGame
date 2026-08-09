import { decideEnemyHand } from '@/domain/enemy';
import type { DrawRule, EnemyDef } from '@/domain/enemy';
import { judge } from '@/domain/hand';
import type { Hand, Outcome } from '@/domain/hand';
import type { HandTable } from '@/domain/handTable';
import type { Rng } from '@/lib/rng';

export const STARE_MAX = 2;
/** にらみが上限のときのあいこで、双方が受けるダメージ */
export const STARE_MAX_DRAW_DAMAGE = 1;
export const STARE_GAIN: Readonly<Record<DrawRule, number>> = { standard: 1, stareDouble: 2 };

export interface BattleState {
  readonly playerHp: number;
  readonly playerMaxHp: number;
  readonly enemyHp: number;
  readonly enemyMaxHp: number;
  readonly stare: number;
  readonly turn: number;
  readonly outcome: 'playerWin' | 'playerLose' | null;
}

export interface TurnLog {
  readonly playerHand: Hand;
  readonly enemyHand: Hand;
  readonly outcome: Outcome;
  readonly damageToEnemy: number;
  readonly damageToPlayer: number;
  readonly healToPlayer: number;
  readonly healToEnemy: number;
  readonly stareBefore: number;
  readonly stareAfter: number;
}

export interface TurnResult {
  readonly state: BattleState;
  readonly log: TurnLog;
}

export interface BattleContext {
  /** 強化を適用したあとのプレイヤーの手 */
  readonly playerHands: HandTable;
  /** 敵の手。強化は乗らない */
  readonly enemyHands: HandTable;
  readonly enemy: EnemyDef;
}

export function createBattle(playerMaxHp: number, enemy: EnemyDef): BattleState {
  return {
    playerHp: playerMaxHp,
    playerMaxHp,
    enemyHp: enemy.maxHp,
    enemyMaxHp: enemy.maxHp,
    stare: 0,
    turn: 0,
    outcome: null,
  };
}

export function resolveTurn(
  state: BattleState,
  playerHand: Hand,
  ctx: BattleContext,
  rng: Rng,
): TurnResult {
  if (state.outcome !== null) {
    return {
      state,
      log: {
        playerHand,
        enemyHand: playerHand,
        outcome: 'draw',
        damageToEnemy: 0,
        damageToPlayer: 0,
        healToPlayer: 0,
        healToEnemy: 0,
        stareBefore: state.stare,
        stareAfter: state.stare,
      },
    };
  }

  const enemyHand = decideEnemyHand(ctx.enemy, state.enemyHp, state.enemyMaxHp, rng);
  const outcome = judge(playerHand, enemyHand);

  let damageToEnemy = 0;
  let damageToPlayer = 0;
  let healToPlayer = 0;
  let healToEnemy = 0;
  let stareAfter = state.stare;

  if (outcome === 'draw') {
    if (state.stare >= STARE_MAX) {
      damageToPlayer = STARE_MAX_DRAW_DAMAGE;
      damageToEnemy = STARE_MAX_DRAW_DAMAGE;
      stareAfter = STARE_MAX;
    } else {
      stareAfter = Math.min(STARE_MAX, state.stare + STARE_GAIN[ctx.enemy.drawRule]);
    }
  } else if (outcome === 'win') {
    const value = ctx.playerHands[playerHand];
    const base = Math.max(1, Math.floor(value.damage * ctx.enemy.resistance[playerHand]));
    const dealt = base + state.stare * value.stareBonus;

    damageToEnemy = dealt;
    healToPlayer = Math.max(
      0,
      Math.min(value.heal, dealt - 1, state.playerMaxHp - state.playerHp),
    );
    stareAfter = 0;
  } else {
    const value = ctx.enemyHands[enemyHand];
    const dealt = value.damage + state.stare * value.stareBonus;

    damageToPlayer = dealt;
    healToEnemy = Math.max(
      0,
      Math.min(value.heal, dealt - 1, state.enemyMaxHp - state.enemyHp),
    );
    stareAfter = 0;
  }

  const playerHp = Math.min(
    state.playerMaxHp,
    Math.max(0, state.playerHp - damageToPlayer + healToPlayer),
  );
  const enemyHp = Math.min(
    state.enemyMaxHp,
    Math.max(0, state.enemyHp - damageToEnemy + healToEnemy),
  );

  let nextOutcome: BattleState['outcome'] = null;
  if (playerHp <= 0 && enemyHp <= 0) {
    nextOutcome = 'playerLose';
  } else if (playerHp <= 0) {
    nextOutcome = 'playerLose';
  } else if (enemyHp <= 0) {
    nextOutcome = 'playerWin';
  }

  return {
    state: {
      playerHp,
      playerMaxHp: state.playerMaxHp,
      enemyHp,
      enemyMaxHp: state.enemyMaxHp,
      stare: stareAfter,
      turn: state.turn + 1,
      outcome: nextOutcome,
    },
    log: {
      playerHand,
      enemyHand,
      outcome,
      damageToEnemy,
      damageToPlayer,
      healToPlayer,
      healToEnemy,
      stareBefore: state.stare,
      stareAfter,
    },
  };
}
