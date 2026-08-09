import { backToTitle, chooseUpgrade, createGame, playHand, startGame } from '@/application/game';
import type { GameState } from '@/application/game';
import type { Hand } from '@/domain/hand';
import type { Rng } from '@/lib/rng';
import { renderBattle } from '@/ui/screens/battle';
import { renderResult } from '@/ui/screens/result';
import { renderTitle } from '@/ui/screens/title';
import { renderUpgrade } from '@/ui/screens/upgrade';

export interface Actions {
  onStart(): void;
  onPlayHand(hand: Hand): void;
  onChooseUpgrade(hand: Hand): void;
  onBackToTitle(): void;
}

export function mountApp(root: HTMLElement, rng: Rng): void {
  let state: GameState = createGame();

  const actions: Actions = {
    onStart() {
      state = startGame(state);
      render();
    },
    onPlayHand(hand: Hand) {
      state = playHand(state, hand, rng);
      render();
    },
    onChooseUpgrade(hand: Hand) {
      state = chooseUpgrade(state, hand);
      render();
    },
    onBackToTitle() {
      state = backToTitle(state);
      render();
    },
  };

  function render(): void {
    root.innerHTML = '';

    let screen: HTMLElement;
    if (state.phase === 'title') {
      screen = renderTitle(state, actions);
    } else if (state.phase === 'battle') {
      screen = renderBattle(state, actions);
    } else if (state.phase === 'upgrade') {
      screen = renderUpgrade(state, actions);
    } else {
      screen = renderResult(state, actions);
    }

    root.appendChild(screen);
  }

  render();
}
