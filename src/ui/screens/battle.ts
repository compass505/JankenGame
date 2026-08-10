import {
  currentEnemy,
  enemyForecast,
  handOutlook,
  heatPenalties,
  heatRecoveryPreview,
} from '@/application/game';
import type { GameState } from '@/application/game';
import { STAGES } from '@/data/stages';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import { renderEnemyForecast } from '@/ui/components/enemyForecast';
import { renderHandButton } from '@/ui/components/handButton';
import { renderHandClash } from '@/ui/components/handClash';
import { HAND_LABEL, renderHandIcon } from '@/ui/components/handIcon';
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

const HAND_ROLE: Readonly<Record<Hand, string>> = {
  rock: 'にらみで大技',
  scissors: '高い攻撃力',
  paper: '勝つと回復',
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
  const forecast = enemyForecast(state);
  const stareJustIncreased = log !== null && log.stareAfter > log.stareBefore;

  el.appendChild(renderStageProgress(state.stageIndex));

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

  if (log !== null && log.damageToEnemy > 0) {
    stage.appendChild(renderBattleEffect('hit'));
  } else if (log !== null && log.healToEnemy > 0) {
    stage.appendChild(renderBattleEffect('heal'));
  }

  const enemyHeader = document.createElement('div');
  enemyHeader.className = 'battle-stage__header';

  const enemyHeading = document.createElement('div');
  enemyHeading.className = 'battle-stage__heading';
  const stageLabel = document.createElement('span');
  stageLabel.className = 'battle-stage__stage-label';
  stageLabel.textContent = `第${String(state.stageIndex + 1)}戦`;
  enemyHeading.appendChild(stageLabel);
  const enemyName = document.createElement('strong');
  enemyName.className = 'battle-stage__enemy-name';
  enemyName.textContent = enemy.name;
  enemyHeading.appendChild(enemyName);
  enemyHeader.appendChild(enemyHeading);

  const phaseBadge = document.createElement('span');
  phaseBadge.className = 'battle-stage__phase';
  if (forecast?.phase === 'desperate') {
    phaseBadge.classList.add('battle-stage__phase--desperate');
    phaseBadge.textContent = '本気';
  } else {
    phaseBadge.textContent = '通常';
  }
  enemyHeader.appendChild(phaseBadge);
  stage.appendChild(enemyHeader);

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

  const enemyHp = renderHpBar('敵HP', battle.enemyHp, battle.enemyMaxHp);
  enemyHp.classList.add('hp-bar--enemy');
  stage.appendChild(enemyHp);

  enemyPanel.appendChild(stage);
  el.appendChild(enemyPanel);

  // ---- 直前の手合わせ。発生したターンだけ舞台の直下へ出す

  if (log !== null) {
    el.appendChild(renderHandClash(log));
  }

  // ---- 敵の戦術とにらみ（読み合いの材料）

  const intel = document.createElement('div');
  intel.className = 'battle-intel';
  if (forecast !== null) {
    intel.appendChild(renderEnemyForecast(forecast, enemy));
  }
  intel.appendChild(renderStareDisplay(battle.stare, stareJustIncreased));
  el.appendChild(intel);

  if (state.stageIndex === 0 && log === null) {
    el.appendChild(renderHandRoleGuide());
  }

  // ---- 自分

  const controls = document.createElement('section');
  controls.className = 'battle-controls';
  controls.setAttribute('aria-label', '自分の状態と手の選択');

  const playerPanel = document.createElement('div');
  playerPanel.className = 'player-panel';
  if (log !== null && log.damageToPlayer > 0) {
    playerPanel.classList.add('player-panel--hit');
  }
  playerPanel.appendChild(renderHpBar('自分', battle.playerHp, battle.playerMaxHp));

  if (log !== null && log.damageToPlayer > 0) {
    playerPanel.appendChild(renderBattleEffect('hit'));
  } else if (log !== null && log.healToPlayer > 0) {
    playerPanel.appendChild(renderBattleEffect('heal'));
  }

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

  controls.appendChild(playerPanel);

  // ---- 手のボタン

  const penalties = heatPenalties(state);
  const handRow = document.createElement('div');
  handRow.className = 'hand-row';

  for (const hand of HANDS) {
    handRow.appendChild(
      renderHandButton({
        hand,
        heatPenalty: penalties[hand],
        heatRecovery: heatRecoveryPreview(state, hand),
        outlook: handOutlook(state, hand) ?? undefined,
        resistance: enemy.resistance[hand],
        onClick: () => {
          actions.onPlayHand(hand);
        },
      }),
    );
  }

  controls.appendChild(handRow);
  el.appendChild(controls);

  return el;
}

function renderStageProgress(stageIndex: number): HTMLElement {
  const progress = document.createElement('nav');
  progress.className = 'stage-progress';
  progress.setAttribute('aria-label', `全${String(STAGES.length)}戦中、第${String(stageIndex + 1)}戦`);

  const count = document.createElement('strong');
  count.className = 'stage-progress__count';
  count.textContent = `BATTLE ${String(stageIndex + 1)} / ${String(STAGES.length)}`;
  progress.appendChild(count);

  const route = document.createElement('div');
  route.className = 'stage-progress__route';
  for (const [index, stage] of STAGES.entries()) {
    const step = document.createElement('span');
    step.className = 'stage-progress__step';
    if (index < stageIndex) {
      step.classList.add('stage-progress__step--complete');
    } else if (index === stageIndex) {
      step.classList.add('stage-progress__step--current');
    }
    if (index === STAGES.length - 1) {
      step.classList.add('stage-progress__step--boss');
    }
    step.title = `第${String(index + 1)}戦 ${stage.name}`;
    step.setAttribute('aria-label', step.title);
    route.appendChild(step);
  }
  progress.appendChild(route);
  return progress;
}

function renderHandRoleGuide(): HTMLElement {
  const guide = document.createElement('section');
  guide.className = 'hand-role-guide';
  guide.setAttribute('aria-label', '3つの手の役割');

  const heading = document.createElement('strong');
  heading.className = 'hand-role-guide__heading';
  heading.textContent = '3つの手は、勝ったときの強みが違う';
  guide.appendChild(heading);

  const roles = document.createElement('div');
  roles.className = 'hand-role-guide__roles';
  for (const hand of HANDS) {
    const role = document.createElement('div');
    role.className = 'hand-role-guide__role';
    role.appendChild(renderHandIcon(hand, 'hand-role-guide__icon'));

    const copy = document.createElement('span');
    const label = document.createElement('strong');
    label.textContent = HAND_LABEL[hand];
    copy.appendChild(label);
    copy.append(` ${HAND_ROLE[hand]}`);
    role.appendChild(copy);
    roles.appendChild(role);
  }
  guide.appendChild(roles);
  return guide;
}

function renderBattleEffect(kind: 'hit' | 'heal'): HTMLImageElement {
  const effect = document.createElement('img');
  effect.className = `battle-effect battle-effect--${kind}`;
  effect.src = `/assets/effect-${kind}.png`;
  effect.alt = '';
  effect.setAttribute('aria-hidden', 'true');
  return effect;
}
