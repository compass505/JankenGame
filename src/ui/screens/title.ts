import type { GameState } from '@/application/game';
import type { Actions } from '@/ui/app';

export function renderTitle(_state: GameState, actions: Actions): HTMLElement {
  const el = document.createElement('main');
  el.className = 'screen screen--title';

  const logo = document.createElement('img');
  logo.className = 'title-logo';
  logo.src = '/assets/title-logo.png';
  logo.alt = '';
  logo.setAttribute('aria-hidden', 'true');
  el.appendChild(logo);

  const title = document.createElement('h1');
  title.className = 'screen__title';
  title.textContent = 'じゃんけんRPG';
  el.appendChild(title);

  const lead = document.createElement('p');
  lead.className = 'screen__lead';
  lead.textContent = 'じゃんけんの勝ち方で、得られるものが変わる。';
  el.appendChild(lead);

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'primary-button';
  startButton.textContent = 'はじめる';
  startButton.addEventListener('click', () => {
    actions.onStart();
  });
  el.appendChild(startButton);

  return el;
}
