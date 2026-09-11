import { GameState } from '../game/GameState';
import { formatCash } from '../game/balance';
import { emitStateChanged, gameEvents } from '../game/events';
import { gradeConfig } from '../game/gacha';
import { JOBS } from '../game/jobs';

function gradeHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

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
      case 'pull-dealer':
        changed = this.gameState.pullDealer() !== null;
        break;
      case 'upgrade-dealer':
        if (id !== undefined) changed = this.gameState.upgradeDealer(id);
        break;
      case 'advance-venue':
        changed = this.gameState.advanceVenue();
        break;
      case 'choose-job':
        if (btn.dataset.job) changed = this.gameState.chooseJob(btn.dataset.job);
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

  private renderJobChoiceModal(): string {
    const choices = this.gameState.pendingJobChoices();
    if (!choices || choices.length === 0) return '';
    const cards = choices
      .map(
        (j) => `
        <button class="job-card" data-action="choose-job" data-job="${j.id}">
          <div class="job-name">${j.name}</div>
          <div class="job-desc">${j.description}</div>
        </button>`
      )
      .join('');
    return `
      <div class="job-modal">
        <div class="job-modal-inner">
          <h2>전직을 선택하세요</h2>
          <div class="job-cards">${cards}</div>
        </div>
      </div>`;
  }

  private renderJobPath(): string {
    const path = this.gameState.jobPath;
    if (path.length === 0) return '';
    const names = path.map((id) => JOBS.find((j) => j.id === id)?.name ?? id).join(' → ');
    return `<div class="job-path">전직: ${names}</div>`;
  }

  private renderGachaFlash(): string {
    const last = this.gameState.lastGachaResult;
    if (!last) return '';
    const cfg = gradeConfig(last.grade);
    return `<div class="gacha-flash" style="color:${gradeHex(cfg.color)}">[${cfg.label}] 딜러 #${last.dealerId + 1} 획득!</div>`;
  }

  private render(): void {
    const gs = this.gameState;
    const tier = gs.tier;
    const advanceCost = tier.advanceCost;
    const jobsBlocking = gs.pendingJobChoices() !== null;

    const tableRows = gs.tables
      .map((t) => {
        const income = gs.tableIncomePerSecond(t);
        const upgradeCost = gs.tableUpgradeCost(t);
        const dealerOptions = gs.dealers
          .filter((d) => d.assignedTableId === null || d.assignedTableId === t.id)
          .map((d) => `<option value="${d.id}" ${d.assignedTableId === t.id ? 'selected' : ''}>[${gradeConfig(d.grade).label}] 딜러 #${d.id + 1} (Lv.${d.level})</option>`)
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
        const cfg = gradeConfig(d.grade);
        return `
          <div class="row">
            <div class="row-main">
              <span class="row-title" style="color:${gradeHex(cfg.color)}">[${cfg.label}] 딜러 #${d.id + 1} · Lv.${d.level}</span>
              <span class="row-sub">${d.assignedTableId !== null ? `테이블 #${d.assignedTableId + 1} 배정` : '대기 중 (보유 효과만 적용)'}</span>
            </div>
            <button data-action="upgrade-dealer" data-id="${d.id}" ${gs.cash < upgradeCost ? 'disabled' : ''}>
              교육 (${formatCash(upgradeCost)})
            </button>
          </div>`;
      })
      .join('');

    const nextTableCost = gs.nextTableCost();
    const nextGachaCost = gs.nextGachaCost();

    this.root.innerHTML = `
      ${this.renderJobChoiceModal()}

      <div class="panel-header">
        <h1>${tier.name}</h1>
        <p>${tier.description}</p>
        ${this.renderJobPath()}
      </div>

      <div class="stat-block">
        <div class="cash">${formatCash(gs.cash)}</div>
        <div class="income">+${formatCash(gs.totalIncomePerSecond())}/초</div>
        ${this.renderGachaFlash()}
      </div>

      <div class="action-row">
        <button data-action="buy-table" ${nextTableCost === null || gs.cash < nextTableCost ? 'disabled' : ''}>
          테이블 구매${nextTableCost !== null ? ` (${formatCash(nextTableCost)})` : ' (매장 만석)'}
        </button>
        <button data-action="pull-dealer" ${gs.cash < nextGachaCost ? 'disabled' : ''}>
          딜러 가챠 (${formatCash(nextGachaCost)})
        </button>
      </div>

      <section>
        <h2>테이블 (${gs.tables.length}/${tier.maxTables})</h2>
        <div class="row-list">${tableRows}</div>
      </section>

      <section>
        <h2>딜러 (${gs.dealers.length})</h2>
        <div class="row-list">${dealerRows || '<p class="empty">뽑은 딜러가 없습니다.</p>'}</div>
      </section>

      <div class="advance-block">
        ${
          jobsBlocking
            ? '<p class="final-tier">전직을 먼저 선택해야 매장을 확장할 수 있습니다.</p>'
            : advanceCost === null
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
