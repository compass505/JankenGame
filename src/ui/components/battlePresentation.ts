import type { TurnLog } from '@/domain/battle';
import type { EnemyDef } from '@/domain/enemy';
import { renderHandIcon } from '@/ui/components/handIcon';

const OUTCOME_COPY = {
  win: { mark: 'WIN', label: 'あなたの勝ち！' },
  lose: { mark: 'LOSE', label: 'あなたの負け…' },
  draw: { mark: 'DRAW', label: 'あいこ' },
} as const;

/** 手を選んだ直後、結果画面へ切り替える前に「じゃん・けん・ぽん」を見せる。 */
export function playJankenPresentation(
  host: HTMLElement,
  log: TurnLog,
  onComplete: () => void,
): void {
  const overlay = document.createElement('section');
  overlay.className = `janken-presentation janken-presentation--${log.outcome}`;
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-label', `じゃん、けん、ぽん。${OUTCOME_COPY[log.outcome].label}`);

  const burst = document.createElement('div');
  burst.className = 'janken-presentation__burst';
  burst.setAttribute('aria-hidden', 'true');
  overlay.appendChild(burst);

  const rhythm = document.createElement('div');
  rhythm.className = 'janken-presentation__rhythm';
  for (const [index, word] of ['じゃん', 'けん', 'ぽん！'].entries()) {
    const wordEl = document.createElement('span');
    wordEl.className = 'janken-presentation__word';
    wordEl.dataset['step'] = String(index + 1);
    wordEl.textContent = word;
    rhythm.appendChild(wordEl);
  }
  overlay.appendChild(rhythm);

  const duel = document.createElement('div');
  duel.className = 'janken-presentation__duel';

  const player = document.createElement('div');
  player.className = 'janken-presentation__hand janken-presentation__hand--player';
  player.classList.add(
    log.outcome === 'win'
      ? 'janken-presentation__hand--winner'
      : log.outcome === 'lose'
        ? 'janken-presentation__hand--loser'
        : 'janken-presentation__hand--draw',
  );
  const playerLabel = document.createElement('span');
  playerLabel.textContent = 'YOU';
  player.appendChild(playerLabel);
  player.appendChild(renderHandIcon(log.playerHand, 'janken-presentation__icon'));
  duel.appendChild(player);

  const impact = document.createElement('div');
  impact.className = 'janken-presentation__impact';
  impact.textContent = 'VS';
  duel.appendChild(impact);

  const enemy = document.createElement('div');
  enemy.className = 'janken-presentation__hand janken-presentation__hand--enemy';
  enemy.classList.add(
    log.outcome === 'lose'
      ? 'janken-presentation__hand--winner'
      : log.outcome === 'win'
        ? 'janken-presentation__hand--loser'
        : 'janken-presentation__hand--draw',
  );
  const enemyLabel = document.createElement('span');
  enemyLabel.textContent = 'ENEMY';
  enemy.appendChild(enemyLabel);
  enemy.appendChild(renderHandIcon(log.enemyHand, 'janken-presentation__icon'));
  duel.appendChild(enemy);

  overlay.appendChild(duel);
  overlay.appendChild(renderJankenResult(log));
  host.appendChild(overlay);

  window.setTimeout(
    () => {
      overlay.remove();
      onComplete();
    },
    prefersReducedMotion() ? 220 : 1500,
  );
}

function renderJankenResult(log: TurnLog): HTMLElement {
  const result = document.createElement('div');
  result.className = 'janken-presentation__result';

  const mark = document.createElement('span');
  mark.className = 'janken-presentation__result-mark';
  mark.textContent = OUTCOME_COPY[log.outcome].mark;
  result.appendChild(mark);

  const label = document.createElement('strong');
  label.className = 'janken-presentation__result-label';
  label.textContent = OUTCOME_COPY[log.outcome].label;
  result.appendChild(label);

  const changes = document.createElement('div');
  changes.className = 'janken-presentation__changes';
  if (log.damageToEnemy > 0) {
    changes.appendChild(renderChange('damage', `敵HP -${String(log.damageToEnemy)}`));
  }
  if (log.damageToPlayer > 0) {
    changes.appendChild(renderChange('damage', `自分HP -${String(log.damageToPlayer)}`));
  }
  if (log.healToPlayer > 0) {
    changes.appendChild(renderChange('heal', `自分HP +${String(log.healToPlayer)}`));
  }
  if (log.healToEnemy > 0) {
    changes.appendChild(renderChange('heal', `敵HP +${String(log.healToEnemy)}`));
  }
  if (log.stareAfter > log.stareBefore) {
    changes.appendChild(renderChange('stare', `にらみ +${String(log.stareAfter - log.stareBefore)}`));
  }
  if (changes.childElementCount > 0) {
    result.appendChild(changes);
  }

  return result;
}

function renderChange(kind: 'damage' | 'heal' | 'stare', text: string): HTMLElement {
  const change = document.createElement('span');
  change.className = `janken-presentation__change janken-presentation__change--${kind}`;
  change.textContent = text;
  return change;
}

/** 敵HPが半分を切ったターンに、戦闘画面全体へ本気化を割り込ませる。 */
export function playPhaseShiftPresentation(
  host: HTMLElement,
  enemy: EnemyDef,
  onComplete: () => void,
): void {
  const overlay = document.createElement('section');
  overlay.className = 'phase-shift';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-label', `${enemy.name}が本気モードに移行`);

  const scan = document.createElement('div');
  scan.className = 'phase-shift__scan';
  scan.setAttribute('aria-hidden', 'true');
  overlay.appendChild(scan);

  const portrait = document.createElement('img');
  portrait.className = 'phase-shift__portrait';
  portrait.src = `/assets/enemy-${enemy.id}.png`;
  portrait.alt = '';
  portrait.setAttribute('aria-hidden', 'true');
  overlay.appendChild(portrait);

  const copy = document.createElement('div');
  copy.className = 'phase-shift__copy';
  const alert = document.createElement('span');
  alert.className = 'phase-shift__alert';
  alert.textContent = 'TACTIC SHIFT';
  copy.appendChild(alert);
  const title = document.createElement('strong');
  title.className = 'phase-shift__title';
  title.textContent = '本気モード';
  copy.appendChild(title);
  const detail = document.createElement('span');
  detail.className = 'phase-shift__detail';
  detail.textContent = `${enemy.name}が本気の構えに移行した`;
  copy.appendChild(detail);
  overlay.appendChild(copy);

  host.appendChild(overlay);
  window.setTimeout(
    () => {
      overlay.remove();
      onComplete();
    },
    prefersReducedMotion() ? 180 : 1500,
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
