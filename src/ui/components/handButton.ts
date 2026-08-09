import type { Hand } from '@/domain/hand';

const HAND_LABEL: Readonly<Record<Hand, string>> = {
  rock: 'グー',
  scissors: 'チョキ',
  paper: 'パー',
};

export interface HandButtonOptions {
  readonly hand: Hand;
  readonly damagePreview?: number;
  /** 熱による弱化量（0〜HEAT_MAX_PENALTY）。0 なら何も出さない */
  readonly heatPenalty?: number;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly onClick: () => void;
}

export function renderHandButton(options: HandButtonOptions): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hand-button';
  button.disabled = options.disabled ?? false;

  const icon = document.createElement('img');
  icon.className = 'hand-button__icon';
  icon.src = `/assets/hand-${options.hand}.png`;
  icon.alt = HAND_LABEL[options.hand];
  button.appendChild(icon);

  const label = document.createElement('div');
  label.className = 'hand-button__label';
  label.textContent = HAND_LABEL[options.hand];
  button.appendChild(label);

  const heatPenalty = options.heatPenalty ?? 0;

  if (options.damagePreview !== undefined) {
    const damage = document.createElement('div');
    damage.className = 'hand-button__damage';
    damage.textContent = `${options.damagePreview} ダメージ`;
    button.appendChild(damage);
  }

  // 熱で弱っていることが一目で分かるようにする。深いほど強く見せる（docs/03 節7）
  if (heatPenalty > 0) {
    button.classList.add('hand-button--heated');

    const heat = document.createElement('div');
    heat.className = 'hand-button__heat';
    heat.dataset['level'] = String(heatPenalty);
    heat.textContent = `-${heatPenalty} 熱`;
    button.appendChild(heat);
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
