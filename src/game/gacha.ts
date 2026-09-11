export type DealerGrade = 'N' | 'R' | 'SR' | 'SSR';

export interface GradeConfig {
  grade: DealerGrade;
  label: string;
  color: number;
  weight: number;
  /** 보유만 해도(배정 여부 무관) 전체 수익에 곱연산으로 누적되는 소량 배율 보너스. */
  passiveMultiplier: number;
  /** 테이블에 배정됐을 때 곱연산으로 적용되는 배율. */
  assignedMultiplier: number;
  /** 레벨업 시 등급별로 더 크게 오르는 배율 계수. */
  levelBonusMultiplier: number;
}

export const DEALER_GRADES: GradeConfig[] = [
  { grade: 'N', label: '일반', color: 0xcfcfcf, weight: 60, passiveMultiplier: 0.01, assignedMultiplier: 1.0, levelBonusMultiplier: 1.0 },
  { grade: 'R', label: '레어', color: 0x4ea8ff, weight: 28, passiveMultiplier: 0.025, assignedMultiplier: 1.15, levelBonusMultiplier: 1.15 },
  { grade: 'SR', label: '슈퍼레어', color: 0xc264ff, weight: 10, passiveMultiplier: 0.05, assignedMultiplier: 1.35, levelBonusMultiplier: 1.35 },
  { grade: 'SSR', label: '전설', color: 0xffc94d, weight: 2, passiveMultiplier: 0.1, assignedMultiplier: 1.75, levelBonusMultiplier: 1.75 },
];

export function gradeConfig(grade: DealerGrade): GradeConfig {
  const cfg = DEALER_GRADES.find((g) => g.grade === grade);
  if (!cfg) throw new Error(`Unknown dealer grade: ${grade}`);
  return cfg;
}

/**
 * 가챠 등급 추첨. rateMultiplier는 SR/SSR 가중치에만 곱해져 고급 등급 확률을 끌어올린다
 * (전직 효과 등으로 사용).
 */
export function rollGrade(rateMultiplier = 1): DealerGrade {
  const boosted = DEALER_GRADES.map((g) => ({
    grade: g.grade,
    weight: g.grade === 'SR' || g.grade === 'SSR' ? g.weight * rateMultiplier : g.weight,
  }));
  const total = boosted.reduce((sum, g) => sum + g.weight, 0);
  let r = Math.random() * total;
  for (const g of boosted) {
    if (r < g.weight) return g.grade;
    r -= g.weight;
  }
  return 'N';
}
