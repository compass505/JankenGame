import { upgradePreview } from '@/application/game';
import type { GameState } from '@/application/game';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import type { HandValue } from '@/domain/handTable';
import { canUpgrade } from '@/domain/handTable';
import { renderHandButton } from '@/ui/components/handButton';
import type { Actions } from '@/ui/app';

/**
 * ダメージ以外の持ち味。ここを出さないと3手が非対称であることが伝わらない
 * （`docs/adr/0001-battle-model.md`）。強化しても動かない値なので、前後は並べない。
 */
function traitOf(value: HandValue): string | null {
  if (value.heal > 0) return `勝つと ${String(value.heal)} 回復`;
  if (value.stareBonus > 0) return `にらみ1つで +${String(value.stareBonus)}`;
  return null;
}

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
    // 「上限」は値のあとに出す。renderHandButton に任せると
    // ラベルと数字の間に入り、「上限5」と読めてしまう
    const button = renderHandButton({
      hand,
      disabled: !upgradable,
      onClick: () => {
        actions.onChooseUpgrade(hand);
      },
    });
    button.appendChild(renderUpgradeValues(state, hand, upgradable));
    choices.appendChild(button);
  }

  el.appendChild(choices);
  return el;
}

/** 現在値と強化後の値。上限の手は現在値だけを出す */
function renderUpgradeValues(state: GameState, hand: Hand, upgradable: boolean): HTMLElement {
  const { current, next } = upgradePreview(state, hand);

  const wrap = document.createElement('div');
  wrap.className = 'upgrade-values';

  const damage = document.createElement('div');
  damage.className = 'upgrade-values__damage';

  const from = document.createElement('span');
  from.className = 'upgrade-values__from';
  from.textContent = String(current.damage);
  damage.appendChild(from);

  if (upgradable) {
    const arrow = document.createElement('span');
    arrow.className = 'upgrade-values__arrow';
    arrow.textContent = '→';
    damage.appendChild(arrow);

    const to = document.createElement('span');
    to.className = 'upgrade-values__to';
    to.textContent = String(next.damage);
    damage.appendChild(to);
  }

  wrap.appendChild(damage);

  // 「ダメージ」は別行にする。数字と同じ行に置くと狭い画面で折り返す
  const unit = document.createElement('div');
  unit.className = 'upgrade-values__unit';
  unit.textContent = 'ダメージ';
  wrap.appendChild(unit);

  if (!upgradable) {
    const cap = document.createElement('div');
    cap.className = 'upgrade-values__cap';
    cap.textContent = '上限';
    wrap.appendChild(cap);
  }

  const trait = traitOf(current);
  if (trait !== null) {
    const traitEl = document.createElement('div');
    traitEl.className = 'upgrade-values__trait';
    traitEl.textContent = trait;
    wrap.appendChild(traitEl);
  }

  return wrap;
}
