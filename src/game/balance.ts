import type { DealerInstance, VenueTierConfig } from './types';
import { gradeConfig } from './gacha';

// 매장 등급: 테이블 하나짜리 구석 자리 -> 국내 최고 카지노.
// 숫자는 1차 스켈레톤 값이며, 플레이 테스트 후 튜닝 예정(디테일 패스).
export const VENUE_TIERS: VenueTierConfig[] = [
  {
    id: 0,
    name: '구석 테이블 하나',
    description: '테이블 하나로 시작하는 작은 홀덤 매장.',
    maxTables: 3,
    tableBaseIncome: 1,
    tableBaseBuyCost: 50,
    tableBuyCostGrowth: 3.2,
    tableBaseUpgradeCost: 20,
    tableUpgradeCostGrowth: 1.15,
    tableLevelIncomeGrowth: 1.15,
    dealerBaseHireCost: 80,
    dealerHireCostGrowth: 2.6,
    dealerBaseUpgradeCost: 40,
    dealerUpgradeCostGrowth: 1.2,
    dealerLevelBonus: 0.25,
    noDealerEfficiency: 0.25,
    advanceCost: 5_000,
    advanceBonusMultiplier: 1.5,
    themeColor: 0x2b6b3a,
    floorColor: 0x123018,
  },
  {
    id: 1,
    name: '동네 홀덤 매장',
    description: '입소문을 타기 시작한 동네 홀덤 매장.',
    maxTables: 6,
    tableBaseIncome: 8,
    tableBaseBuyCost: 400,
    tableBuyCostGrowth: 2.8,
    tableBaseUpgradeCost: 150,
    tableUpgradeCostGrowth: 1.16,
    tableLevelIncomeGrowth: 1.16,
    dealerBaseHireCost: 600,
    dealerHireCostGrowth: 2.3,
    dealerBaseUpgradeCost: 300,
    dealerUpgradeCostGrowth: 1.22,
    dealerLevelBonus: 0.28,
    noDealerEfficiency: 0.22,
    advanceCost: 80_000,
    advanceBonusMultiplier: 1.8,
    themeColor: 0x1f4e79,
    floorColor: 0x0d2438,
  },
  {
    id: 2,
    name: '지역 카지노',
    description: '지역에서 손꼽히는 규모로 성장한 카지노.',
    maxTables: 10,
    tableBaseIncome: 60,
    tableBaseBuyCost: 5_000,
    tableBuyCostGrowth: 2.5,
    tableBaseUpgradeCost: 2_000,
    tableUpgradeCostGrowth: 1.17,
    tableLevelIncomeGrowth: 1.17,
    dealerBaseHireCost: 8_000,
    dealerHireCostGrowth: 2.1,
    dealerBaseUpgradeCost: 4_000,
    dealerUpgradeCostGrowth: 1.24,
    dealerLevelBonus: 0.3,
    noDealerEfficiency: 0.18,
    advanceCost: 1_500_000,
    advanceBonusMultiplier: 2.2,
    themeColor: 0x5c1f66,
    floorColor: 0x2a0d30,
  },
  {
    id: 3,
    name: '국내 최고 카지노',
    description: '국내 최고로 인정받는 대형 카지노.',
    maxTables: 16,
    tableBaseIncome: 500,
    tableBaseBuyCost: 120_000,
    tableBuyCostGrowth: 2.3,
    tableBaseUpgradeCost: 50_000,
    tableUpgradeCostGrowth: 1.18,
    tableLevelIncomeGrowth: 1.18,
    dealerBaseHireCost: 200_000,
    dealerHireCostGrowth: 2.0,
    dealerBaseUpgradeCost: 100_000,
    dealerUpgradeCostGrowth: 1.26,
    dealerLevelBonus: 0.32,
    noDealerEfficiency: 0.15,
    advanceCost: null,
    advanceBonusMultiplier: 1,
    themeColor: 0x8a6d1f,
    floorColor: 0x3a2e0d,
  },
];

export function tierOf(index: number): VenueTierConfig {
  const tier = VENUE_TIERS[index];
  if (!tier) throw new Error(`Unknown venue tier index: ${index}`);
  return tier;
}

export function isFinalTier(index: number): boolean {
  return index >= VENUE_TIERS.length - 1;
}

export function costForNth(base: number, growth: number, n: number): number {
  // n번째(0-indexed)로 구매/강화할 때의 비용
  return Math.round(base * Math.pow(growth, n));
}

export function tableLevelMultiplier(tier: VenueTierConfig, level: number): number {
  return Math.pow(tier.tableLevelIncomeGrowth, level - 1);
}

export function dealerMultiplier(tier: VenueTierConfig, dealer: DealerInstance | null): number {
  if (dealer === null) return tier.noDealerEfficiency;
  const grade = gradeConfig(dealer.grade);
  const levelPart = 1 + dealer.level * tier.dealerLevelBonus * grade.levelBonusMultiplier;
  return levelPart * grade.assignedMultiplier;
}

/** 보유한 딜러들의 등급만으로 발생하는 전체 수익 배율(1 + 등급별 보너스 합). 배정 여부 무관. */
export function collectionMultiplier(dealers: readonly DealerInstance[]): number {
  const bonus = dealers.reduce((sum, d) => sum + gradeConfig(d.grade).passiveMultiplier, 0);
  return 1 + bonus;
}

export function formatCash(amount: number): string {
  if (amount < 1000) {
    if (Number.isInteger(amount)) return amount.toLocaleString('ko-KR') + '원';
    return amount.toFixed(amount < 10 ? 2 : 1) + '원';
  }
  const units: [number, string][] = [
    [1e12, '조'],
    [1e8, '억'],
    [1e4, '만'],
  ];
  for (const [value, label] of units) {
    if (amount >= value) {
      const whole = amount / value;
      return whole.toLocaleString('ko-KR', { maximumFractionDigits: whole >= 100 ? 0 : 1 }) + label + '원';
    }
  }
  return Math.floor(amount).toLocaleString('ko-KR') + '원';
}
