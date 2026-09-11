export interface JobConfig {
  id: string;
  name: string;
  description: string;
  /** 이 매장 등급(venueTierIndex)에 도달하면 선택 가능해진다. */
  requiresVenueTier: number;
  /** 상위 전직 id. null이면 1차 전직(첫 갈림길). */
  requiresParent: string | null;
  incomeMultiplier?: number;
  dealerEffMultiplier?: number;
  tapBonusMultiplier?: number;
  offlineMultiplier?: number;
  /** 가챠 SR/SSR 확률 가중치 배율. */
  gachaRateMultiplier?: number;
}

// 1차 전직: 매장 등급 1(동네 홀덤 매장) 도달 시 선택.
// 2차 전직: 매장 등급 2(지역 카지노) 도달 시, 1차 선택에 따라 갈래가 갈린다.
export const JOBS: JobConfig[] = [
  {
    id: 'dealer-vet',
    name: '베테랑 딜러 출신',
    description: '현장 경력을 살려 딜러 효율 +20%.',
    requiresVenueTier: 1,
    requiresParent: null,
    dealerEffMultiplier: 1.2,
  },
  {
    id: 'biz-owner',
    name: '수완 좋은 사업가',
    description: '운영 감각으로 테이블 수익 +20%.',
    requiresVenueTier: 1,
    requiresParent: null,
    incomeMultiplier: 1.2,
  },
  {
    id: 'house-master',
    name: '하우스 마스터',
    description: '딜러 효율 추가 +30%, 손님 응대로 탭 보너스 +20%.',
    requiresVenueTier: 2,
    requiresParent: 'dealer-vet',
    dealerEffMultiplier: 1.3,
    tapBonusMultiplier: 1.2,
  },
  {
    id: 'headhunter',
    name: '헤드헌터',
    description: '인맥으로 가챠 고급 등급(SR/SSR) 확률 +50%.',
    requiresVenueTier: 2,
    requiresParent: 'dealer-vet',
    gachaRateMultiplier: 1.5,
  },
  {
    id: 'tournament-host',
    name: '토너먼트 흥행사',
    description: '대형 이벤트 유치로 전체 수익 +40%.',
    requiresVenueTier: 2,
    requiresParent: 'biz-owner',
    incomeMultiplier: 1.4,
  },
  {
    id: 'vip-manager',
    name: 'VIP 매니저',
    description: 'VIP 응대로 탭 보너스 +50%, 오프라인 수익 +30%.',
    requiresVenueTier: 2,
    requiresParent: 'biz-owner',
    tapBonusMultiplier: 1.5,
    offlineMultiplier: 1.3,
  },
];

export interface JobMultipliers {
  income: number;
  dealerEff: number;
  tap: number;
  offline: number;
  gacha: number;
}

export function computeJobMultipliers(jobPath: readonly string[]): JobMultipliers {
  const result: JobMultipliers = { income: 1, dealerEff: 1, tap: 1, offline: 1, gacha: 1 };
  for (const id of jobPath) {
    const job = JOBS.find((j) => j.id === id);
    if (!job) continue;
    result.income *= job.incomeMultiplier ?? 1;
    result.dealerEff *= job.dealerEffMultiplier ?? 1;
    result.tap *= job.tapBonusMultiplier ?? 1;
    result.offline *= job.offlineMultiplier ?? 1;
    result.gacha *= job.gachaRateMultiplier ?? 1;
  }
  return result;
}

/**
 * 현재 진행 단계에서 선택 가능한 전직 목록을 반환한다. 선택할 게 없으면 null.
 * 1차: jobPath가 비어있고 매장 등급이 1 이상일 때 (requiresParent === null인 것들 중 선택).
 * 2차: jobPath에 1개 있고 매장 등급이 2 이상일 때 (requiresParent === jobPath[0]인 것들 중 선택).
 */
export function pendingJobChoices(jobPath: readonly string[], venueTierIndex: number): JobConfig[] | null {
  const stage = jobPath.length;
  if (stage === 0) {
    if (venueTierIndex < 1) return null;
    return JOBS.filter((j) => j.requiresParent === null);
  }
  if (stage === 1) {
    if (venueTierIndex < 2) return null;
    const parent = jobPath[0];
    return JOBS.filter((j) => j.requiresParent === parent);
  }
  return null;
}
