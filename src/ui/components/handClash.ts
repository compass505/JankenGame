import type { TurnLog } from '@/domain/battle';
import type { Outcome } from '@/domain/hand';
import { renderHandIcon } from '@/ui/components/handIcon';

const OUTCOME_TEXT: Readonly<Record<Outcome, string>> = {
  win: 'あなたの勝ち！',
  lose: 'あなたの負け…',
  draw: 'あいこ',
};

const OUTCOME_MARK: Readonly<Record<Outcome, string>> = {
  win: 'WIN',
  lose: 'LOSE',
  draw: 'DRAW',
};

/**
 * 直前のターンの手合わせ。**両者の手を並べて出す。**
 * 文章だけだと何が起きたのか分からず、勝ち負けが理不尽に見える（docs/03 節7）。
 */
export function renderHandClash(log: TurnLog): HTMLElement {
  const el = document.createElement('div');
  el.className = `clash clash--${log.outcome}`;

  const banner = document.createElement('div');
  banner.className = 'clash__banner';
  const mark = document.createElement('span');
  mark.className = 'clash__mark';
  mark.textContent = OUTCOME_MARK[log.outcome];
  banner.appendChild(mark);
  const outcome = document.createElement('strong');
  outcome.className = 'clash__outcome';
  outcome.textContent = OUTCOME_TEXT[log.outcome];
  banner.appendChild(outcome);
  el.appendChild(banner);

  const arena = document.createElement('div');
  arena.className = 'clash__arena';

  const mine = document.createElement('div');
  mine.className = 'clash__side clash__side--mine';
  const mineLabel = document.createElement('span');
  mineLabel.className = 'clash__who';
  mineLabel.textContent = 'じぶん';
  mine.appendChild(mineLabel);
  mine.appendChild(renderHandIcon(log.playerHand, 'clash__icon'));
  arena.appendChild(mine);

  const center = document.createElement('div');
  center.className = 'clash__center';
  center.textContent = 'VS';
  arena.appendChild(center);

  const theirs = document.createElement('div');
  theirs.className = 'clash__side clash__side--theirs';
  const theirsLabel = document.createElement('span');
  theirsLabel.className = 'clash__who';
  theirsLabel.textContent = 'あいて';
  theirs.appendChild(theirsLabel);
  theirs.appendChild(renderHandIcon(log.enemyHand, 'clash__icon'));
  arena.appendChild(theirs);
  el.appendChild(arena);

  const summary = document.createElement('div');
  summary.className = 'clash__summary';
  if (log.damageToEnemy > 0) {
    summary.appendChild(renderResultChip('damage', '敵へ', `${String(log.damageToEnemy)} ダメージ`));
  }
  if (log.damageToPlayer > 0) {
    summary.appendChild(renderResultChip('damage', '自分へ', `${String(log.damageToPlayer)} ダメージ`));
  }
  if (log.healToPlayer > 0) {
    summary.appendChild(renderResultChip('heal', '自分', `HP +${String(log.healToPlayer)}`));
  }
  if (log.healToEnemy > 0) {
    summary.appendChild(renderResultChip('heal', '敵', `HP +${String(log.healToEnemy)}`));
  }
  if (log.stareAfter > log.stareBefore) {
    summary.appendChild(
      renderResultChip('stare', 'にらみ', `+${String(log.stareAfter - log.stareBefore)}`),
    );
  }
  el.appendChild(summary);

  return el;
}

function renderResultChip(kind: 'damage' | 'heal' | 'stare', label: string, value: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `clash__chip clash__chip--${kind}`;

  const chipLabel = document.createElement('span');
  chipLabel.className = 'clash__chip-label';
  chipLabel.textContent = label;
  chip.appendChild(chipLabel);

  const chipValue = document.createElement('strong');
  chipValue.className = 'clash__chip-value';
  chipValue.textContent = value;
  chip.appendChild(chipValue);

  return chip;
}
