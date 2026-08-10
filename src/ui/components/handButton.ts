import type { HandOutlook } from '@/application/game';
import type { Hand } from '@/domain/hand';
import { HAND_LABEL, renderHandIcon } from '@/ui/components/handIcon';

export interface HandButtonOptions {
  readonly hand: Hand;
  /** いま出して勝ったときの実ダメージ。必ず application の damagePreview を渡す */
  readonly damagePreview?: number;
  /** 連打による弱化量（0〜HEAT_RULE.maxPenalty）。0 なら何も出さない */
  readonly heatPenalty?: number;
  /** この手を選んだときの3結果。戦闘中だけ渡す。 */
  readonly outlook?: HandOutlook;
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

  if (options.outlook !== undefined) {
    button.appendChild(renderOutlook(options.outlook));
  } else if (options.damagePreview !== undefined) {
    const damage = document.createElement('div');
    damage.className = 'hand-button__damage';
    damage.textContent = `${String(options.damagePreview)} ダメージ`;
    button.appendChild(damage);
  }

  const badges = document.createElement('div');
  badges.className = 'hand-button__badges';

  // 連打で弱っていることが一目で分かるようにする。深いほど強く見せる（docs/03 節7）。
  // 「溜まって冷める」ではなく「同じ手ばかり出している」ので、そう書く（ADR 0003）
  if (heatPenalty > 0) {
    button.classList.add('hand-button--heated');

    const heat = document.createElement('div');
    heat.className = 'hand-button__heat';
    heat.dataset['level'] = String(heatPenalty);

    const current = document.createElement('strong');
    current.className = 'hand-button__heat-current';
    current.textContent = `連打 -${String(heatPenalty)}`;
    heat.appendChild(current);

    // 直近の窓から外れれば戻るので、逃げ道を一言で出す
    const relief = document.createElement('span');
    relief.className = 'hand-button__heat-relief';
    relief.textContent = '散らせば戻る';
    heat.appendChild(relief);

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

function renderOutlook(outlook: HandOutlook): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'hand-button__outlook';

  const winValue = `敵 -${String(outlook.onWin)}${outlook.healOnWin > 0 ? ` / HP +${String(outlook.healOnWin)}` : ''}`;
  wrap.appendChild(renderOutlookRow('win', '勝ち', winValue));

  const drawValue =
    outlook.stareOnDraw > 0
      ? `にらみ +${String(outlook.stareOnDraw)}`
      : `双方 -${String(outlook.damageOnDraw)}`;
  wrap.appendChild(renderOutlookRow('draw', 'あいこ', drawValue));
  wrap.appendChild(renderOutlookRow('lose', '負け', `自分 -${String(outlook.worstOnLose)}`));

  if (outlook.heatCost > 0) {
    const cost = document.createElement('div');
    cost.className = 'hand-button__future-heat';
    cost.textContent = `使うと次から -${String(outlook.heatCost)}`;
    wrap.appendChild(cost);
  }

  return wrap;
}

function renderOutlookRow(
  kind: 'win' | 'draw' | 'lose',
  label: string,
  value: string,
): HTMLElement {
  const row = document.createElement('div');
  row.className = `hand-button__outlook-row hand-button__outlook-row--${kind}`;

  const labelEl = document.createElement('span');
  labelEl.className = 'hand-button__outlook-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valueEl = document.createElement('strong');
  valueEl.textContent = value;
  row.appendChild(valueEl);
  return row;
}
