import type { Hand } from '@/domain/hand';

const HAND_LABEL: Readonly<Record<Hand, string>> = {
  rock: 'グー',
  scissors: 'チョキ',
  paper: 'パー',
};

export interface HandButtonOptions {
  readonly hand: Hand;
  readonly damagePreview?: number;
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

  if (options.damagePreview !== undefined) {
    const damage = document.createElement('div');
    damage.className = 'hand-button__damage';
    damage.textContent = `${options.damagePreview} ダメージ`;
    button.appendChild(damage);
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
