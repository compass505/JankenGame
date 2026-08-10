import type { TurnLog } from '@/domain/battle';
import type { Outcome } from '@/domain/hand';
import { renderHandIcon } from '@/ui/components/handIcon';

const OUTCOME_TEXT: Readonly<Record<Outcome, string>> = {
  win: '勝ち',
  lose: '負け',
  draw: 'あいこ',
};

/**
 * 直前のターンの手合わせ。**両者の手を並べて出す。**
 * 文章だけだと何が起きたのか分からず、勝ち負けが理不尽に見える（docs/03 節7）。
 */
export function renderHandClash(log: TurnLog): HTMLElement {
  const el = document.createElement('div');
  el.className = `clash clash--${log.outcome}`;

  const mine = document.createElement('div');
  mine.className = 'clash__side clash__side--mine';
  mine.appendChild(renderHandIcon(log.playerHand, 'clash__icon'));
  const mineLabel = document.createElement('span');
  mineLabel.className = 'clash__who';
  mineLabel.textContent = 'じぶん';
  mine.appendChild(mineLabel);
  el.appendChild(mine);

  const center = document.createElement('div');
  center.className = 'clash__center';

  const outcome = document.createElement('div');
  outcome.className = 'clash__outcome';
  outcome.textContent = OUTCOME_TEXT[log.outcome];
  center.appendChild(outcome);

  const detail = document.createElement('div');
  detail.className = 'clash__detail';
  const parts: string[] = [];
  if (log.damageToEnemy > 0) parts.push(`敵に ${String(log.damageToEnemy)}`);
  if (log.damageToPlayer > 0) parts.push(`自分に ${String(log.damageToPlayer)}`);
  if (log.healToPlayer > 0) parts.push(`自分 +${String(log.healToPlayer)} 回復`);
  if (log.healToEnemy > 0) parts.push(`敵 +${String(log.healToEnemy)} 回復`);
  if (parts.length === 0 && log.stareAfter > log.stareBefore) {
    parts.push(`にらみ +${String(log.stareAfter - log.stareBefore)}`);
  }
  detail.textContent = parts.join(' / ');
  center.appendChild(detail);

  el.appendChild(center);

  const theirs = document.createElement('div');
  theirs.className = 'clash__side clash__side--theirs';
  theirs.appendChild(renderHandIcon(log.enemyHand, 'clash__icon'));
  const theirsLabel = document.createElement('span');
  theirsLabel.className = 'clash__who';
  theirsLabel.textContent = 'あいて';
  theirs.appendChild(theirsLabel);
  el.appendChild(theirs);

  return el;
}
