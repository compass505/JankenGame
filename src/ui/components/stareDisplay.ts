import { assetUrl } from '@/ui/assetUrl';
export function renderStareDisplay(stare: number, justIncreased: boolean): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'stare-display';
  if (justIncreased) {
    wrap.classList.add('stare-display--pulse');

    const effect = document.createElement('img');
    effect.className = 'stare-display__effect';
    effect.src = assetUrl('effect-stare.png');
    effect.alt = '';
    effect.setAttribute('aria-hidden', 'true');
    wrap.appendChild(effect);
  }

  const label = document.createElement('div');
  label.className = 'stare-display__label';
  label.textContent = 'にらみ';
  wrap.appendChild(label);

  const value = document.createElement('div');
  value.className = 'stare-display__value';
  value.textContent = String(stare);
  wrap.appendChild(value);

  return wrap;
}
