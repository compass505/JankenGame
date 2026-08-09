import { currentEnemy, playerHandTable } from '@/application/game';
import type { GameState } from '@/application/game';
import { HANDS } from '@/domain/hand';
import type { Outcome } from '@/domain/hand';
import { renderHandButton } from '@/ui/components/handButton';
import { renderHpBar } from '@/ui/components/hpBar';
import { renderStareDisplay } from '@/ui/components/stareDisplay';
import type { Actions } from '@/ui/app';

const OUTCOME_TEXT: Readonly<Record<Outcome, string>> = {
  win: 'あなたの勝ち！',
  lose: 'あなたの負け…',
  draw: 'あいこ',
};

export function renderBattle(state: GameState, actions: Actions): HTMLElement {
  const el = document.createElement('main');
  el.className = 'screen screen--battle';

  const enemy = currentEnemy(state);
  const battle = state.battle;

  if (enemy === null || battle === null) {
    return el;
  }

  const enemyPanel = document.createElement('div');
  enemyPanel.className = 'enemy-panel';

  const portrait = document.createElement('img');
  portrait.className = 'enemy-panel__portrait';
  if (enemy.id === 'glicoKing') {
    portrait.classList.add('enemy-panel__portrait--boss');
  }
  portrait.src = `/assets/enemy-${enemy.id}.png`;
  portrait.alt = enemy.name;
  enemyPanel.appendChild(portrait);

  const enemyName = document.createElement('div');
  enemyName.className = 'enemy-panel__name';
  enemyName.textContent = enemy.name;
  enemyPanel.appendChild(enemyName);

  const enemyHint = document.createElement('div');
  enemyHint.className = 'enemy-panel__hint';
  enemyHint.textContent = enemy.hint;
  enemyPanel.appendChild(enemyHint);

  enemyPanel.appendChild(renderHpBar('敵', battle.enemyHp, battle.enemyMaxHp));
  el.appendChild(enemyPanel);

  const log = state.lastLog;
  const stareJustIncreased = log !== null && log.stareAfter > log.stareBefore;
  el.appendChild(renderStareDisplay(battle.stare, stareJustIncreased));

  if (log !== null) {
    const logPanel = document.createElement('div');
    logPanel.className = 'turn-log';

    const outcomeLine = document.createElement('div');
    outcomeLine.className = 'turn-log__outcome';
    outcomeLine.textContent = OUTCOME_TEXT[log.outcome];
    logPanel.appendChild(outcomeLine);

    const detail = document.createElement('div');
    detail.className = 'turn-log__detail';
    const parts: string[] = [];
    if (log.damageToEnemy > 0) parts.push(`敵に ${log.damageToEnemy} ダメージ`);
    if (log.damageToPlayer > 0) parts.push(`自分に ${log.damageToPlayer} ダメージ`);
    if (log.healToPlayer > 0) parts.push(`自分が ${log.healToPlayer} 回復`);
    if (log.healToEnemy > 0) parts.push(`敵が ${log.healToEnemy} 回復`);
    detail.textContent = parts.join(' / ');
    logPanel.appendChild(detail);

    el.appendChild(logPanel);
  }

  const playerPanel = document.createElement('div');
  playerPanel.className = 'player-panel';
  playerPanel.appendChild(renderHpBar('自分', battle.playerHp, battle.playerMaxHp));
  el.appendChild(playerPanel);

  const hands = playerHandTable(state);
  const handRow = document.createElement('div');
  handRow.className = 'hand-row';

  for (const hand of HANDS) {
    const value = hands[hand];
    const damagePreview = value.damage + battle.stare * value.stareBonus;
    handRow.appendChild(
      renderHandButton({
        hand,
        damagePreview,
        onClick: () => {
          actions.onPlayHand(hand);
        },
      }),
    );
  }

  el.appendChild(handRow);

  return el;
}
