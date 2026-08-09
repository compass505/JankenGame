import type { HandTable } from '@/domain/handTable';

export const BASE_HANDS: HandTable = {
  rock: { damage: 3, heal: 0, stareBonus: 3 },
  scissors: { damage: 5, heal: 0, stareBonus: 0 },
  paper: { damage: 4, heal: 3, stareBonus: 0 },
};
