import { GameState } from '../game/GameState';
import { formatCash } from '../game/balance';
import { emitStateChanged, gameEvents } from '../game/events';
import { gradeConfig } from '../game/gacha';
import { JOBS } from '../game/jobs';
import { ACHIEVEMENTS } from '../game/achievements';

type Tab = 'table' | 'dealer' | 'venue';

function gradeHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

export class HUD {
  private root: HTMLElement;
  private gameState: GameState;
  private tab: Tab = 'table';

  constructor(root: HTMLElement, gameState: GameState) {
    this.root = root;
    this.gameState = gameState;

    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    gameEvents.addEventListener('state-changed', () => this.render());

    this.render();
  }

  /**
   * 매 틱(250ms)마다 호출되는 가벼운 갱신. 잔고처럼 계속 바뀌는 숫자와
   * 버튼 활성/비활성만 갱신하고 DOM 구조는 절대 다시 그리지 않는다.
   * (select 드롭다운이 열려 있는 도중에 innerHTML을 통째로 갈아치우면
   * 드롭다운이 열리자마자 닫혀버리는 문제가 있었음 — 그래서 분리함.)
   */
  refresh(): void {
    const gs = this.gameState;
    const cashEl = this.root.querySelector('#hud-cash');
    if (cashEl) cashEl.textContent = `💰 ${formatCash(gs.cash)}`;
    const incomeEl = this.root.querySelector('#hud-income');
    if (incomeEl) incomeEl.textContent = `+${formatCash(gs.totalIncomePerSecond())}/초`;

    this.root.querySelectorAll<HTMLButtonElement>('button[data-cost]').forEach((btn) => {
      const cost = Number(btn.dataset.cost);
      btn.disabled = gs.cash < cost;
    });

    const advanceCost = gs.tier.advanceCost;
    const bar = this.root.querySelector<HTMLElement>('#advance-bar');
    if (bar && advanceCost !== null) {
      bar.style.width = `${Math.min(100, (gs.cash / advanceCost) * 100)}%`;
    }
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id !== undefined ? Number(btn.dataset.id) : undefined;

    if (action === 'set-tab' && btn.dataset.tab) {
      this.tab = btn.dataset.tab as Tab;
      this.render();
      return;
    }

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
          <h2>✨ 전직을 선택하세요</h2>
          <div class="job-cards">${cards}</div>
        </div>
      </div>`;
  }

  private renderTableTab(): string {
    const gs = this.gameState;
    const tier = gs.tier;
    const nextTableCost = gs.nextTableCost();

    const rows = gs.tables
      .map((t) => {
        const income = gs.tableIncomePerSecond(t);
        const upgradeCost = gs.tableUpgradeCost(t);
        const dealerOptions = gs.dealers
          .filter((d) => d.assignedTableId === null || d.assignedTableId === t.id)
          .map(
            (d) =>
              `<option value="${d.id}" ${d.assignedTableId === t.id ? 'selected' : ''}>[${gradeConfig(d.grade).label}] 딜러 #${d.id + 1} (Lv.${d.level})</option>`
          )
          .join('');

        return `
          <div class="row">
            <div class="row-main">
              <span class="row-title">♠ 테이블 #${t.id + 1} · Lv.${t.level}</span>
              <span class="row-sub">${formatCash(income)}/초</span>
            </div>
            <select data-action="assign-dealer" data-id="${t.id}">
              <option value="">딜러 없음</option>
              ${dealerOptions}
            </select>
            <button data-action="upgrade-table" data-id="${t.id}" data-cost="${upgradeCost}" ${gs.cash < upgradeCost ? 'disabled' : ''}>
              강화 (${formatCash(upgradeCost)})
            </button>
          </div>`;
      })
      .join('');

    return `
      <button class="big-action" data-action="buy-table" data-cost="${nextTableCost ?? Infinity}" ${nextTableCost === null || gs.cash < nextTableCost ? 'disabled' : ''}>
        + 테이블 구매${nextTableCost !== null ? ` (${formatCash(nextTableCost)})` : ' (매장 만석)'}
      </button>
      <div class="row-list">${rows}</div>
      <p class="tab-caption">테이블 (${gs.tables.length}/${tier.maxTables})</p>`;
  }

  private renderDealerTab(): string {
    const gs = this.gameState;
    const nextGachaCost = gs.nextGachaCost();
    const last = gs.lastGachaResult;

    const flash = last
      ? (() => {
          const cfg = gradeConfig(last.grade);
          return `<div class="gacha-flash" style="color:${gradeHex(cfg.color)}">🎉 [${cfg.label}] 딜러 #${last.dealerId + 1} 획득!</div>`;
        })()
      : '';

    const unlockedFlash = gs.lastUnlocked
      .map((a) => `<div class="gacha-flash achievement-flash">🏆 업적 달성: ${a.name} (수익 x${a.incomeMultiplier})</div>`)
      .join('');

    const rows = gs.dealers
      .map((d) => {
        const upgradeCost = gs.dealerUpgradeCost(d);
        const cfg = gradeConfig(d.grade);
        return `
          <div class="row">
            <div class="row-main">
              <span class="row-title" style="color:${gradeHex(cfg.color)}">[${cfg.label}] 딜러 #${d.id + 1} · Lv.${d.level}</span>
              <span class="row-sub">${d.assignedTableId !== null ? `테이블 #${d.assignedTableId + 1} 배정 중` : '대기 중 (보유 효과만 적용)'}</span>
            </div>
            <button data-action="upgrade-dealer" data-id="${d.id}" data-cost="${upgradeCost}" ${gs.cash < upgradeCost ? 'disabled' : ''}>
              교육 (${formatCash(upgradeCost)})
            </button>
          </div>`;
      })
      .join('');

    const pulls = gs.dealerPulls;
    const achievementRows = ACHIEVEMENTS.map((a) => {
      const done = gs.achievements.includes(a.id);
      return `
        <div class="row ${done ? 'row-done' : ''}">
          <div class="row-main">
            <span class="row-title">${done ? '✅' : '🔒'} ${a.name}</span>
            <span class="row-sub">${a.description}</span>
          </div>
          <span class="row-badge">${done ? `x${a.incomeMultiplier}` : ''}</span>
        </div>`;
    }).join('');

    return `
      <button class="big-action gacha" data-action="pull-dealer" data-cost="${nextGachaCost}" ${gs.cash < nextGachaCost ? 'disabled' : ''}>
        🎰 딜러 가챠 (${formatCash(nextGachaCost)})
      </button>
      ${flash}
      ${unlockedFlash}
      <div class="row-list">${rows || '<p class="empty">뽑은 딜러가 없습니다.</p>'}</div>
      <p class="tab-caption">딜러 (${gs.dealers.length}) · N 60% · R 28% · SR 10% · SSR 2%</p>

      <h3 class="section-title">📖 딜러 도감</h3>
      <p class="tab-caption">누적 고용 N ${pulls.N} · R ${pulls.R} · SR ${pulls.SR} · SSR ${pulls.SSR}</p>
      <div class="row-list">${achievementRows}</div>`;
  }

  private renderVenueTab(): string {
    const gs = this.gameState;
    const tier = gs.tier;
    const advanceCost = tier.advanceCost;
    const jobsBlocking = gs.pendingJobChoices() !== null;
    const path = gs.jobPath;
    const jobPathHtml =
      path.length > 0
        ? `<div class="job-path">전직: ${path.map((id) => JOBS.find((j) => j.id === id)?.name ?? id).join(' → ')}</div>`
        : '<div class="job-path">아직 전직 전</div>';

    return `
      <div class="venue-card">
        <h2>${tier.name}</h2>
        <p>${tier.description}</p>
        ${jobPathHtml}
      </div>
      <div class="advance-block">
        ${
          jobsBlocking
            ? '<p class="final-tier">전직을 먼저 선택해야 매장을 확장할 수 있습니다. (딜러 탭 옆 팝업 확인)</p>'
            : advanceCost === null
            ? '<p class="final-tier">🏆 국내 최고 카지노에 도달했습니다!</p>'
            : `
          <div class="advance-progress">
            <div class="advance-progress-bar" id="advance-bar" style="width:${Math.min(100, (gs.cash / advanceCost) * 100)}%"></div>
          </div>
          <button class="advance-btn" data-action="advance-venue" data-cost="${advanceCost}" ${gs.canAdvanceVenue() ? '' : 'disabled'}>
            🏗️ 매장 확장 (${formatCash(advanceCost)})
          </button>`
        }
      </div>`;
  }

  private render(): void {
    const gs = this.gameState;

    const tabContent =
      this.tab === 'table' ? this.renderTableTab() : this.tab === 'dealer' ? this.renderDealerTab() : this.renderVenueTab();

    this.root.innerHTML = `
      ${this.renderJobChoiceModal()}

      <div class="stat-bar">
        <div class="cash" id="hud-cash">💰 ${formatCash(gs.cash)}</div>
        <div class="income" id="hud-income">+${formatCash(gs.totalIncomePerSecond())}/초</div>
      </div>

      <div class="tab-content">${tabContent}</div>

      <nav class="bottom-nav">
        <button class="nav-btn ${this.tab === 'table' ? 'active' : ''}" data-action="set-tab" data-tab="table">
          <span class="nav-icon">♠</span><span>테이블</span>
        </button>
        <button class="nav-btn ${this.tab === 'dealer' ? 'active' : ''}" data-action="set-tab" data-tab="dealer">
          <span class="nav-icon">🎰</span><span>딜러</span>
        </button>
        <button class="nav-btn ${this.tab === 'venue' ? 'active' : ''}" data-action="set-tab" data-tab="venue">
          <span class="nav-icon">♦</span><span>매장</span>
        </button>
      </nav>
    `;
  }
}
