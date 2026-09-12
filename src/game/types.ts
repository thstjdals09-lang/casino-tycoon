import type { DealerGrade } from './gacha';
import type { CustomerGrade } from './customers';

export interface TableInstance {
  id: number;
  level: number;
  dealerId: number | null;
  /** 딜러가 배정될 때 함께 착석하는 손님들의 등급(최대 8명, 홀덤 8인 테이블 컨셉). 딜러 없으면 빈 배열. */
  customerGrades: CustomerGrade[];
}

export interface DealerInstance {
  id: number;
  level: number;
  grade: DealerGrade;
  templateId: string;
  /** 별 등급(성급). 1부터 시작, 중복 딜러 재고를 소모해 업그레이드로만 올라간다. */
  stars: number;
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
  /** 매장 인테리어(디자인) 업그레이드 레벨. 높을수록 고급 손님 등급 확률 상승. 매장 확장해도 유지됨. */
  designLevel: number;
  /** 미니바 레벨. 높을수록 더 비싼 음료를 판매해 초당 수익이 오름. 매장 확장해도 유지됨. */
  barLevel: number;
  /** 마지막으로 출석 보상을 받은 날짜 (YYYY-MM-DD, 로컬 기준). */
  lastLoginDate: string;
  /** 연속 출석일수. */
  loginStreak: number;
  /** 자동 업그레이드(테이블 구매/강화, 딜러 강화, 인테리어/바 업그레이드) on/off. */
  autoUpgradeEnabled: boolean;
  /** 오늘(lastLoginDate 기준) 누적한 일일 미션 진행도. */
  missionProgress: { chat: number; pull: number; upgrade: number };
  /** 오늘 이미 수령한 일일 미션. */
  missionClaimed: { chat: boolean; pull: boolean; upgrade: boolean };
  /** 채팅/랭킹 등 다른 사람에게 보이는 닉네임 = 매장 이름. */
  venueName: string;
  /** 이미 보유한 딜러를 또 뽑았을 때 쌓이는 중복 재고. 성급 업그레이드에 소모된다. templateId -> 개수. */
  dupeStock: Record<string, number>;
}
