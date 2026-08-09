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

export type HeatCounts = Readonly<Record<Hand, number>>;

/** 熱がこの値たまるごとに弱化が1段深くなる */
export const HEAT_GAIN = 4;
/** 弱化の上限 */
export const HEAT_MAX_PENALTY = 3;
export const NO_HEAT: HeatCounts = { rock: 0, scissors: 0, paper: 0 };

/** 熱による弱化を damage にだけ適用した表を返す */
export function applyHeat(base: HandTable, heat: HeatCounts): HandTable {
  return {
    rock: {
      ...base.rock,
      damage: Math.max(
        1,
        base.rock.damage - Math.min(HEAT_MAX_PENALTY, Math.floor(heat.rock / HEAT_GAIN)),
      ),
    },
    scissors: {
      ...base.scissors,
      damage: Math.max(
        1,
        base.scissors.damage -
          Math.min(HEAT_MAX_PENALTY, Math.floor(heat.scissors / HEAT_GAIN)),
      ),
    },
    paper: {
      ...base.paper,
      damage: Math.max(
        1,
        base.paper.damage - Math.min(HEAT_MAX_PENALTY, Math.floor(heat.paper / HEAT_GAIN)),
      ),
    },
  };
}

/** ターン終わりの更新。全部を1冷ましてから、出した手に HEAT_GAIN を足す */
export function advanceHeat(heat: HeatCounts, used: Hand): HeatCounts {
  const next: Record<Hand, number> = {
    rock: Math.max(0, heat.rock - 1),
    scissors: Math.max(0, heat.scissors - 1),
    paper: Math.max(0, heat.paper - 1),
  };

  next[used] += HEAT_GAIN;

  return next;
}
