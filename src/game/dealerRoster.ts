import type { DealerGrade } from './gacha';

export type SpecialtyType = 'income' | 'bar' | 'tap' | 'gacha';

export interface DealerTemplate {
  id: string;
  name: string;
  grade: DealerGrade;
  specialty: SpecialtyType;
  /** 효과 수치 (예: 0.02 = +2%p, 합연산으로 누적). */
  specialtyValue: number;
  flavor: string;
}

const SPECIALTY_LABEL: Record<SpecialtyType, { label: string; kind: '배치효과' | '보유효과' }> = {
  income: { label: '테이블 수익', kind: '배치효과' },
  bar: { label: '바 매출', kind: '배치효과' },
  tap: { label: '탭 보너스', kind: '배치효과' },
  gacha: { label: '가챠 고급등급 확률', kind: '보유효과' },
};

export function specialtyMeta(type: SpecialtyType) {
  return SPECIALTY_LABEL[type];
}

// 뽑기 확률(N 60% / R 28% / SR 10% / SSR 2%)에 맞춰 등급이 희귀할수록 종류 수를 줄였다.
// N 6종 / R 5종 / SR 3종 / SSR 2종, 총 16명. 흔한 등급은 다양하게, 희귀 등급은 소수정예로.
export const DEALER_ROSTER: DealerTemplate[] = [
  // N (6종)
  { id: 'n-kim', name: '김대리', grade: 'N', specialty: 'income', specialtyValue: 0.02, flavor: '성실한 신입 딜러. 손이 빠르진 않지만 꾸준하다.' },
  { id: 'n-kang', name: '강알바', grade: 'N', specialty: 'income', specialtyValue: 0.02, flavor: '주말 알바생이지만 손님 응대는 야무지다.' },
  { id: 'n-park', name: '박신입', grade: 'N', specialty: 'bar', specialtyValue: 0.02, flavor: '틈틈이 바 손님도 챙기는 눈치 빠른 막내.' },
  { id: 'n-oh2', name: '오연수생', grade: 'N', specialty: 'bar', specialtyValue: 0.02, flavor: '연수 중이지만 칵테일 이름은 다 외웠다.' },
  { id: 'n-lee', name: '이막내', grade: 'N', specialty: 'tap', specialtyValue: 0.02, flavor: '손님 응대가 빠릿빠릿해 팁을 잘 받는다.' },
  { id: 'n-choi', name: '최수습', grade: 'N', specialty: 'gacha', specialtyValue: 0.02, flavor: '인맥 관리 중인 수습. 좋은 딜러를 소개해준다.' },
  // R (5종)
  { id: 'r-jung', name: '정프로', grade: 'R', specialty: 'income', specialtyValue: 0.04, flavor: '카드를 다루는 손놀림이 프로급.' },
  { id: 'r-seo2', name: '서에이스', grade: 'R', specialty: 'income', specialtyValue: 0.04, flavor: '팀 내에서 에이스로 통하는 실력파.' },
  { id: 'r-han', name: '한베테랑', grade: 'R', specialty: 'bar', specialtyValue: 0.04, flavor: '칵테일 레시피를 줄줄 꿰고 있다.' },
  { id: 'r-oh', name: '오스피드', grade: 'R', specialty: 'tap', specialtyValue: 0.04, flavor: '판을 빨리 돌려 손님 회전율이 좋다.' },
  { id: 'r-yoon', name: '윤스카우터', grade: 'R', specialty: 'gacha', specialtyValue: 0.04, flavor: '업계 발이 넓어 좋은 인재를 물어온다.' },
  // SR (3종)
  { id: 'sr-seo', name: '서마스터', grade: 'SR', specialty: 'income', specialtyValue: 0.07, flavor: '전국구로 소문난 마스터 딜러.' },
  { id: 'sr-kang', name: '강칵테일', grade: 'SR', specialty: 'bar', specialtyValue: 0.07, flavor: '시그니처 칵테일로 VIP를 사로잡는다.' },
  { id: 'sr-lim', name: '임퀵핸드', grade: 'SR', specialty: 'tap', specialtyValue: 0.07, flavor: '셔플이 예술이라 손님들이 넋을 놓고 본다.' },
  // SSR (2종)
  { id: 'ssr-hwang', name: '황전설', grade: 'SSR', specialty: 'income', specialtyValue: 0.12, flavor: '한 판만 봐도 전설이라 불리는 이유를 안다.' },
  { id: 'ssr-baek', name: '백소믈리에', grade: 'SSR', specialty: 'bar', specialtyValue: 0.12, flavor: '와인부터 위스키까지, 살아있는 바 사전.' },
];

export function templateById(id: string): DealerTemplate {
  const t = DEALER_ROSTER.find((d) => d.id === id);
  if (!t) throw new Error(`Unknown dealer template: ${id}`);
  return t;
}

export function templatesForGrade(grade: DealerGrade): DealerTemplate[] {
  return DEALER_ROSTER.filter((d) => d.grade === grade);
}

export function rollTemplate(grade: DealerGrade): DealerTemplate {
  const pool = templatesForGrade(grade);
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 별 등급(성급) 시스템: 같은 딜러를 중복으로 뽑을 때마다 별이 올라간다.
 * 등급이 희귀할수록 별 하나당 보너스가 크고, 대신 만성에 필요한 별 개수는 적다
 * (SSR은 3성이면 만렙, 대신 성 하나하나가 묵직함).
 */
export interface StarConfig {
  maxStars: number;
  /** 1성을 넘어 별 하나 오를 때마다 특기 수치에 곱해지는 보너스. */
  bonusPerStar: number;
  /** 만성 달성 시 추가로 터지는 "각성 스킬": 전체 수익에 곱연산으로 영구 적용. */
  maxStarBonus: number;
}

export const STAR_CONFIG: Record<DealerGrade, StarConfig> = {
  N: { maxStars: 5, bonusPerStar: 0.1, maxStarBonus: 0.02 },
  R: { maxStars: 5, bonusPerStar: 0.15, maxStarBonus: 0.04 },
  SR: { maxStars: 4, bonusPerStar: 0.2, maxStarBonus: 0.07 },
  SSR: { maxStars: 3, bonusPerStar: 0.3, maxStarBonus: 0.12 },
};

/** 보유 개수(ownedCount)를 등급별 상한 안에서 별 개수로 환산. */
export function starLevelFor(grade: DealerGrade, ownedCount: number): number {
  return Math.min(STAR_CONFIG[grade].maxStars, Math.max(0, ownedCount));
}

/** 별 등급에 따라 특기 수치에 곱해지는 배율 (1성=기본, 별 하나 오를 때마다 증가). */
export function starMultiplierFor(grade: DealerGrade, ownedCount: number): number {
  const stars = starLevelFor(grade, ownedCount);
  return 1 + Math.max(0, stars - 1) * STAR_CONFIG[grade].bonusPerStar;
}

export function isMaxStars(grade: DealerGrade, ownedCount: number): boolean {
  return starLevelFor(grade, ownedCount) >= STAR_CONFIG[grade].maxStars;
}
