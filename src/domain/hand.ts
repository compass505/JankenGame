export type Hand = 'rock' | 'scissors' | 'paper';
export type Outcome = 'win' | 'lose' | 'draw';

/** 抽選と表示の順序。この順序は固定する（乱数の再現性が依存する） */
export const HANDS: readonly Hand[] = ['rock', 'scissors', 'paper'];

const BEATS: Readonly<Record<Hand, Hand>> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
};

/** プレイヤー視点の勝敗。グー>チョキ>パー>グー */
export function judge(player: Hand, enemy: Hand): Outcome {
  if (player === enemy) {
    return 'draw';
  }

  return BEATS[player] === enemy ? 'win' : 'lose';
}
