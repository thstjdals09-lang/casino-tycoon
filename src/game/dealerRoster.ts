import type { DealerGrade } from './gacha';

export type SpecialtyType = 'income' | 'bar' | 'design' | 'gacha';

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
  design: { label: '매장 디자인 보너스(손님 등급운)', kind: '배치효과' },
  gacha: { label: '가챠 고급등급 확률', kind: '보유효과' },
};

/** 등급이 높을수록 도트 초상화에 모자/왕관이 붙는다 (MainScene의 실제 딜러 스프라이트와 동일 규칙). */
export function accessoryForGrade(grade: DealerGrade): 'none' | 'hat' | 'crown' {
  if (grade === 'SSR') return 'crown';
  if (grade === 'SR') return 'hat';
  return 'none';
}

export function specialtyMeta(type: SpecialtyType) {
  return SPECIALTY_LABEL[type];
}

// 뽑기 확률(N 60% / R 28% / SR 10% / SSR 2%)에 맞춰 등급이 희귀할수록 종류 수를 줄였다.
// N 12종 / R 10종 / SR 6종 / SSR 4종, 총 32명(최종 층 최대 테이블 수와 동일) — 흔한 등급은
// 다양하게 뽑혀서 안 질리게, 희귀 등급은 소수정예로 모으는 재미를 살렸다.
export const DEALER_ROSTER: DealerTemplate[] = [
  // N (12종) — income x3, bar x3, design x3, gacha x3
  { id: 'n-kim', name: '김대리', grade: 'N', specialty: 'income', specialtyValue: 0.02, flavor: '성실한 신입 딜러. 손이 빠르진 않지만 꾸준하다.' },
  { id: 'n-kang', name: '강알바', grade: 'N', specialty: 'income', specialtyValue: 0.02, flavor: '주말 알바생이지만 손님 응대는 야무지다.' },
  { id: 'n-oh3', name: '오견습', grade: 'N', specialty: 'income', specialtyValue: 0.02, flavor: '견습 딱지를 뗀 지 얼마 안 됐지만 야무지다.' },
  { id: 'n-park', name: '박신입', grade: 'N', specialty: 'bar', specialtyValue: 0.02, flavor: '틈틈이 바 손님도 챙기는 눈치 빠른 막내.' },
  { id: 'n-oh2', name: '오연수생', grade: 'N', specialty: 'bar', specialtyValue: 0.02, flavor: '연수 중이지만 칵테일 이름은 다 외웠다.' },
  { id: 'n-nam', name: '남알바', grade: 'N', specialty: 'bar', specialtyValue: 0.02, flavor: '주문 실수 한 번 없는 꼼꼼한 알바생.' },
  { id: 'n-lee', name: '이막내', grade: 'N', specialty: 'design', specialtyValue: 0.02, flavor: '손님 응대가 빠릿빠릿해 매장 분위기를 살린다.' },
  { id: 'n-seo2', name: '서인턴', grade: 'N', specialty: 'design', specialtyValue: 0.02, flavor: '테이블 정리정돈이 남달라 매장이 깔끔해 보인다.' },
  { id: 'n-han2', name: '한신입생', grade: 'N', specialty: 'design', specialtyValue: 0.02, flavor: '작은 소품 하나도 예쁘게 배치하는 재주가 있다.' },
  { id: 'n-choi', name: '최수습', grade: 'N', specialty: 'gacha', specialtyValue: 0.02, flavor: '인맥 관리 중인 수습. 좋은 딜러를 소개해준다.' },
  { id: 'n-yoon2', name: '윤알바생', grade: 'N', specialty: 'gacha', specialtyValue: 0.02, flavor: '동네 발이 넓어 종종 좋은 인재를 데려온다.' },
  { id: 'n-jo', name: '조인턴', grade: 'N', specialty: 'gacha', specialtyValue: 0.02, flavor: '인턴이지만 업계 소식엔 빠삭하다.' },
  // R (10종) — income x3, bar x3, design x2, gacha x2
  { id: 'r-jung', name: '정프로', grade: 'R', specialty: 'income', specialtyValue: 0.04, flavor: '카드를 다루는 손놀림이 프로급.' },
  { id: 'r-seo2', name: '서에이스', grade: 'R', specialty: 'income', specialtyValue: 0.04, flavor: '팀 내에서 에이스로 통하는 실력파.' },
  { id: 'r-baek2', name: '백실장', grade: 'R', specialty: 'income', specialtyValue: 0.04, flavor: '실장답게 매출 관리가 철저하다.' },
  { id: 'r-han', name: '한베테랑', grade: 'R', specialty: 'bar', specialtyValue: 0.04, flavor: '칵테일 레시피를 줄줄 꿰고 있다.' },
  { id: 'r-no', name: '노바텐더', grade: 'R', specialty: 'bar', specialtyValue: 0.04, flavor: '단골들이 일부러 찾아오는 실력 있는 바텐더.' },
  { id: 'r-im2', name: '임소믈리에', grade: 'R', specialty: 'bar', specialtyValue: 0.04, flavor: '와인 페어링 추천이 늘 정확하다.' },
  { id: 'r-oh', name: '오센스', grade: 'R', specialty: 'design', specialtyValue: 0.04, flavor: '테이블 세팅 센스가 좋아 매장이 더 고급스러워 보인다.' },
  { id: 'r-nam2', name: '남코디', grade: 'R', specialty: 'design', specialtyValue: 0.04, flavor: '조명 하나 바꾸는 것만으로 분위기를 살린다.' },
  { id: 'r-yoon', name: '윤스카우터', grade: 'R', specialty: 'gacha', specialtyValue: 0.04, flavor: '업계 발이 넓어 좋은 인재를 물어온다.' },
  { id: 'r-kang2', name: '강인맥', grade: 'R', specialty: 'gacha', specialtyValue: 0.04, flavor: '연락처 목록에 업계 사람이 절반이다.' },
  // SR (6종) — income x2, bar x2, design x2
  { id: 'sr-seo', name: '서마스터', grade: 'SR', specialty: 'income', specialtyValue: 0.07, flavor: '전국구로 소문난 마스터 딜러.' },
  { id: 'sr-hwang2', name: '황프로페셔널', grade: 'SR', specialty: 'income', specialtyValue: 0.07, flavor: '동작 하나하나가 교과서 같다는 평가를 받는다.' },
  { id: 'sr-kang', name: '강칵테일', grade: 'SR', specialty: 'bar', specialtyValue: 0.07, flavor: '시그니처 칵테일로 VIP를 사로잡는다.' },
  { id: 'sr-baek3', name: '백믹솔로지스트', grade: 'SR', specialty: 'bar', specialtyValue: 0.07, flavor: '독창적인 레시피로 대회 입상 경력도 있다.' },
  { id: 'sr-lim', name: '임디자이너', grade: 'SR', specialty: 'design', specialtyValue: 0.07, flavor: '인테리어 감각이 남달라 매장을 볼 때마다 감탄이 나온다.' },
  { id: 'sr-no2', name: '노아트디렉터', grade: 'SR', specialty: 'design', specialtyValue: 0.07, flavor: '색감과 동선을 보는 눈이 프로 수준이다.' },
  // SSR (4종) — income x2, bar x2
  { id: 'ssr-hwang', name: '황전설', grade: 'SSR', specialty: 'income', specialtyValue: 0.12, flavor: '한 판만 봐도 전설이라 불리는 이유를 안다.' },
  { id: 'ssr-jin', name: '진레전드', grade: 'SSR', specialty: 'income', specialtyValue: 0.12, flavor: '이 바닥에서 모르면 간첩이라는 그 이름.' },
  { id: 'ssr-baek', name: '백소믈리에', grade: 'SSR', specialty: 'bar', specialtyValue: 0.12, flavor: '와인부터 위스키까지, 살아있는 바 사전.' },
  { id: 'ssr-nam3', name: '남마스터바텐더', grade: 'SSR', specialty: 'bar', specialtyValue: 0.12, flavor: '전 세계 대회를 휩쓴 전설의 바텐더.' },
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
