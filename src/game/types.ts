import type { DealerGrade } from './gacha';

export interface TableInstance {
  id: number;
  level: number;
  dealerId: number | null;
  lastTapAt: number;
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
  dealerPulls: Record<import('./gacha').DealerGrade, number>;
  /** 달성한 업적 id 목록. */
  achievements: string[];
}
