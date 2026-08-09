import type { Hand } from '@/domain/hand';

export interface HandValue {
  /** 基礎ダメージ。耐性の倍率が掛かるのはここだけ */
  readonly damage: number;
  /** 勝った側が自分に回復する量 */
  readonly heal: number;
  /** にらみ1あたりの追加ダメージ。耐性は掛からない */
  readonly stareBonus: number;
}

export type HandTable = Readonly<Record<Hand, HandValue>>;
export type UpgradeCounts = Readonly<Record<Hand, number>>;

export const UPGRADE_MAX_PER_HAND = 2;
export const NO_UPGRADES: UpgradeCounts = { rock: 0, scissors: 0, paper: 0 };

/** 上限に達していなければ true */
export function canUpgrade(counts: UpgradeCounts, hand: Hand): boolean {
  return counts[hand] < UPGRADE_MAX_PER_HAND;
}

/** 上限に達していたら counts をそのまま返す（例外を投げない） */
export function applyUpgrade(counts: UpgradeCounts, hand: Hand): UpgradeCounts {
  if (!canUpgrade(counts, hand)) {
    return counts;
  }

  return { ...counts, [hand]: counts[hand] + 1 };
}

/** 強化は damage にのみ加算する。heal と stareBonus は動かさない */
export function buildHandTable(base: HandTable, counts: UpgradeCounts): HandTable {
  return {
    rock: {
      ...base.rock,
      damage: base.rock.damage + counts.rock,
    },
    scissors: {
      ...base.scissors,
      damage: base.scissors.damage + counts.scissors,
    },
    paper: {
      ...base.paper,
      damage: base.paper.damage + counts.paper,
    },
  };
}
