import type { EnemyForecast } from '@/application/game';
import type { EnemyDef } from '@/domain/enemy';
import { HANDS } from '@/domain/hand';
import { HAND_LABEL, renderHandIcon } from '@/ui/components/handIcon';

/**
 * 敵が次に出す手の確率と、その手で敵が勝ったときに受けるダメージ。
 *
 * **これが無いと、プレイヤーは勘で手を選ぶことになり運ゲーに見える**
 * （`docs/01_requirements.md` は敵の偏りを公開情報と定めている）。
 */
export function renderEnemyForecast(forecast: EnemyForecast, enemy: EnemyDef): HTMLElement {
  const el = document.createElement('div');
  el.className = 'forecast';
  if (forecast.phase === 'desperate') {
    el.classList.add('forecast--desperate');
  }

  const head = document.createElement('div');
  head.className = 'forecast__head';

  const title = document.createElement('span');
  title.className = 'forecast__title';
  title.textContent = '相手の手';
  head.appendChild(title);

  const phase = document.createElement('span');
  phase.className = 'forecast__phase';
  phase.textContent = forecast.phase === 'desperate' ? '手負い・手が変わった' : enemy.hint;
  head.appendChild(phase);

  el.appendChild(head);

  for (const hand of HANDS) {
    const row = document.createElement('div');
    row.className = 'forecast__row';

    row.appendChild(renderHandIcon(hand, 'forecast__icon'));

    const name = document.createElement('span');
    name.className = 'forecast__name';
    name.textContent = HAND_LABEL[hand];
    row.appendChild(name);

    const track = document.createElement('span');
    track.className = 'forecast__track';
    const fill = document.createElement('span');
    fill.className = 'forecast__fill';
    fill.style.width = `${String(Math.round(forecast.probability[hand] * 100))}%`;
    track.appendChild(fill);
    row.appendChild(track);

    const percent = document.createElement('span');
    percent.className = 'forecast__percent';
    percent.textContent = `${String(Math.round(forecast.probability[hand] * 100))}%`;
    row.appendChild(percent);

    const damage = document.createElement('span');
    damage.className = 'forecast__damage';
    damage.textContent = `負けたら -${String(forecast.damage[hand])}`;
    row.appendChild(damage);

    el.appendChild(row);
  }

  return el;
}
