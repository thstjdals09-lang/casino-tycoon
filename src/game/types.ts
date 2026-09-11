export interface TableInstance {
  id: number;
  level: number;
  dealerId: number | null;
  lastTapAt: number;
}

export interface DealerInstance {
  id: number;
  level: number;
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
}
