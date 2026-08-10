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

/**
 * 熱の効き方。**数値は引数で受け取る。**
 * バランス調整で動かしたい数値なので、domain の定数にすると /balance で触れなくなる
 * （domain は src/data/ を import できない）。実際の値は src/data/heat.ts にある。
 */
export interface HeatRule {
  /** 熱がこの値たまるごとに弱化が1段深くなる */
  readonly gain: number;
  /** 弱化の上限 */
  readonly maxPenalty: number;
}

export const NO_HEAT: HeatCounts = { rock: 0, scissors: 0, paper: 0 };

/** 熱1つぶんの弱化の段数。**段数の式はここだけに置く**（application もこれを呼ぶ） */
export function heatPenalty(heat: number, rule: HeatRule): number {
  return Math.min(rule.maxPenalty, Math.floor(heat / rule.gain));
}

/** 熱による弱化を damage にだけ適用した表を返す */
export function applyHeat(base: HandTable, heat: HeatCounts, rule: HeatRule): HandTable {
  return {
    rock: {
      ...base.rock,
      damage: Math.max(1, base.rock.damage - heatPenalty(heat.rock, rule)),
    },
    scissors: {
      ...base.scissors,
      damage: Math.max(1, base.scissors.damage - heatPenalty(heat.scissors, rule)),
    },
    paper: {
      ...base.paper,
      damage: Math.max(1, base.paper.damage - heatPenalty(heat.paper, rule)),
    },
  };
}

/** ターン終わりの更新。全部を1冷ましてから、出した手に rule.gain を足す */
export function advanceHeat(heat: HeatCounts, used: Hand, rule: HeatRule): HeatCounts {
  const next: Record<Hand, number> = {
    rock: Math.max(0, heat.rock - 1),
    scissors: Math.max(0, heat.scissors - 1),
    paper: Math.max(0, heat.paper - 1),
  };

  next[used] += rule.gain;

  return next;
}
