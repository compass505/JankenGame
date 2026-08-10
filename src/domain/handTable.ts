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

/** 強化1回がどこに乗るか。手ごとに違う */
export type UpgradeTargets = Readonly<Record<Hand, 'damage' | 'stareBonus'>>;

/** 強化を targets の指す側にだけ加算する。heal は動かさない */
export function buildHandTableWith(
  base: HandTable,
  counts: UpgradeCounts,
  targets: UpgradeTargets,
): HandTable {
  return {
    rock: {
      ...base.rock,
      ...(targets.rock === 'damage'
        ? { damage: base.rock.damage + counts.rock }
        : { stareBonus: base.rock.stareBonus + counts.rock }),
    },
    scissors: {
      ...base.scissors,
      ...(targets.scissors === 'damage'
        ? { damage: base.scissors.damage + counts.scissors }
        : { stareBonus: base.scissors.stareBonus + counts.scissors }),
    },
    paper: {
      ...base.paper,
      ...(targets.paper === 'damage'
        ? { damage: base.paper.damage + counts.paper }
        : { stareBonus: base.paper.stareBonus + counts.paper }),
    },
  };
}

/** 直近に出した手。新しいほど後ろ */
export type HeatCounts = readonly Hand[];

/** 連打の罰の適用範囲 */
export interface HeatRule {
  /** 数える窓の広さ（今回の手を含む） */
  readonly window: number;
  /** 窓の中で何回までなら罰なしか */
  readonly allowed: number;
  /** 弱化の上限 */
  readonly maxPenalty: number;
}

export const NO_HEAT: HeatCounts = [];

/** その手をいま出したら何段弱化するか。段数の式はここだけに置く */
export function heatPenalty(history: HeatCounts, hand: Hand, rule: HeatRule): number {
  const count = 1 + history.filter((historyHand) => historyHand === hand).length;
  return Math.min(rule.maxPenalty, Math.max(0, count - rule.allowed));
}

/** 弱化を damage にだけ適用した表を返す */
export function applyHeat(base: HandTable, history: HeatCounts, rule: HeatRule): HandTable {
  return {
    rock: {
      ...base.rock,
      damage: Math.max(1, base.rock.damage - heatPenalty(history, 'rock', rule)),
    },
    scissors: {
      ...base.scissors,
      damage: Math.max(1, base.scissors.damage - heatPenalty(history, 'scissors', rule)),
    },
    paper: {
      ...base.paper,
      damage: Math.max(1, base.paper.damage - heatPenalty(history, 'paper', rule)),
    },
  };
}

/** ターン終わりの更新。履歴に1手足し、窓からはみ出した古い手を捨てる */
export function advanceHeat(history: HeatCounts, used: Hand, rule: HeatRule): HeatCounts {
  const next = [...history, used];
  const historyLimit = Math.max(0, rule.window - 1);

  return next.slice(Math.max(0, next.length - historyLimit));
}
