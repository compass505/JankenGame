import { describe, expect, it } from 'vitest';
import { HANDS, judge } from '@/domain/hand';
import type { Hand, Outcome } from '@/domain/hand';

describe('HANDS', () => {
  it('抽選と表示の順序は rock, scissors, paper で固定', () => {
    expect(HANDS).toEqual(['rock', 'scissors', 'paper']);
  });
});

describe('judge', () => {
  it('同じ手同士は必ず draw', () => {
    for (const hand of HANDS) {
      expect(judge(hand, hand)).toBe('draw');
    }
  });

  it('具体例: rock は scissors に勝つ', () => {
    expect(judge('rock', 'scissors')).toBe('win');
  });

  it('具体例: paper は scissors に負ける', () => {
    expect(judge('paper', 'scissors')).toBe('lose');
  });

  it('judge(a, b) が win なら judge(b, a) は lose（対称性）', () => {
    for (const a of HANDS) {
      for (const b of HANDS) {
        if (judge(a, b) === 'win') {
          expect(judge(b, a)).toBe('lose');
        }
      }
    }
  });

  it('judge(a, b) が lose なら judge(b, a) は win（対称性）', () => {
    for (const a of HANDS) {
      for (const b of HANDS) {
        if (judge(a, b) === 'lose') {
          expect(judge(b, a)).toBe('win');
        }
      }
    }
  });

  it('judge(a, b) が draw なら judge(b, a) も draw（対称性）', () => {
    for (const a of HANDS) {
      for (const b of HANDS) {
        if (judge(a, b) === 'draw') {
          expect(judge(b, a)).toBe('draw');
        }
      }
    }
  });

  it('9通りすべてが win 3 / lose 3 / draw 3 に分かれる', () => {
    const counts: Record<Outcome, number> = { win: 0, lose: 0, draw: 0 };

    for (const a of HANDS) {
      for (const b of HANDS) {
        counts[judge(a, b)] += 1;
      }
    }

    expect(counts).toEqual({ win: 3, lose: 3, draw: 3 });
  });

  it('グー>チョキ>パー>グーの循環になっている', () => {
    const beats: Record<Hand, Hand> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

    for (const winner of HANDS) {
      expect(judge(winner, beats[winner])).toBe('win');
    }
  });
});
