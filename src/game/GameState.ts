import type { DealerInstance, GameSaveData, TableInstance, VenueTierConfig } from './types';
import { collectionMultiplier, costForNth, dealerMultiplier, isFinalTier, tableLevelMultiplier, tierOf } from './balance';
import { createNewSave, loadSave, persistSave, resetSave } from './SaveManager';
import { rollGrade, type DealerGrade } from './gacha';
import { computeJobMultipliers, pendingJobChoices, type JobConfig, type JobMultipliers } from './jobs';
import { achievementMultiplier, checkNewAchievements, type AchievementConfig, ACHIEVEMENTS, type DealerPullCounts } from './achievements';
import { customerGradeConfig, rollCustomerGrades, SEATS_PER_TABLE, type CustomerGrade } from './customers';
import { barIncomePerSecond, barUpgradeCost, designBonusFor, designUpgradeCost, drinkPriceFor } from './decor';

const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000; // 오프라인 수익은 최대 8시간까지만 인정
const TAP_COOLDOWN_MS = 2000;
const TAP_BONUS_SECONDS = 5;

export interface OfflineEarningsResult {
  elapsedMs: number;
  earned: number;
}

export interface DailyLoginResult {
  streak: number;
  reward: number;
}

export interface GachaResult {
  dealerId: number;
  grade: DealerGrade;
}

export class GameState {
  private data: GameSaveData;
  private lastGacha: GachaResult | null = null;
  private lastUnlockedAchievements: AchievementConfig[] = [];
  private autoSaveDisabled = false;
  // 부스트(황금시간)는 세이브하지 않는 일시적 상태.
  private boostActiveUntil = 0;
  private boostCooldownUntil = 0;

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

  get lastUnlocked(): AchievementConfig[] {
    return this.lastUnlockedAchievements;
  }

  get designLevel(): number {
    return this.data.designLevel;
  }

  get barLevel(): number {
    return this.data.barLevel;
  }

  get loginStreak(): number {
    return this.data.loginStreak;
  }

  isBoostActive(): boolean {
    return Date.now() < this.boostActiveUntil;
  }

  boostSecondsRemaining(): number {
    return Math.max(0, Math.ceil((this.boostActiveUntil - Date.now()) / 1000));
  }

  boostCooldownSecondsRemaining(): number {
    return Math.max(0, Math.ceil((this.boostCooldownUntil - Date.now()) / 1000));
  }

  canActivateBoost(): boolean {
    return Date.now() >= this.boostCooldownUntil;
  }

  /** 60초간 전체 수익 2배 부스트. 재사용 대기 5분(부스트 시간 포함). */
  activateBoost(): boolean {
    if (!this.canActivateBoost()) return false;
    const now = Date.now();
    this.boostActiveUntil = now + 60_000;
    this.boostCooldownUntil = now + 5 * 60_000;
    return true;
  }

  /**
   * 하루 한 번, 새로운 날짜에 처음 접속했을 때 출석 보상을 지급한다.
   * 이미 오늘 받았으면 null. 날짜는 로컬 기준(YYYY-MM-DD)으로 비교.
   */
  claimDailyLogin(): DailyLoginResult | null {
    const today = new Date().toISOString().slice(0, 10);
    if (this.data.lastLoginDate === today) return null;

    const isConsecutive = (() => {
      if (!this.data.lastLoginDate) return false;
      const prev = new Date(this.data.lastLoginDate);
      const diffDays = Math.round((new Date(today).getTime() - prev.getTime()) / 86_400_000);
      return diffDays === 1;
    })();

    this.data.loginStreak = isConsecutive ? this.data.loginStreak + 1 : 1;
    this.data.lastLoginDate = today;

    const cappedStreak = Math.min(this.data.loginStreak, 7);
    const reward = this.totalIncomePerSecond() * 60 * (1 + cappedStreak * 0.15) + 20 * cappedStreak;
    this.data.cash += reward;
    this.data.totalEarned += reward;

    return { streak: this.data.loginStreak, reward };
  }

  achievementList(): AchievementConfig[] {
    return ACHIEVEMENTS;
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

  customerGradesFor(table: TableInstance): readonly CustomerGrade[] {
    return table.customerGrades;
  }

  tableIncomePerSecond(table: TableInstance): number {
    const tier = this.tier;
    const dealer = this.dealerFor(table);
    const base = tier.tableBaseIncome * tableLevelMultiplier(tier, table.level);
    const jobs = this.jobMultipliers();
    if (dealer === null) {
      return base * dealerMultiplier(tier, null) * this.data.prestigeMultiplier;
    }
    // 착석한 손님 최대 8명의 평균 씀씀이 배율을 적용 (한 명 등급에 좌우되지 않고 테이블 전체 분위기를 반영).
    const grades = table.customerGrades;
    const customerMult =
      grades.length > 0 ? grades.reduce((sum, g) => sum + customerGradeConfig(g).spendMultiplier, 0) / grades.length : 1;
    const dealerMult = dealerMultiplier(tier, dealer) * jobs.dealerEff * customerMult;
    return base * dealerMult * this.data.prestigeMultiplier;
  }

  /** 착석한 손님들의 drinkMultiplier 합 (바 매출 계산용). 손님이 많을수록 바 매출도 커진다. */
  private seatedDrinkMultiplierSum(): number {
    return this.data.tables.reduce((sum, t) => {
      return sum + t.customerGrades.reduce((s, g) => s + customerGradeConfig(g).drinkMultiplier, 0);
    }, 0);
  }

  barIncomePerSecond(): number {
    return barIncomePerSecond(this.data.barLevel, this.seatedDrinkMultiplierSum());
  }

  drinkPrice(): number {
    return drinkPriceFor(this.data.barLevel);
  }

  designUpgradeCost(): number {
    return designUpgradeCost(this.data.designLevel);
  }

  barUpgradeCost(): number {
    return barUpgradeCost(this.data.barLevel);
  }

  upgradeDesign(): boolean {
    const cost = this.designUpgradeCost();
    if (this.data.cash < cost) return false;
    this.data.cash -= cost;
    this.data.designLevel += 1;
    return true;
  }

  upgradeBar(): boolean {
    const cost = this.barUpgradeCost();
    if (this.data.cash < cost) return false;
    this.data.cash -= cost;
    this.data.barLevel += 1;
    return true;
  }

  totalIncomePerSecond(): number {
    const raw = this.data.tables.reduce((sum, t) => sum + this.tableIncomePerSecond(t), 0);
    const jobsIncome = this.jobMultipliers().income;
    const tableIncome = raw * collectionMultiplier(this.data.dealers) * jobsIncome * achievementMultiplier(this.data.achievements);
    const barIncome = this.barIncomePerSecond() * jobsIncome;
    const boostMult = this.isBoostActive() ? 2 : 1;
    return (tableIncome + barIncome) * boostMult;
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
    if (this.data.tables.length < this.tier.maxTables) return false; // 지금 층 테이블을 다 채워야 다음 층으로
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
    this.data.tables.push({ id: this.data.nextTableId++, level: 1, dealerId: null, lastTapAt: 0, customerGrades: [] });
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
      if (prevTable) {
        prevTable.dealerId = null;
        prevTable.customerGrades = [];
      }
    }

    if (tableId !== null) {
      const table = this.data.tables.find((t) => t.id === tableId);
      if (!table) return;
      if (table.dealerId !== null) {
        const otherDealer = this.data.dealers.find((d) => d.id === table.dealerId);
        if (otherDealer) otherDealer.assignedTableId = null;
      }
      table.dealerId = dealer.id;
      // 딜러가 새로 배정되면 매장 디자인 레벨에 따라 손님 8명을 새로 뽑는다 (홀덤 8인 테이블).
      table.customerGrades = rollCustomerGrades(SEATS_PER_TABLE, designBonusFor(this.data.designLevel));
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
    const cost = tier.advanceCost ?? 0;
    this.data.cash -= cost;
    this.data.prestigeMultiplier *= tier.advanceBonusMultiplier;
    this.data.venueTierIndex += 1;
    // 초기화 없이 누적 성장: 테이블/딜러/디자인/바를 그대로 유지한 채 다음 층으로 넘어간다.
    // 새 층은 maxTables가 더 커서 그만큼 테이블을 더 살 수 있는 자리가 열린다.
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
    if (this.autoSaveDisabled) return;
    this.data.lastSavedAt = Date.now();
    persistSave(this.data);
  }

  /**
   * 전체 초기화. beforeunload 시 자동저장이 지워진 세이브를 다시 덮어쓰지 않도록
   * autoSaveDisabled를 켠 뒤 스토리지를 지운다. 호출 후 페이지를 새로고침해야 반영된다.
   */
  resetGame(): void {
    this.autoSaveDisabled = true;
    resetSave();
  }
}
