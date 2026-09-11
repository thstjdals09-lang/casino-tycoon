export type CustomerGrade = 'C' | 'B' | 'A' | 'S';

export interface CustomerGradeConfig {
  grade: CustomerGrade;
  label: string;
  color: number;
  weight: number;
  /** 테이블 수익에 곱연산으로 적용되는 배율(손님이 얼마나 돈을 잘 쓰는지). */
  spendMultiplier: number;
  /** 바 음료 매출에 곱연산으로 적용되는 배율. */
  drinkMultiplier: number;
}

export const CUSTOMER_GRADES: CustomerGradeConfig[] = [
  { grade: 'C', label: '일반 손님', color: 0xcfcfcf, weight: 55, spendMultiplier: 1.15, drinkMultiplier: 1.0 },
  { grade: 'B', label: '단골 손님', color: 0x4ea8ff, weight: 28, spendMultiplier: 1.3, drinkMultiplier: 1.3 },
  { grade: 'A', label: '큰손', color: 0xc264ff, weight: 13, spendMultiplier: 1.55, drinkMultiplier: 1.7 },
  { grade: 'S', label: 'VIP', color: 0xffc94d, weight: 4, spendMultiplier: 2.0, drinkMultiplier: 2.5 },
];

export function customerGradeConfig(grade: CustomerGrade): CustomerGradeConfig {
  const cfg = CUSTOMER_GRADES.find((g) => g.grade === grade);
  if (!cfg) throw new Error(`Unknown customer grade: ${grade}`);
  return cfg;
}

/**
 * 손님 등급 추첨. designBonus(0 이상)가 클수록 C를 제외한 등급의 가중치가 커진다
 * (매장 디자인 레벨이 오를수록 돈 잘 쓰는 손님이 올 확률이 높아짐).
 */
export function rollCustomerGrade(designBonus = 0): CustomerGrade {
  const boosted = CUSTOMER_GRADES.map((g) => ({
    grade: g.grade,
    weight: g.grade === 'C' ? g.weight : g.weight * (1 + designBonus),
  }));
  const total = boosted.reduce((sum, g) => sum + g.weight, 0);
  let r = Math.random() * total;
  for (const g of boosted) {
    if (r < g.weight) return g.grade;
    r -= g.weight;
  }
  return 'C';
}
