import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
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
  readonly drawRule: DrawRule;
  readonly hint: string;
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
