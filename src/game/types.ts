import type { DealerGrade } from './gacha';
import type { CustomerGrade } from './customers';

export interface TableInstance {
  id: number;
  level: number;
  dealerId: number | null;
  lastTapAt: number;
  /** 딜러가 배정될 때 결정되는 착석 손님 등급. 딜러 없으면 null. */
  customerGrade: CustomerGrade | null;
}

export interface DealerInstance {
  id: number;
  level: number;
  grade: DealerGrade;
  assignedTableId: number | null;
}

export interface VenueTierConfig {
  id: number;
  name: string;
  description: string;
  maxTables: number;
  tableBaseIncome: number;
  tableBaseBuyCost: number;
  tableBuyCostGrowth: number;
  tableBaseUpgradeCost: number;
  tableUpgradeCostGrowth: number;
  tableLevelIncomeGrowth: number;
  dealerBaseHireCost: number;
  dealerHireCostGrowth: number;
  dealerBaseUpgradeCost: number;
  dealerUpgradeCostGrowth: number;
  dealerLevelBonus: number;
  noDealerEfficiency: number;
  advanceCost: number | null;
  advanceBonusMultiplier: number;
  themeColor: number;
  floorColor: number;
}

export interface GameSaveData {
  version: number;
  venueTierIndex: number;
  cash: number;
  totalEarned: number;
  prestigeMultiplier: number;
  tables: TableInstance[];
  dealers: DealerInstance[];
  nextTableId: number;
  nextDealerId: number;
  lastSavedAt: number;
  /** 선택한 전직 id들의 순서 (1차 -> 2차 ...). */
  jobPath: string[];
  /** 등급별 누적 가챠 횟수 (프레스티지해도 초기화되지 않음, 도감/업적용). */
  dealerPulls: Record<DealerGrade, number>;
  /** 달성한 업적 id 목록. */
  achievements: string[];
  /** 매장 인테리어(디자인) 업그레이드 레벨. 높을수록 고급 손님 등급 확률 상승. 매장 확장 시 초기화. */
  designLevel: number;
  /** 미니바 레벨. 높을수록 더 비싼 음료를 판매해 초당 수익이 오름. 매장 확장 시 초기화. */
  barLevel: number;
}
