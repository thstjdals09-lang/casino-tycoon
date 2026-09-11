import { GameState } from '../game/GameState';
import { formatCash } from '../game/balance';
import { emitStateChanged, gameEvents } from '../game/events';

export class HUD {
  private root: HTMLElement;
  private gameState: GameState;

  constructor(root: HTMLElement, gameState: GameState) {
    this.root = root;
    this.gameState = gameState;

    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    gameEvents.addEventListener('state-changed', () => this.render());

    this.render();
  }

  /** 자동 수입으로 오르는 숫자(잔고 등)를 주기적으로 다시 그리기 위한 훅. */
  refresh(): void {
    this.render();
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id !== undefined ? Number(btn.dataset.id) : undefined;

    let changed = false;
    switch (action) {
      case 'buy-table':
        changed = this.gameState.buyTable();
        break;
      case 'upgrade-table':
        if (id !== undefined) changed = this.gameState.upgradeTable(id);
        break;
      case 'hire-dealer':
        changed = this.gameState.hireDealer();
        break;
      case 'upgrade-dealer':
        if (id !== undefined) changed = this.gameState.upgradeDealer(id);
        break;
      case 'advance-venue':
        changed = this.gameState.advanceVenue();
        break;
    }
    if (changed) {
      this.gameState.save();
      emitStateChanged();
    }
  }

  private onChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    if (target.dataset.action !== 'assign-dealer') return;
    const dealerId = Number(target.dataset.id);
    const tableId = target.value === '' ? null : Number(target.value);
    this.gameState.assignDealer(dealerId, tableId);
    this.gameState.save();
    emitStateChanged();
  }

  private render(): void {
    const gs = this.gameState;
    const tier = gs.tier;
    const advanceCost = tier.advanceCost;

    const tableRows = gs.tables
      .map((t) => {
        const income = gs.tableIncomePerSecond(t);
        const upgradeCost = gs.tableUpgradeCost(t);
        const dealerOptions = gs.dealers
          .filter((d) => d.assignedTableId === null || d.assignedTableId === t.id)
          .map((d) => `<option value="${d.id}" ${d.assignedTableId === t.id ? 'selected' : ''}>딜러 #${d.id + 1} (Lv.${d.level})</option>`)
          .join('');

        return `
          <div class="row">
            <div class="row-main">
              <span class="row-title">테이블 #${t.id + 1} · Lv.${t.level}</span>
              <span class="row-sub">${formatCash(income)}/초</span>
            </div>
            <select data-action="assign-dealer" data-id="${t.id}">
              <option value="">딜러 없음</option>
              ${dealerOptions}
            </select>
            <button data-action="upgrade-table" data-id="${t.id}" ${gs.cash < upgradeCost ? 'disabled' : ''}>
              강화 (${formatCash(upgradeCost)})
            </button>
          </div>`;
      })
      .join('');

    const dealerRows = gs.dealers
      .map((d) => {
        const upgradeCost = gs.dealerUpgradeCost(d);
        return `
          <div class="row">
            <div class="row-main">
              <span class="row-title">딜러 #${d.id + 1} · Lv.${d.level}</span>
              <span class="row-sub">${d.assignedTableId !== null ? `테이블 #${d.assignedTableId + 1} 배정` : '대기 중'}</span>
            </div>
            <button data-action="upgrade-dealer" data-id="${d.id}" ${gs.cash < upgradeCost ? 'disabled' : ''}>
              교육 (${formatCash(upgradeCost)})
            </button>
          </div>`;
      })
      .join('');

    const nextTableCost = gs.nextTableCost();
    const nextDealerCost = gs.nextDealerCost();

    this.root.innerHTML = `
      <div class="panel-header">
        <h1>${tier.name}</h1>
        <p>${tier.description}</p>
      </div>

      <div class="stat-block">
        <div class="cash">${formatCash(gs.cash)}</div>
        <div class="income">+${formatCash(gs.totalIncomePerSecond())}/초</div>
      </div>

      <div class="action-row">
        <button data-action="buy-table" ${nextTableCost === null || gs.cash < nextTableCost ? 'disabled' : ''}>
          테이블 구매${nextTableCost !== null ? ` (${formatCash(nextTableCost)})` : ' (매장 만석)'}
        </button>
        <button data-action="hire-dealer" ${gs.cash < nextDealerCost ? 'disabled' : ''}>
          딜러 고용 (${formatCash(nextDealerCost)})
        </button>
      </div>

      <section>
        <h2>테이블 (${gs.tables.length}/${tier.maxTables})</h2>
        <div class="row-list">${tableRows}</div>
      </section>

      <section>
        <h2>딜러 (${gs.dealers.length})</h2>
        <div class="row-list">${dealerRows || '<p class="empty">고용된 딜러가 없습니다.</p>'}</div>
      </section>

      <div class="advance-block">
        ${
          advanceCost === null
            ? '<p class="final-tier">국내 최고 카지노에 도달했습니다!</p>'
            : `
          <div class="advance-progress">
            <div class="advance-progress-bar" style="width:${Math.min(100, (gs.cash / advanceCost) * 100)}%"></div>
          </div>
          <button class="advance-btn" data-action="advance-venue" ${gs.canAdvanceVenue() ? '' : 'disabled'}>
            매장 확장 (${formatCash(advanceCost)})
          </button>`
        }
      </div>
    `;
  }
}
