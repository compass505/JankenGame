import type { GameState } from '@/application/game';
import type { Actions } from '@/ui/app';

export function renderResult(state: GameState, actions: Actions): HTMLElement {
  const el = document.createElement('main');
  el.className = state.cleared ? 'screen screen--result screen--cleared' : 'screen screen--result screen--gameover';

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
