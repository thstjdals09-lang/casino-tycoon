import type { DealerInstance, GameSaveData, TableInstance, VenueTierConfig } from './types';
import { costForNth, dealerMultiplier, isFinalTier, tableLevelMultiplier, tierOf } from './balance';
import { createNewSave, loadSave, persistSave } from './SaveManager';

const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000; // 오프라인 수익은 최대 8시간까지만 인정
const TAP_COOLDOWN_MS = 3000;
const TAP_BONUS_SECONDS = 5;

export interface OfflineEarningsResult {
  elapsedMs: number;
  earned: number;
}

export class GameState {
  private data: GameSaveData;

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

  dealerFor(table: TableInstance): DealerInstance | null {
    if (table.dealerId === null) return null;
    return this.data.dealers.find((d) => d.id === table.dealerId) ?? null;
  }

  tableIncomePerSecond(table: TableInstance): number {
    const tier = this.tier;
    const dealer = this.dealerFor(table);
    const base = tier.tableBaseIncome * tableLevelMultiplier(tier, table.level);
    const dealerMult = dealerMultiplier(tier, dealer?.level ?? null);
    return base * dealerMult * this.data.prestigeMultiplier;
  }

  totalIncomePerSecond(): number {
    return this.data.tables.reduce((sum, t) => sum + this.tableIncomePerSecond(t), 0);
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

  nextDealerCost(): number {
    const tier = this.tier;
    return costForNth(tier.dealerBaseHireCost, tier.dealerHireCostGrowth, this.data.dealers.length);
  }

  dealerUpgradeCost(dealer: DealerInstance): number {
    const tier = this.tier;
    return costForNth(tier.dealerBaseUpgradeCost, tier.dealerUpgradeCostGrowth, dealer.level - 1);
  }

  canAdvanceVenue(): boolean {
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

  hireDealer(): boolean {
    const cost = this.nextDealerCost();
    if (this.data.cash < cost) return false;
    this.data.cash -= cost;
    this.data.dealers.push({ id: this.data.nextDealerId++, level: 1, assignedTableId: null });
    return true;
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
    const bonus = this.tableIncomePerSecond(table) * TAP_BONUS_SECONDS;
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
    const earned = this.totalIncomePerSecond() * (elapsedMs / 1000);
    this.data.cash += earned;
    this.data.totalEarned += earned;
    return { elapsedMs, earned };
  }

  save(): void {
    this.data.lastSavedAt = Date.now();
    persistSave(this.data);
  }
}
