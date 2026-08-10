import {
  backToTitle,
  chooseUpgrade,
  createGame,
  currentEnemy,
  enemyForecast,
  playHand,
  startGame,
} from '@/application/game';
import type { GameState } from '@/application/game';
import type { Hand } from '@/domain/hand';
import type { Rng } from '@/lib/rng';
import {
  playJankenPresentation,
  playPhaseShiftPresentation,
} from '@/ui/components/battlePresentation';
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
  let presentationLocked = false;

  const actions: Actions = {
    onStart() {
      state = startGame(state);
      render();
    },
    onPlayHand(hand: Hand) {
      if (presentationLocked) {
        return;
      }

      const phaseBefore = enemyForecast(state)?.phase ?? null;
      const nextState = playHand(state, hand, rng);
      const log = nextState.lastLog;
      if (log === null) {
        state = nextState;
        render();
        return;
      }

      presentationLocked = true;
      playJankenPresentation(root, log, () => {
        state = nextState;
        render();

        const phaseAfter = enemyForecast(state)?.phase ?? null;
        const enemy = currentEnemy(state);
        if (
          state.phase === 'battle' &&
          phaseBefore === 'normal' &&
          phaseAfter === 'desperate' &&
          enemy !== null
        ) {
          playPhaseShiftPresentation(root, enemy, () => {
            presentationLocked = false;
          });
        } else {
          presentationLocked = false;
        }
      });
    },
    onChooseUpgrade(hand: Hand) {
      state = chooseUpgrade(state, hand);
      render();
    },
    onBackToTitle() {
      presentationLocked = false;
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
