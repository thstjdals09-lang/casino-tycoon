import type { DealerInstance, GameSaveData, TableInstance, VenueTierConfig } from './types';
import { collectionMultiplier, costForNth, dealerMultiplier, isFinalTier, tableLevelMultiplier, tierOf } from './balance';
import { createNewSave, loadSave, persistSave } from './SaveManager';
import { rollGrade, type DealerGrade } from './gacha';
import { computeJobMultipliers, pendingJobChoices, type JobConfig, type JobMultipliers } from './jobs';
import { achievementMultiplier, checkNewAchievements, type AchievementConfig, ACHIEVEMENTS, type DealerPullCounts } from './achievements';

const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000; // 오프라인 수익은 최대 8시간까지만 인정
const TAP_COOLDOWN_MS = 3000;
const TAP_BONUS_SECONDS = 5;
/** 딜러가 배정돼 손님이 착석하면 붙는 추가 수익 배율. */
const CUSTOMER_SEATED_BONUS = 1.15;

export interface OfflineEarningsResult {
  elapsedMs: number;
  earned: number;
}

export interface GachaResult {
  dealerId: number;
  grade: DealerGrade;
}

export class GameState {
  private data: GameSaveData;
  private lastGacha: GachaResult | null = null;

  constructor() {
    this.data = loadSave() ?? createNewSave();
  }

  get tier(): VenueTierConfig {
    return tierOf(this.data.venueTierIndex);
  }

  get cash(): number {
    return this.data.cash;
  }

  get totalEarned(): number {
    return this.data.totalEarned;
  }

  get tables(): readonly TableInstance[] {
    return this.data.tables;
  }

  get dealers(): readonly DealerInstance[] {
    return this.data.dealers;
  }

  get prestigeMultiplier(): number {
    return this.data.prestigeMultiplier;
  }

  get jobPath(): readonly string[] {
    return this.data.jobPath;
  }

  get lastGachaResult(): GachaResult | null {
    return this.lastGacha;
  }

  get dealerPulls(): DealerPullCounts {
    return this.data.dealerPulls;
  }

  get achievements(): readonly string[] {
    return this.data.achievements;
  }

  achievementList(): AchievementConfig[] {
    return ACHIEVEMENTS;
  }

  private lastUnlockedAchievements: AchievementConfig[] = [];

  get lastUnlocked(): AchievementConfig[] {
    return this.lastUnlockedAchievements;
  }

  jobMultipliers(): JobMultipliers {
    return computeJobMultipliers(this.data.jobPath);
  }

  pendingJobChoices(): JobConfig[] | null {
    return pendingJobChoices(this.data.jobPath, this.data.venueTierIndex);
  }

  chooseJob(jobId: string): boolean {
    const choices = this.pendingJobChoices();
    if (!choices || !choices.some((j) => j.id === jobId)) return false;
    this.data.jobPath.push(jobId);
    return true;
  }

  dealerFor(table: TableInstance): DealerInstance | null {
    if (table.dealerId === null) return null;
    return this.data.dealers.find((d) => d.id === table.dealerId) ?? null;
  }

  tableIncomePerSecond(table: TableInstance): number {
    const tier = this.tier;
    const dealer = this.dealerFor(table);
    const base = tier.tableBaseIncome * tableLevelMultiplier(tier, table.level);
    const jobs = this.jobMultipliers();
    // 딜러가 배정된 테이블만 전직의 딜러 효율 보너스 + 손님 착석 보너스를 받는다.
    const dealerMult =
      dealer !== null ? dealerMultiplier(tier, dealer) * jobs.dealerEff * CUSTOMER_SEATED_BONUS : dealerMultiplier(tier, null);
    return base * dealerMult * this.data.prestigeMultiplier;
  }

  totalIncomePerSecond(): number {
    const raw = this.data.tables.reduce((sum, t) => sum + this.tableIncomePerSecond(t), 0);
    return raw * collectionMultiplier(this.data.dealers) * this.jobMultipliers().income * achievementMultiplier(this.data.achievements);
  }

  nextTableCost(): number | null {
    const tier = this.tier;
    if (this.data.tables.length >= tier.maxTables) return null;
    return costForNth(tier.tableBaseBuyCost, tier.tableBuyCostGrowth, this.data.tables.length - 1);
  }

  tableUpgradeCost(table: TableInstance): number {
    const tier = this.tier;
    return costForNth(tier.tableBaseUpgradeCost, tier.tableUpgradeCostGrowth, table.level - 1);
  }

  /** 딜러 가챠 1회 비용. */
  nextGachaCost(): number {
    const tier = this.tier;
    return costForNth(tier.dealerBaseHireCost, tier.dealerHireCostGrowth, this.data.dealers.length);
  }

  dealerUpgradeCost(dealer: DealerInstance): number {
    const tier = this.tier;
    return costForNth(tier.dealerBaseUpgradeCost, tier.dealerUpgradeCostGrowth, dealer.level - 1);
  }

  canAdvanceVenue(): boolean {
    if (this.pendingJobChoices() !== null) return false; // 전직 선택 전에는 매장 확장 불가
    const cost = this.tier.advanceCost;
    if (cost === null) return false;
    return this.data.cash >= cost;
  }

  isFinalTier(): boolean {
    return isFinalTier(this.data.venueTierIndex);
  }

  buyTable(): boolean {
    const cost = this.nextTableCost();
    if (cost === null || this.data.cash < cost) return false;
    this.data.cash -= cost;
    this.data.tables.push({ id: this.data.nextTableId++, level: 1, dealerId: null, lastTapAt: 0 });
    return true;
  }

  upgradeTable(tableId: number): boolean {
    const table = this.data.tables.find((t) => t.id === tableId);
    if (!table) return false;
    const cost = this.tableUpgradeCost(table);
    if (this.data.cash < cost) return false;
    this.data.cash -= cost;
    table.level += 1;
    return true;
  }

  /** 딜러 가챠 뽑기. 등급은 확률로 결정되고, 전직 효과로 고급 등급 확률이 오를 수 있다. */
  pullDealer(): GachaResult | null {
    const cost = this.nextGachaCost();
    if (this.data.cash < cost) return null;
    this.data.cash -= cost;
    const grade = rollGrade(this.jobMultipliers().gacha);
    const dealer: DealerInstance = { id: this.data.nextDealerId++, level: 1, grade, assignedTableId: null };
    this.data.dealers.push(dealer);
    this.data.dealerPulls[grade] += 1;

    const newly = checkNewAchievements(this.data.dealerPulls, this.data.achievements);
    this.lastUnlockedAchievements = newly.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!).filter(Boolean);
    this.data.achievements.push(...newly);

    const result: GachaResult = { dealerId: dealer.id, grade };
    this.lastGacha = result;
    return result;
  }

  upgradeDealer(dealerId: number): boolean {
    const dealer = this.data.dealers.find((d) => d.id === dealerId);
    if (!dealer) return false;
    const cost = this.dealerUpgradeCost(dealer);
    if (this.data.cash < cost) return false;
    this.data.cash -= cost;
    dealer.level += 1;
    return true;
  }

  assignDealer(dealerId: number, tableId: number | null): void {
    const dealer = this.data.dealers.find((d) => d.id === dealerId);
    if (!dealer) return;

    if (dealer.assignedTableId !== null) {
      const prevTable = this.data.tables.find((t) => t.id === dealer.assignedTableId);
      if (prevTable) prevTable.dealerId = null;
    }

    if (tableId !== null) {
      const table = this.data.tables.find((t) => t.id === tableId);
      if (!table) return;
      if (table.dealerId !== null) {
        const otherDealer = this.data.dealers.find((d) => d.id === table.dealerId);
        if (otherDealer) otherDealer.assignedTableId = null;
      }
      table.dealerId = dealer.id;
    }

    dealer.assignedTableId = tableId;
  }

  tapTable(tableId: number): number {
    const table = this.data.tables.find((t) => t.id === tableId);
    if (!table) return 0;
    const now = Date.now();
    if (now - table.lastTapAt < TAP_COOLDOWN_MS) return 0;
    table.lastTapAt = now;
    const bonus = this.tableIncomePerSecond(table) * TAP_BONUS_SECONDS * this.jobMultipliers().tap;
    this.data.cash += bonus;
    this.data.totalEarned += bonus;
    return bonus;
  }

  advanceVenue(): boolean {
    if (!this.canAdvanceVenue()) return false;
    const tier = this.tier;
    this.data.prestigeMultiplier *= tier.advanceBonusMultiplier;
    this.data.venueTierIndex += 1;
    this.data.cash = 0;
    this.data.tables = [{ id: 0, level: 1, dealerId: null, lastTapAt: 0 }];
    this.data.dealers = [];
    this.data.nextTableId = 1;
    this.data.nextDealerId = 0;
    return true;
  }

  tick(deltaSeconds: number): void {
    const earned = this.totalIncomePerSecond() * deltaSeconds;
    this.data.cash += earned;
    this.data.totalEarned += earned;
  }

  consumeOfflineEarnings(): OfflineEarningsResult {
    const elapsedMs = Math.min(Date.now() - this.data.lastSavedAt, MAX_OFFLINE_MS);
    if (elapsedMs < 5000) return { elapsedMs: 0, earned: 0 };
    const earned = this.totalIncomePerSecond() * (elapsedMs / 1000) * this.jobMultipliers().offline;
    this.data.cash += earned;
    this.data.totalEarned += earned;
    return { elapsedMs, earned };
  }

  save(): void {
    this.data.lastSavedAt = Date.now();
    persistSave(this.data);
  }
}
