import { currentEnemy } from '@/application/game';
import type { GameState } from '@/application/game';
import { renderEnemyDefeat } from '@/ui/components/enemyDefeat';
import type { Actions } from '@/ui/app';

export function renderResult(state: GameState, actions: Actions): HTMLElement {
  const el = document.createElement('main');
  el.className = state.cleared ? 'screen screen--result screen--cleared' : 'screen screen--result screen--gameover';

  if (state.cleared) {
    const defeatedEnemy = currentEnemy(state);
    if (defeatedEnemy !== null) {
      el.appendChild(renderEnemyDefeat(defeatedEnemy, state.lastLog?.damageToEnemy ?? 0, true));
    }
    el.appendChild(renderVictoryCeremony());
  } else {
    const emblem = document.createElement('img');
    emblem.className = 'result-emblem';
    emblem.src = '/assets/result-gameover.png';
    emblem.alt = '';
    emblem.setAttribute('aria-hidden', 'true');
    el.appendChild(emblem);
  }

  const title = document.createElement('h1');
  title.className = 'screen__title';
  title.textContent = state.cleared ? 'クリア！' : 'ゲームオーバー';
  el.appendChild(title);

  if (state.battle !== null) {
    const hp = document.createElement('p');
    hp.className = 'screen__lead';
    hp.textContent = `最終HP: ${state.battle.playerHp} / ${state.battle.playerMaxHp}`;
    el.appendChild(hp);
  }

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'primary-button';
  backButton.textContent = 'タイトルへ戻る';
  backButton.addEventListener('click', () => {
    actions.onBackToTitle();
  });
  el.appendChild(backButton);

  return el;
}

function renderVictoryCeremony(): HTMLElement {
  const ceremony = document.createElement('div');
  ceremony.className = 'victory-ceremony';
  ceremony.setAttribute('aria-hidden', 'true');

  const rays = document.createElement('div');
  rays.className = 'victory-ceremony__rays';
  ceremony.appendChild(rays);

  const emblem = document.createElement('img');
  emblem.className = 'result-emblem result-emblem--victory';
  emblem.src = '/assets/result-victory.png';
  emblem.alt = '';
  ceremony.appendChild(emblem);

  const confetti = document.createElement('div');
  confetti.className = 'victory-confetti';
  for (let index = 0; index < 18; index += 1) {
    const piece = document.createElement('span');
    piece.className = 'victory-confetti__piece';
    confetti.appendChild(piece);
  }
  ceremony.appendChild(confetti);

  return ceremony;
}
