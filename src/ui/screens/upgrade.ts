import { currentEnemy, upgradePreview } from '@/application/game';
import type { GameState } from '@/application/game';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import type { HandValue } from '@/domain/handTable';
import { canUpgrade } from '@/domain/handTable';
import { renderHandButton } from '@/ui/components/handButton';
import { renderEnemyDefeat } from '@/ui/components/enemyDefeat';
import type { Actions } from '@/ui/app';

/**
 * ダメージ以外の持ち味。ここを出さないと3手が非対称であることが伝わらない
 * （`docs/adr/0001-battle-model.md`）。
 *
 * **にらみ倍率は強化で伸びる**（グー。`docs/adr/0003-repetition-window.md`）ので、
 * 伸びる側は呼び出し側で前後を並べる。回復量は強化されない（終了保証）。
 */
function traitOf(value: HandValue): { label: string; value: string } | null {
  if (value.heal > 0) return { label: '勝つと回復', value: String(value.heal) };
  if (value.stareBonus > 0) return { label: 'にらみ1つで', value: `+${String(value.stareBonus)}` };
  return null;
}

/** 「3 → 4」の形。伸びない側は現在値だけを出す */
function renderChange(from: string, to: string | null): HTMLElement {
  const row = document.createElement('div');
  row.className = 'upgrade-values__damage';

  const fromEl = document.createElement('span');
  fromEl.className = 'upgrade-values__from';
  fromEl.textContent = from;
  row.appendChild(fromEl);

  if (to !== null) {
    const arrow = document.createElement('span');
    arrow.className = 'upgrade-values__arrow';
    arrow.textContent = '→';
    row.appendChild(arrow);

    const toEl = document.createElement('span');
    toEl.className = 'upgrade-values__to';
    toEl.textContent = to;
    row.appendChild(toEl);
  }

  return row;
}

export function renderUpgrade(state: GameState, actions: Actions): HTMLElement {
  const el = document.createElement('main');
  el.className = 'screen screen--upgrade';

  const defeatedEnemy = currentEnemy(state);
  if (defeatedEnemy !== null && state.battle?.outcome === 'playerWin') {
    el.classList.add('screen--after-win');
    el.appendChild(renderEnemyDefeat(defeatedEnemy, state.lastLog?.damageToEnemy ?? 0, false));
  }

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

  // 強化がどちらに乗るかは手ごとに違う（UPGRADE_TARGETS）。
  // **伸びる側にだけ矢印を出す。** ダメージ固定でグーに「3 → 3」と出すと、
  // 強化しても何も増えないように見える（ADR 0003 でにらみ倍率に移した）
  const damageGrows = upgradable && next.damage !== current.damage;
  wrap.appendChild(
    renderChange(String(current.damage), damageGrows ? String(next.damage) : null),
  );

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
    const nextTrait = traitOf(next);
    const traitGrows =
      upgradable && nextTrait !== null && nextTrait.value !== trait.value;

    const traitEl = document.createElement('div');
    traitEl.className = 'upgrade-values__trait';
    traitEl.textContent = trait.label;
    traitEl.appendChild(
      renderChange(trait.value, traitGrows && nextTrait !== null ? nextTrait.value : null),
    );
    wrap.appendChild(traitEl);
  }

  return wrap;
}
