import { currentEnemy, damagePreview, enemyForecast, heatPenalties } from '@/application/game';
import type { GameState } from '@/application/game';
import { HANDS } from '@/domain/hand';
import { renderEnemyForecast } from '@/ui/components/enemyForecast';
import { renderHandButton } from '@/ui/components/handButton';
import { renderHandClash } from '@/ui/components/handClash';
import { renderHpBar } from '@/ui/components/hpBar';
import { renderStareDisplay } from '@/ui/components/stareDisplay';
import type { Actions } from '@/ui/app';

const BATTLE_BACKGROUND_BY_ENEMY_ID: Readonly<Record<string, string>> = {
  scarecrow: '/assets/battle-bg-scarecrow.png',
  rockGuard: '/assets/battle-bg-rockGuard.png',
  shearBird: '/assets/battle-bg-shearBird.png',
  paperEnvoy: '/assets/battle-bg-paperEnvoy.png',
  glicoKing: '/assets/battle-bg-glicoKing.png',
};

export function renderBattle(state: GameState, actions: Actions): HTMLElement {
  const el = document.createElement('main');
  el.className = 'screen screen--battle';

  const enemy = currentEnemy(state);
  const battle = state.battle;

  if (enemy === null || battle === null) {
    return el;
  }

  const log = state.lastLog;

  // ---- 敵と舞台

  const enemyPanel = document.createElement('div');
  enemyPanel.className = 'enemy-panel';

  const stage = document.createElement('div');
  stage.className = 'battle-stage';
  // 背景画像がまだ無い間も敵ごとに舞台の色を変える（docs/10「素材待ちで実装を止めない」）
  stage.dataset['enemy'] = enemy.id;
  const background = BATTLE_BACKGROUND_BY_ENEMY_ID[enemy.id];
  if (background !== undefined) {
    stage.style.setProperty('--battle-background', `url("${background}")`);
  }

  const portrait = document.createElement('img');
  portrait.className = 'enemy-panel__portrait';
  if (enemy.id === 'glicoKing') {
    portrait.classList.add('enemy-panel__portrait--boss');
  }
  // 殴られた／殴ったターンだけ反応させる。毎ターン動かすと何も伝わらない
  if (log !== null && log.damageToEnemy > 0) {
    portrait.classList.add('enemy-panel__portrait--hit');
  } else if (log !== null && log.damageToPlayer > 0) {
    portrait.classList.add('enemy-panel__portrait--attack');
  }
  portrait.src = `/assets/enemy-${enemy.id}.png`;
  portrait.alt = enemy.name;
  stage.appendChild(portrait);

  const nameplate = document.createElement('div');
  nameplate.className = 'battle-stage__nameplate';
  nameplate.textContent = enemy.name;
  stage.appendChild(nameplate);

  if (log !== null && log.damageToEnemy > 0) {
    const pop = document.createElement('div');
    pop.className = 'damage-pop damage-pop--enemy';
    pop.textContent = `-${String(log.damageToEnemy)}`;
    stage.appendChild(pop);
  }
  if (log !== null && log.healToEnemy > 0) {
    const pop = document.createElement('div');
    pop.className = 'damage-pop damage-pop--enemy damage-pop--heal';
    pop.textContent = `+${String(log.healToEnemy)}`;
    stage.appendChild(pop);
  }

  enemyPanel.appendChild(stage);
  enemyPanel.appendChild(renderHpBar('敵', battle.enemyHp, battle.enemyMaxHp));
  el.appendChild(enemyPanel);

  // ---- 敵の手の予報（読み合いの材料）

  const forecast = enemyForecast(state);
  if (forecast !== null) {
    el.appendChild(renderEnemyForecast(forecast, enemy));
  }

  // ---- にらみ

  const stareJustIncreased = log !== null && log.stareAfter > log.stareBefore;
  el.appendChild(renderStareDisplay(battle.stare, stareJustIncreased));

  // ---- 直前の手合わせ

  if (log !== null) {
    el.appendChild(renderHandClash(log));
  }

  // ---- 自分

  const playerPanel = document.createElement('div');
  playerPanel.className = 'player-panel';
  if (log !== null && log.damageToPlayer > 0) {
    playerPanel.classList.add('player-panel--hit');
  }
  playerPanel.appendChild(renderHpBar('自分', battle.playerHp, battle.playerMaxHp));

  if (log !== null && log.damageToPlayer > 0) {
    const pop = document.createElement('div');
    pop.className = 'damage-pop damage-pop--player';
    pop.textContent = `-${String(log.damageToPlayer)}`;
    playerPanel.appendChild(pop);
  }
  if (log !== null && log.healToPlayer > 0) {
    const pop = document.createElement('div');
    pop.className = 'damage-pop damage-pop--player damage-pop--heal';
    pop.textContent = `+${String(log.healToPlayer)}`;
    playerPanel.appendChild(pop);
  }

  el.appendChild(playerPanel);

  // ---- 手のボタン

  const penalties = heatPenalties(state);
  const handRow = document.createElement('div');
  handRow.className = 'hand-row';

  for (const hand of HANDS) {
    handRow.appendChild(
      renderHandButton({
        hand,
        damagePreview: damagePreview(state, hand),
        heatPenalty: penalties[hand],
        resistance: enemy.resistance[hand],
        onClick: () => {
          actions.onPlayHand(hand);
        },
      }),
    );
  }

  el.appendChild(handRow);

  return el;
}
