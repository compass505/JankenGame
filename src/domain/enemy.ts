import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import { applyHeat } from '@/domain/handTable';
import type { HandTable, HeatCounts, HeatRule } from '@/domain/handTable';
import type { Rng } from '@/lib/rng';

export type DrawRule = 'standard' | 'stareDouble';
export type EnemyPhase = 'normal' | 'desperate';
export type HandWeights = Readonly<Record<Hand, number>>;

export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  readonly maxHp: number;
  readonly weightsNormal: HandWeights;
  readonly weightsDesperate: HandWeights;
  readonly resistance: Readonly<Record<Hand, number>>;
  /** 本気（desperate）のとき、敵の全手のダメージに足す量。0 なら強化なし。
   *  掛けるのは application 側（docs/03 節5）。ここは値を持つだけ */
  readonly desperateBonus: number;
  readonly drawRule: DrawRule;
  /** この敵だけの値表。省略すると既定の値表を使う */
  readonly hands?: HandTable;
}

export const UNIFORM_MIX = 0.3;

export function enemyPhase(enemyHp: number, enemyMaxHp: number): EnemyPhase {
  return enemyHp * 2 <= enemyMaxHp ? 'desperate' : 'normal';
}

export function handProbabilities(
  enemy: EnemyDef,
  phase: EnemyPhase,
): Readonly<Record<Hand, number>> {
  const weights = phase === 'normal' ? enemy.weightsNormal : enemy.weightsDesperate;
  const rock = Math.max(0, weights.rock);
  const scissors = Math.max(0, weights.scissors);
  const paper = Math.max(0, weights.paper);
  const total = rock + scissors + paper;

  if (total <= 0) {
    return { rock: 1 / 3, scissors: 1 / 3, paper: 1 / 3 };
  }

  const uniformProbability = UNIFORM_MIX / 3;
  const weightedProbability = 1 - UNIFORM_MIX;

  return {
    rock: weightedProbability * (rock / total) + uniformProbability,
    scissors: weightedProbability * (scissors / total) + uniformProbability,
    paper: weightedProbability * (paper / total) + uniformProbability,
  };
}

export function decideEnemyHand(
  enemy: EnemyDef,
  enemyHp: number,
  enemyMaxHp: number,
  rng: Rng,
): Hand {
  const probabilities = handProbabilities(enemy, enemyPhase(enemyHp, enemyMaxHp));
  const randomValue = rng.next();
  let accumulated = 0;

  for (const hand of HANDS) {
    accumulated += probabilities[hand];
    if (randomValue < accumulated) {
      return hand;
    }
  }

  return 'paper';
}

/** 敵の値表を組み立てる唯一の出どころ（docs/03 節3）。 */
export function buildEnemyHandTable(
  base: HandTable,
  enemy: EnemyDef,
  history: HeatCounts,
  rule: HeatRule,
  phase: EnemyPhase,
): HandTable {
  const table = applyHeat(enemy.hands ?? base, history, rule);
  if (phase !== 'desperate' || enemy.desperateBonus <= 0) {
    return table;
  }

  return {
    rock: { ...table.rock, damage: table.rock.damage + enemy.desperateBonus },
    scissors: { ...table.scissors, damage: table.scissors.damage + enemy.desperateBonus },
    paper: { ...table.paper, damage: table.paper.damage + enemy.desperateBonus },
  };
}
