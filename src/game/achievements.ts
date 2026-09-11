import type { DealerGrade } from './gacha';

export type DealerPullCounts = Record<DealerGrade, number>;

export function emptyPullCounts(): DealerPullCounts {
  return { N: 0, R: 0, SR: 0, SSR: 0 };
}

export interface AchievementConfig {
  id: string;
  name: string;
  description: string;
  check: (pulls: DealerPullCounts) => boolean;
  /** 달성 시 영구 적용되는 전체 수익 배율. */
  incomeMultiplier: number;
}

function totalPulls(p: DealerPullCounts): number {
  return p.N + p.R + p.SR + p.SSR;
}

export const ACHIEVEMENTS: AchievementConfig[] = [
  { id: 'collect-n-5', name: '초보 컬렉터', description: '일반 등급 딜러 누적 5명 고용', check: (p) => p.N >= 5, incomeMultiplier: 1.03 },
  { id: 'collect-r-5', name: '레어 헌터', description: '레어 등급 딜러 누적 5명 고용', check: (p) => p.R >= 5, incomeMultiplier: 1.05 },
  { id: 'collect-sr-3', name: '슈퍼레어 마스터', description: '슈퍼레어 등급 딜러 누적 3명 고용', check: (p) => p.SR >= 3, incomeMultiplier: 1.08 },
  { id: 'collect-ssr-1', name: '전설의 시작', description: '전설 등급 딜러 누적 1명 고용', check: (p) => p.SSR >= 1, incomeMultiplier: 1.1 },
  { id: 'collect-ssr-3', name: '레전드 컬렉터', description: '전설 등급 딜러 누적 3명 고용', check: (p) => p.SSR >= 3, incomeMultiplier: 1.15 },
  { id: 'collect-total-20', name: '베테랑 스카우터', description: '누적 20명 고용', check: (p) => totalPulls(p) >= 20, incomeMultiplier: 1.05 },
  { id: 'collect-total-50', name: '전설의 스카우터', description: '누적 50명 고용', check: (p) => totalPulls(p) >= 50, incomeMultiplier: 1.1 },
];

export function achievementMultiplier(unlocked: readonly string[]): number {
  let mult = 1;
  for (const id of unlocked) {
    const cfg = ACHIEVEMENTS.find((a) => a.id === id);
    if (cfg) mult *= cfg.incomeMultiplier;
  }
  return mult;
}

/** 누적 수집 현황을 기준으로 새로 달성한 업적 id 목록을 반환(unlocked 배열은 직접 수정하지 않음). */
export function checkNewAchievements(pulls: DealerPullCounts, unlocked: readonly string[]): string[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.check(pulls)).map((a) => a.id);
}
