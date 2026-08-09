import type { GameState } from '@/application/game';
import { HANDS } from '@/domain/hand';
import { canUpgrade } from '@/domain/handTable';
import { renderHandButton } from '@/ui/components/handButton';
import type { Actions } from '@/ui/app';

export function renderUpgrade(state: GameState, actions: Actions): HTMLElement {
  const el = document.createElement('main');
  el.className = 'screen screen--upgrade';

  const title = document.createElement('h1');
  title.className = 'screen__title';
  title.textContent = '手を強化する';
  el.appendChild(title);

  const lead = document.createElement('p');
  lead.className = 'screen__lead';
  lead.textContent = '強化する手を1つ選んでください。';
  el.appendChild(lead);

  const choices = document.createElement('div');
  choices.className = 'hand-row';

  for (const hand of HANDS) {
    const upgradable = canUpgrade(state.upgrades, hand);
    choices.appendChild(
      renderHandButton({
        hand,
        disabled: !upgradable,
        disabledReason: upgradable ? undefined : '上限',
        onClick: () => {
          actions.onChooseUpgrade(hand);
        },
      }),
    );
  }

  el.appendChild(choices);
  return el;
}
