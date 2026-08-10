import type { EnemyForecast } from '@/application/game';
import type { EnemyDef } from '@/domain/enemy';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import { HAND_LABEL, renderHandIcon } from '@/ui/components/handIcon';

const ABILITY_NAME_BY_ENEMY_ID: Readonly<Record<string, string>> = {
  scarecrow: '稽古用の身体',
  rockGuard: '岩壁の構え',
  shearBird: '風切りの構え',
  paperEnvoy: '折り重なる紙衣',
  glicoKing: '王の威圧',
};

/** 全敵の最大確率52%を収めつつ、差が読める固定目盛り。 */
const PROBABILITY_BAR_MAX = 0.6;

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

  const heading = document.createElement('div');
  heading.className = 'forecast__heading';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'forecast__eyebrow';
  eyebrow.textContent = '敵の戦術';
  heading.appendChild(eyebrow);

  const title = document.createElement('strong');
  title.className = 'forecast__title';
  title.textContent = ABILITY_NAME_BY_ENEMY_ID[enemy.id] ?? '固有能力';
  heading.appendChild(title);
  head.appendChild(heading);

  el.appendChild(head);
  el.appendChild(renderAbility(enemy));

  const rows = document.createElement('div');
  rows.className = 'forecast__rows';

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
    track.setAttribute(
      'aria-label',
      `${HAND_LABEL[hand]} ${formatProbability(forecast, hand)}%、バー上限60%`,
    );
    const fill = document.createElement('span');
    fill.className = 'forecast__fill';
    fill.style.width = `${String(Math.min(1, forecast.probability[hand] / PROBABILITY_BAR_MAX) * 100)}%`;
    track.appendChild(fill);
    row.appendChild(track);

    const percent = document.createElement('span');
    percent.className = 'forecast__percent';
    percent.textContent = `${formatProbability(forecast, hand)}%`;
    row.appendChild(percent);

    const damage = document.createElement('span');
    damage.className = 'forecast__damage';
    damage.textContent = `被弾 ${String(forecast.damage[hand])}`;
    row.appendChild(damage);

    rows.appendChild(row);
  }

  el.appendChild(rows);

  return el;
}

function renderAbility(enemy: EnemyDef): HTMLElement {
  const ability = document.createElement('div');
  ability.className = 'forecast__ability';

  const label = document.createElement('span');
  label.className = 'forecast__ability-label';
  label.textContent = '固有能力';
  ability.appendChild(label);

  const rules: string[] = [];
  for (const hand of HANDS) {
    const resistance = enemy.resistance[hand];
    if (resistance < 1) {
      rules.push(`${HAND_LABEL[hand]}のダメージ×${String(resistance)}`);
    }
  }
  if (enemy.drawRule === 'stareDouble') {
    rules.push('あいこ時のにらみ+2');
  }
  if (rules.length === 0) {
    rules.push('耐性なし', 'あいこ時のにらみ+1');
  }

  const detail = document.createElement('strong');
  detail.className = 'forecast__ability-detail';
  detail.textContent = rules.join('／');
  ability.appendChild(detail);
  return ability;
}

function formatProbability(forecast: EnemyForecast, hand: Hand): string {
  return formatPercent(forecast.probability[hand]);
}

function formatPercent(probability: number): string {
  return String(Math.round(probability * 100));
}
