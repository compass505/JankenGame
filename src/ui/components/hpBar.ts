export function renderHpBar(label: string, hp: number, maxHp: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'hp-bar';

  const labelRow = document.createElement('div');
  labelRow.className = 'hp-bar__label';
  labelRow.textContent = `${label} ${hp} / ${maxHp}`;
  wrap.appendChild(labelRow);

  const track = document.createElement('div');
  track.className = 'hp-bar__track';

  const fill = document.createElement('div');
  fill.className = 'hp-bar__fill';
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  fill.style.width = `${ratio * 100}%`;
  track.appendChild(fill);

  wrap.appendChild(track);
  return wrap;
}
