import type { HandTable, UpgradeTargets } from '@/domain/handTable';

export const BASE_HANDS: HandTable = {
  rock: { damage: 3, heal: 0, stareBonus: 4 },
  scissors: { damage: 5, heal: 0, stareBonus: 0 },
  paper: { damage: 3, heal: 3, stareBonus: 0 },
};

/** 強化1回がどこに乗るか（`docs/adr/0003-repetition-window.md`）。
 *  グーはにらみ倍率に乗るので、あいこを狙って読んだプレイヤーにしか還元されない。
 *  パーの heal は 3 のままだが、実際の回復は「与ダメージ − 1」で頭打ちになるため、
 *  1回強化して打点4になって初めて 3 が出る */
export const UPGRADE_TARGETS: UpgradeTargets = {
  rock: 'stareBonus',
  scissors: 'damage',
  paper: 'damage',
};
