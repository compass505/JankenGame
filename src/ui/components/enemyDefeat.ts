import type { EnemyDef } from '@/domain/enemy';

interface DefeatPresentation {
  readonly line: string;
  readonly effectLabel: string;
}

const DEFEAT_PRESENTATION: Readonly<Record<string, DefeatPresentation>> = {
  scarecrow: {
    line: '夕風に、わらの身体がほどけていく。',
    effectLabel: '散るわら',
  },
  rockGuard: {
    line: '守り抜いた岩の鎧が、ついに砕けた。',
    effectLabel: '砕ける岩片',
  },
  shearBird: {
    line: '鋭い羽根が舞い、空の番人が翼を畳む。',
    effectLabel: '舞う羽根',
  },
  paperEnvoy: {
    line: '無数の書状となって、静かに散っていく。',
    effectLabel: '散る紙片',
  },
  glicoKing: {
    line: '黄金の威光がほどけ、王冠が戦場に落ちる。',
    effectLabel: '砕ける王冠の光',
  },
};

export function renderEnemyDefeat(
  enemy: EnemyDef,
  finalBlow: number,
  isFinal: boolean,
): HTMLElement {
  const presentation = DEFEAT_PRESENTATION[enemy.id] ?? {
    line: '激闘の末、敵は力尽きた。',
    effectLabel: '決着の光',
  };

  const card = document.createElement('section');
  card.className = 'enemy-defeat';
  if (isFinal) {
    card.classList.add('enemy-defeat--final');
  }
  card.dataset['enemy'] = enemy.id;
  card.style.setProperty('--defeat-background', `url("/assets/battle-bg-${enemy.id}.png")`);
  card.setAttribute('aria-label', `${enemy.name}を撃破`);

  const flash = document.createElement('div');
  flash.className = 'enemy-defeat__flash';
  flash.setAttribute('aria-hidden', 'true');
  card.appendChild(flash);

  const portrait = document.createElement('img');
  portrait.className = 'enemy-defeat__portrait';
  portrait.src = `/assets/enemy-${enemy.id}.png`;
  portrait.alt = '';
  portrait.setAttribute('aria-hidden', 'true');
  card.appendChild(portrait);

  const particles = document.createElement('div');
  particles.className = 'enemy-defeat__particles';
  particles.dataset['effect'] = presentation.effectLabel;
  particles.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 10; index += 1) {
    const particle = document.createElement('span');
    particle.className = 'enemy-defeat__particle';
    particle.style.setProperty('--particle-x', `${String(13 + index * 3.7)}%`);
    particle.style.setProperty('--particle-delay', `${String(0.08 + index * 0.035)}s`);
    particles.appendChild(particle);
  }
  card.appendChild(particles);

  const copy = document.createElement('div');
  copy.className = 'enemy-defeat__copy';

  const mark = document.createElement('span');
  mark.className = 'enemy-defeat__mark';
  mark.textContent = isFinal ? 'FINAL ENEMY DEFEATED' : 'ENEMY DEFEATED';
  copy.appendChild(mark);

  const title = document.createElement('strong');
  title.className = 'enemy-defeat__title';
  title.textContent = `${enemy.name} 撃破`;
  copy.appendChild(title);

  const line = document.createElement('span');
  line.className = 'enemy-defeat__line';
  line.textContent = presentation.line;
  copy.appendChild(line);

  if (finalBlow > 0) {
    const blow = document.createElement('span');
    blow.className = 'enemy-defeat__blow';
    blow.textContent = `決着の一撃 ${String(finalBlow)} DAMAGE`;
    copy.appendChild(blow);
  }

  card.appendChild(copy);
  return card;
}
