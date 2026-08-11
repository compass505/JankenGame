import type { Hand } from '@/domain/hand';
import { assetUrl } from '@/ui/assetUrl';

export const HAND_LABEL: Readonly<Record<Hand, string>> = {
  rock: 'グー',
  scissors: 'チョキ',
  paper: 'パー',
};

/** 手の画像。表示サイズは呼び出し側の class で決める */
export function renderHandIcon(hand: Hand, className: string): HTMLImageElement {
  const icon = document.createElement('img');
  icon.className = className;
  icon.src = assetUrl(`hand-${hand}.png`);
  icon.alt = HAND_LABEL[hand];
  return icon;
}
