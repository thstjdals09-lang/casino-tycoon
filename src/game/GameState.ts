import type { DealerInstance, GameSaveData, TableInstance, VenueTierConfig } from './types';
import { collectionMultiplier, costForNth, dealerMultiplier, isFinalTier, tableLevelMultiplier, tierOf } from './balance';
import { createNewSave, loadSave, persistSave, resetSave, SAVE_VERSION } from './SaveManager';
import { rollGrade, type DealerGrade } from './gacha';
import { computeJobMultipliers, pendingJobChoices, type JobConfig, type JobMultipliers } from './jobs';
import { achievementMultiplier, checkNewAchievements, type AchievementConfig, ACHIEVEMENTS, type DealerPullCounts } from './achievements';
import { customerGradeConfig, rollCustomerGrades, SEATS_PER_TABLE, type CustomerGrade } from './customers';
import { barIncomePerSecond, barUpgradeCost, barVisualTier, designBonusFor, designUpgradeCost, drinkPriceFor, unlockedDrinks } from './decor';
import { rollTemplate, templateById, starMultiplierFor, isMaxStars, STAR_CONFIG, type SpecialtyType } from './dealerRoster';
import { getCurrentUid, getCurrentUsername } from './account';
import { loadCloudSave, saveCloudSave } from './cloudSave';

const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000; // 오프라인 수익은 최대 8시간까지만 인정
const MISSION_TARGETS = { chat: 1, pull: 3, upgrade: 5 } as const;
const MISSION_REWARD_SECONDS = { chat: 30, pull: 60, upgrade: 45 } as const;

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
  templateId: string;
  isDuplicate: boolean;
}

export class GameState {
  private data: GameSaveData;
  private lastGacha: GachaResult | null = null;
  private lastUnlockedAchievements: AchievementConfig[] = [];
  private autoSaveDisabled = false;
  // 부스트(황금시간)는 세이브하지 않는 일시적 상태.
  private boostActiveUntil = 0;
  private boostCooldownUntil = 0;
  private autoManageAccumulator = 0;

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

  get autoUpgradeEnabled(): boolean {
    return this.data.autoUpgradeEnabled;
  }

  toggleAutoUpgrade(): void {
    this.data.autoUpgradeEnabled = !this.data.autoUpgradeEnabled;
  }

  get missionProgress() {
    return this.data.missionProgress;
  }

  get missionClaimed() {
    return this.data.missionClaimed;
  }

  get venueName(): string {
    return this.data.venueName;
  }

  /** 닉네임(= 매장 이름) 변경. 2~12자 제한. 성공 시 로컬+클라우드 저장까지 함께 트리거. */
  setVenueName(name: string): boolean {
    const trimmed = name.trim().slice(0, 12);
    if (trimmed.length < 2) return false;
    this.data.venueName = trimmed;
    this.save();
    return true;
  }

  missionTarget(type: 'chat' | 'pull' | 'upgrade'): number {
    return MISSION_TARGETS[type];
  }

  missionReward(type: 'chat' | 'pull' | 'upgrade'): number {
    return this.totalIncomePerSecond() * MISSION_REWARD_SECONDS[type];
  }

  claimMission(type: 'chat' | 'pull' | 'upgrade'): boolean {
    if (this.data.missionClaimed[type]) return false;
    if (this.data.missionProgress[type] < MISSION_TARGETS[type]) return false;
    const reward = this.missionReward(type);
    this.data.cash += reward;
    this.data.totalEarned += reward;
    this.data.missionClaimed[type] = true;
    return true;
  }

  /** 채팅 위젯에서 메시지를 실제로 보냈을 때 호출 — 오늘의 미션 진행도에 반영. */
  recordChatSent(): void {
    this.data.missionProgress.chat += 1;
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
    this.data.missionProgress = { chat: 0, pull: 0, upgrade: 0 };
    this.data.missionClaimed = { chat: false, pull: false, upgrade: false };

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

  /**
   * 이름 붙은 딜러들의 특수효과 배율. income/bar/design은 "배치"된 딜러만, gacha는 "보유"만 해도 적용(보유효과).
   * 성급(별)이 높을수록 개체당 효과도 함께 커진다(합연산으로 누적).
   */
  private specialtyMultiplier(type: SpecialtyType): number {
    const requiresAssignment = type !== 'gacha';
    let bonus = 0;
    for (const d of this.data.dealers) {
      if (requiresAssignment && d.assignedTableId === null) continue;
      const t = templateById(d.templateId);
      if (t.specialty !== type) continue;
      bonus += t.specialtyValue * starMultiplierFor(t.grade, d.stars);
    }
    return 1 + bonus;
  }

  /** 만성(별 만렙) 달성한 딜러들의 "각성 스킬" 보너스 합. */
  private maxStarBonusMultiplier(): number {
    let bonus = 0;
    for (const d of this.data.dealers) {
      if (isMaxStars(d.grade, d.stars)) bonus += STAR_CONFIG[d.grade].maxStarBonus;
    }
    return 1 + bonus;
  }

  /** 특정 딜러(템플릿)의 현재 별 등급/중복 재고/업그레이드 비용. UI 표시·업그레이드 판정용. */
  starInfoFor(templateId: string): { stars: number; maxStars: number; isMax: boolean; dupeStock: number; dupeCost: number } {
    const t = templateById(templateId);
    const cfg = STAR_CONFIG[t.grade];
    const dealer = this.data.dealers.find((d) => d.templateId === templateId);
    const stars = dealer?.stars ?? 0;
    return {
      stars,
      maxStars: cfg.maxStars,
      isMax: stars > 0 && isMaxStars(t.grade, stars),
      dupeStock: this.data.dupeStock[templateId] ?? 0,
      dupeCost: cfg.dupeCostPerStar,
    };
  }

  /** 중복 재고를 소모해 별 등급을 하나 올린다. */
  upgradeDealerStars(templateId: string): boolean {
    const dealer = this.data.dealers.find((d) => d.templateId === templateId);
    if (!dealer) return false;
    const cfg = STAR_CONFIG[dealer.grade];
    if (dealer.stars >= cfg.maxStars) return false;
    const stock = this.data.dupeStock[templateId] ?? 0;
    if (stock < cfg.dupeCostPerStar) return false;
    this.data.dupeStock[templateId] = stock - cfg.dupeCostPerStar;
    dealer.stars += 1;
    return true;
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
    return barIncomePerSecond(this.data.barLevel, this.seatedDrinkMultiplierSum()) * this.specialtyMultiplier('bar');
  }

  drinkPrice(): number {
    return drinkPriceFor(this.data.barLevel);
  }

  unlockedDrinks() {
    return unlockedDrinks(this.data.barLevel);
  }

  barVisualTier() {
    return barVisualTier(this.data.barLevel);
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

  upgradeDesignTimes(times: number | 'max'): number {
    let count = 0;
    const max = times === 'max' ? Number.MAX_SAFE_INTEGER : times;
    while (count < max && this.upgradeDesign()) count++;
    return count;
  }

  upgradeBar(): boolean {
    const cost = this.barUpgradeCost();
    if (this.data.cash < cost) return false;
    this.data.cash -= cost;
    this.data.barLevel += 1;
    return true;
  }

  upgradeBarTimes(times: number | 'max'): number {
    let count = 0;
    const max = times === 'max' ? Number.MAX_SAFE_INTEGER : times;
    while (count < max && this.upgradeBar()) count++;
    return count;
  }

  totalIncomePerSecond(): number {
    const raw = this.data.tables.reduce((sum, t) => sum + this.tableIncomePerSecond(t), 0);
    const jobsIncome = this.jobMultipliers().income;
    const tableIncome =
      raw *
      collectionMultiplier(this.data.dealers) *
      jobsIncome *
      achievementMultiplier(this.data.achievements) *
      this.specialtyMultiplier('income') *
      this.maxStarBonusMultiplier();
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
    this.data.tables.push({ id: this.data.nextTableId++, level: 1, dealerId: null, customerGrades: [] });
    return true;
  }

  upgradeTable(tableId: number): boolean {
    const table = this.data.tables.find((t) => t.id === tableId);
    if (!table) return false;
    const cost = this.tableUpgradeCost(table);
    if (this.data.cash < cost) return false;
    this.data.cash -= cost;
    table.level += 1;
    this.data.missionProgress.upgrade += 1;
    return true;
  }

  /** times번(또는 'max'로 살 수 있는 만큼) 연속 강화. 실제로 산 횟수를 반환. */
  upgradeTableTimes(tableId: number, times: number | 'max'): number {
    let count = 0;
    const max = times === 'max' ? Number.MAX_SAFE_INTEGER : times;
    while (count < max && this.upgradeTable(tableId)) count++;
    return count;
  }

  /**
   * 딜러 가챠 뽑기. 등급은 확률로 결정되고, 전직/보유 딜러 효과로 고급 등급 확률이 오를 수 있다.
   * 이미 보유한 딜러가 또 나오면 같은 딜러를 여러 테이블에 배치할 수 없도록 새 자리를 만들지
   * 않고, 중복 재고로 쌓아서 성급 업그레이드에 쓸 수 있게 한다.
   */
  pullDealer(): GachaResult | null {
    const cost = this.nextGachaCost();
    if (this.data.cash < cost) return null;
    this.data.cash -= cost;
    const gachaRate = this.jobMultipliers().gacha * this.specialtyMultiplier('gacha');
    const grade = rollGrade(gachaRate);
    const template = rollTemplate(grade);
    this.data.dealerPulls[grade] += 1;
    this.data.missionProgress.pull += 1;

    const existing = this.data.dealers.find((d) => d.templateId === template.id);
    let dealerId: number;
    const isDuplicate = existing !== undefined;
    if (existing) {
      this.data.dupeStock[template.id] = (this.data.dupeStock[template.id] ?? 0) + 1;
      dealerId = existing.id;
    } else {
      const dealer: DealerInstance = { id: this.data.nextDealerId++, level: 1, stars: 1, grade, templateId: template.id, assignedTableId: null };
      this.data.dealers.push(dealer);
      dealerId = dealer.id;
    }

    const newly = checkNewAchievements(this.data.dealerPulls, this.data.achievements);
    this.lastUnlockedAchievements = newly.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!).filter(Boolean);
    this.data.achievements.push(...newly);

    const result: GachaResult = { dealerId, grade, templateId: template.id, isDuplicate };
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
    this.data.missionProgress.upgrade += 1;
    return true;
  }

  /** times번(또는 'max') 연속 딜러 강화. */
  upgradeDealerTimes(dealerId: number, times: number | 'max'): number {
    let count = 0;
    const max = times === 'max' ? Number.MAX_SAFE_INTEGER : times;
    while (count < max && this.upgradeDealer(dealerId)) count++;
    return count;
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
      // 딜러가 새로 배정되면 매장 디자인 레벨 + 디자인 특기 딜러 보너스 + 전직 보너스를 반영해 손님 8명을 새로 뽑는다.
      const designBonus = designBonusFor(this.data.designLevel) * this.specialtyMultiplier('design') * this.jobMultipliers().design;
      table.customerGrades = rollCustomerGrades(SEATS_PER_TABLE, designBonus);
    }

    dealer.assignedTableId = tableId;
  }

  /** 딜러 자동배치: 효율 높은 딜러부터 레벨 높은 테이블부터 순서대로 매칭한다(가장 좋은 조합이 되도록). */
  autoAssignDealers(): void {
    const tier = this.tier;
    const dealersSorted = [...this.data.dealers].sort((a, b) => dealerMultiplier(tier, b) - dealerMultiplier(tier, a));
    const tablesSorted = [...this.data.tables].sort((a, b) => b.level - a.level);

    for (const d of this.data.dealers) {
      if (d.assignedTableId !== null) this.assignDealer(d.id, null);
    }
    const n = Math.min(dealersSorted.length, tablesSorted.length);
    for (let i = 0; i < n; i++) {
      this.assignDealer(dealersSorted[i].id, tablesSorted[i].id);
    }
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

  /** 자동 업그레이드 on일 때 여유 자금으로 테이블 구매/강화, 딜러 강화, 인테리어/바 업그레이드를 자동으로 수행. 가챠와 매장 확장은 제외(재미/의사결정 요소라 수동으로 남김). */
  private autoManage(): void {
    if (!this.data.autoUpgradeEnabled) return;

    let tableCost = this.nextTableCost();
    while (tableCost !== null && this.data.cash >= tableCost) {
      this.buyTable();
      tableCost = this.nextTableCost();
    }

    for (let guard = 0; guard < 100; guard++) {
      const cheapest = [...this.data.tables].sort((a, b) => this.tableUpgradeCost(a) - this.tableUpgradeCost(b))[0];
      if (!cheapest || this.data.cash < this.tableUpgradeCost(cheapest)) break;
      this.upgradeTable(cheapest.id);
    }

    for (let guard = 0; guard < 100; guard++) {
      const cheapest = [...this.data.dealers].sort((a, b) => this.dealerUpgradeCost(a) - this.dealerUpgradeCost(b))[0];
      if (!cheapest || this.data.cash < this.dealerUpgradeCost(cheapest)) break;
      this.upgradeDealer(cheapest.id);
    }

    for (let guard = 0; guard < 50 && this.data.cash >= this.designUpgradeCost(); guard++) this.upgradeDesign();
    for (let guard = 0; guard < 50 && this.data.cash >= this.barUpgradeCost(); guard++) this.upgradeBar();
  }

  /** deltaSeconds만큼 수익을 누적하고, 반환값이 true면 자동 업그레이드가 실제로 실행된 틱이라 화면을 다시 그려야 한다. */
  tick(deltaSeconds: number): boolean {
    const earned = this.totalIncomePerSecond() * deltaSeconds;
    this.data.cash += earned;
    this.data.totalEarned += earned;

    this.autoManageAccumulator += deltaSeconds;
    if (this.autoManageAccumulator >= 1) {
      this.autoManageAccumulator = 0;
      if (this.data.autoUpgradeEnabled) {
        this.autoManage();
        return true;
      }
    }
    return false;
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
    const uid = getCurrentUid();
    if (uid) void saveCloudSave(uid, this.data);
  }

  /**
   * 로그인한 계정의 클라우드 세이브로 현재 상태를 덮어쓴다. 게임을 시작하기 전
   * (Phaser/HUD 초기화 이전에) 반드시 한 번 호출해서 "계정 = 진행상황"이 되게 한다.
   * 이 계정의 클라우드 세이브가 아직 없으면(신규 계정), 이 브라우저에 다른 계정이
   * 남겨뒀을 수도 있는 로컬 데이터를 물려받지 않도록 새 세이브로 시작해서 올려둔다.
   *
   * 버전이 달라도(개발 중 세이브 구조가 바뀌어도) 통째로 밀어버리지 않고, 기본값 위에
   * 클라우드 데이터를 덮어씌우는 방식으로 병합한다 — 그래야 세이브 포맷을 자주 바꿔도
   * 매번 진행상황이 초기화되지 않는다.
   */
  async hydrateFromCloud(): Promise<void> {
    const uid = getCurrentUid();
    if (!uid) return;
    const defaults = createNewSave(getCurrentUsername() ?? '이름없는매장');
    const cloud = await loadCloudSave(uid);
    if (cloud) {
      this.data = {
        ...defaults,
        ...cloud,
        version: SAVE_VERSION,
        missionProgress: { ...defaults.missionProgress, ...(cloud.missionProgress ?? {}) },
        missionClaimed: { ...defaults.missionClaimed, ...(cloud.missionClaimed ?? {}) },
        dealerPulls: { ...defaults.dealerPulls, ...(cloud.dealerPulls ?? {}) },
      };
    } else {
      this.data = defaults;
    }
    await saveCloudSave(uid, this.data);
    persistSave(this.data);
  }

  /**
   * 전체 초기화. beforeunload 시 자동저장이 지워진 세이브를 다시 덮어쓰지 않도록
   * autoSaveDisabled를 켠 뒤 스토리지를 지운다. 호출 후 페이지를 새로고침해야 반영된다.
   */
  resetGame(): void {
    this.autoSaveDisabled = true;
    resetSave();
    const uid = getCurrentUid();
    if (uid) void saveCloudSave(uid, createNewSave());
  }
}
