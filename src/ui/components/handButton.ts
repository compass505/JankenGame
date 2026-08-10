import type { Hand } from '@/domain/hand';
import { HAND_LABEL, renderHandIcon } from '@/ui/components/handIcon';

export interface HandButtonOptions {
  readonly hand: Hand;
  /** いま出して勝ったときの実ダメージ。必ず application の damagePreview を渡す */
  readonly damagePreview?: number;
  /** 熱による弱化量（0〜HEAT_MAX_PENALTY）。0 なら何も出さない */
  readonly heatPenalty?: number;
  /** この敵のこの手への耐性。1 なら何も出さない */
  readonly resistance?: number;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly onClick: () => void;
}

export function renderHandButton(options: HandButtonOptions): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hand-button';
  button.disabled = options.disabled ?? false;

  button.appendChild(renderHandIcon(options.hand, 'hand-button__icon'));

  const label = document.createElement('div');
  label.className = 'hand-button__label';
  label.textContent = HAND_LABEL[options.hand];
  button.appendChild(label);

  const heatPenalty = options.heatPenalty ?? 0;

  if (options.damagePreview !== undefined) {
    const damage = document.createElement('div');
    damage.className = 'hand-button__damage';
    damage.textContent = `${String(options.damagePreview)} ダメージ`;
    button.appendChild(damage);
  }

  const badges = document.createElement('div');
  badges.className = 'hand-button__badges';

  // 熱で弱っていることが一目で分かるようにする。深いほど強く見せる（docs/03 節7）
  if (heatPenalty > 0) {
    button.classList.add('hand-button--heated');

    const heat = document.createElement('div');
    heat.className = 'hand-button__heat';
    heat.dataset['level'] = String(heatPenalty);
    heat.textContent = `-${String(heatPenalty)} 熱`;
    badges.appendChild(heat);
  }

  // 耐性は与ダメージに効くので、与ダメージの隣に出す（docs/03 節7）
  const resistance = options.resistance ?? 1;
  if (resistance !== 1) {
    button.classList.add('hand-button--resisted');

    const resist = document.createElement('div');
    resist.className = 'hand-button__resist';
    resist.textContent = `耐性 ×${String(resistance)}`;
    badges.appendChild(resist);
  }

  if (badges.childElementCount > 0) {
    button.appendChild(badges);
  }

  if (options.disabled && options.disabledReason !== undefined) {
    const reason = document.createElement('div');
    reason.className = 'hand-button__reason';
    reason.textContent = options.disabledReason;
    button.appendChild(reason);
  }

  button.addEventListener('click', options.onClick);
  return button;
}
