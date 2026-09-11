import { GameState } from '../game/GameState';
import { formatCash } from '../game/balance';
import { emitStateChanged, gameEvents } from '../game/events';
import { DEALER_GRADES, gradeConfig, type DealerGrade } from '../game/gacha';
import { JOBS } from '../game/jobs';
import { ACHIEVEMENTS } from '../game/achievements';
import { customerGradeConfig } from '../game/customers';

type Tab = 'table' | 'dealer' | 'venue';
type OwnedFilter = 'all' | 'owned' | 'unowned';
type GradeFilter = DealerGrade | 'all';

function gradeHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

export class HUD {
  private root: HTMLElement;
  private gameState: GameState;
  private tab: Tab = 'table';
  private ownedFilter: OwnedFilter = 'all';
  private gradeFilter: GradeFilter = 'all';
  private suppressScrollRestore = false;
  private settingsOpen = false;

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

    if (action === 'open-settings') {
      this.settingsOpen = true;
      this.render();
      return;
    }
    if (action === 'close-settings') {
      this.settingsOpen = false;
      this.render();
      return;
    }
    if (action === 'set-tab' && btn.dataset.tab) {
      this.tab = btn.dataset.tab as Tab;
      this.suppressScrollRestore = true;
      this.render();
      return;
    }
    if (action === 'set-owned-filter' && btn.dataset.filter) {
      this.ownedFilter = btn.dataset.filter as OwnedFilter;
      this.render();
      return;
    }
    if (action === 'set-grade-filter' && btn.dataset.filter) {
      this.gradeFilter = btn.dataset.filter as GradeFilter;
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
      case 'upgrade-design':
        changed = this.gameState.upgradeDesign();
        break;
      case 'upgrade-bar':
        changed = this.gameState.upgradeBar();
        break;
      case 'reset-game':
        if (window.confirm('정말 초기화할까요? 현금/테이블/딜러/전직/도감이 전부 사라지고 처음부터 다시 시작합니다.')) {
          this.gameState.resetGame();
          window.location.reload();
        }
        return;
    }
    if (changed) {
      this.gameState.save();
      emitStateChanged();
    }
  }

  private onChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    if (target.dataset.action !== 'assign-dealer') return;
    // select의 data-id는 "테이블" id, value는 선택된 "딜러" id — 반대로 읽으면 조용히 실패한다.
    const tableId = Number(target.dataset.id);
    const dealerId = target.value === '' ? null : Number(target.value);
    if (dealerId === null) {
      // "딜러 없음" 선택 시: 이 테이블에 배정돼 있던 딜러가 있으면 해제.
      const current = this.gameState.dealers.find((d) => d.assignedTableId === tableId);
      if (current) this.gameState.assignDealer(current.id, null);
    } else {
      this.gameState.assignDealer(dealerId, tableId);
    }
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
          .map((d) => {
            const label =
              d.assignedTableId === null
                ? '대기 중'
                : d.assignedTableId === t.id
                ? '이 테이블'
                : `테이블 #${d.assignedTableId + 1}에서 이동`;
            return `<option value="${d.id}" ${d.assignedTableId === t.id ? 'selected' : ''}>[${gradeConfig(d.grade).label}] 딜러 #${d.id + 1} (Lv.${d.level}) · ${label}</option>`;
          })
          .join('');
        const custBadge =
          t.customerGrades.length > 0
            ? (() => {
                const order: Array<'S' | 'A' | 'B' | 'C'> = ['S', 'A', 'B', 'C'];
                const tally = order
                  .map((g) => ({ g, n: t.customerGrades.filter((x) => x === g).length }))
                  .filter((e) => e.n > 0)
                  .map((e) => `<span style="color:${gradeHex(customerGradeConfig(e.g).color)}">${e.g}×${e.n}</span>`)
                  .join(' ');
                return `<span class="cust-badge">👥 ${t.customerGrades.length}/8 (${tally})</span>`;
              })()
            : '';

        return `
          <div class="row">
            <div class="row-main">
              <span class="row-title">♠ 테이블 #${t.id + 1} · Lv.${t.level}${t.level > 0 && t.level % 10 === 0 ? ' ⭐' : ''} ${custBadge}</span>
              <span class="row-sub">${formatCash(income)}/초</span>
            </div>
            <div class="row-details">
              <select data-action="assign-dealer" data-id="${t.id}">
                <option value="">딜러 없음</option>
                ${dealerOptions}
              </select>
              <button data-action="upgrade-table" data-id="${t.id}" data-cost="${upgradeCost}" ${gs.cash < upgradeCost ? 'disabled' : ''}>
                강화 (${formatCash(upgradeCost)})
              </button>
            </div>
          </div>`;
      })
      .join('');

    return `
      <button class="big-action" data-action="buy-table" data-cost="${nextTableCost ?? Infinity}" ${nextTableCost === null || gs.cash < nextTableCost ? 'disabled' : ''}>
        + 테이블 구매${nextTableCost !== null ? ` (${formatCash(nextTableCost)})` : ' (매장 만석)'}
      </button>
      <div class="row-list">${rows}</div>
      <p class="tab-caption">테이블 (${gs.tables.length}/${tier.maxTables}) · 딜러 배정 시 손님 최대 8명이 착석하며 등급이 높을수록 더 씀씀이가 좋습니다</p>`;
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
            <div class="row-details">
              <button data-action="upgrade-dealer" data-id="${d.id}" data-cost="${upgradeCost}" ${gs.cash < upgradeCost ? 'disabled' : ''}>
                교육 (${formatCash(upgradeCost)})
              </button>
            </div>
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

    // 등급별 효과 도감: 보유(pulls>0)면 컬러, 미보유면 무채색.
    const gradeCompendium = DEALER_GRADES.filter((g) => this.gradeFilter === 'all' || this.gradeFilter === g.grade)
      .filter((g) => {
        const owned = pulls[g.grade] > 0;
        if (this.ownedFilter === 'owned') return owned;
        if (this.ownedFilter === 'unowned') return !owned;
        return true;
      })
      .map((g) => {
        const owned = pulls[g.grade] > 0;
        const colorStyle = owned ? `color:${gradeHex(g.color)}` : 'color:#7a6a5a; filter:grayscale(1);';
        return `
          <div class="row ${owned ? '' : 'row-unowned'}">
            <div class="row-main">
              <span class="row-title" style="${colorStyle}">${owned ? '' : '🔒 '}[${g.label}] (보유 ${pulls[g.grade]}명)</span>
              <span class="row-sub">보유효과: 전체수익 +${((g.passiveMultiplier) * 100).toFixed(1)}%/명(누적) · 배치효과: x${g.assignedMultiplier} · 레벨업 배율: x${g.levelBonusMultiplier}</span>
            </div>
          </div>`;
      })
      .join('');

    const ownedFilterBtn = (f: OwnedFilter, label: string) =>
      `<button class="chip ${this.ownedFilter === f ? 'active' : ''}" data-action="set-owned-filter" data-filter="${f}">${label}</button>`;
    const gradeFilterBtn = (f: GradeFilter, label: string) =>
      `<button class="chip ${this.gradeFilter === f ? 'active' : ''}" data-action="set-grade-filter" data-filter="${f}">${label}</button>`;

    return `
      <button class="big-action gacha" data-action="pull-dealer" data-cost="${nextGachaCost}" ${gs.cash < nextGachaCost ? 'disabled' : ''}>
        🎰 딜러 가챠 (${formatCash(nextGachaCost)})
      </button>
      ${flash}
      ${unlockedFlash}
      <div class="row-list">${rows || '<p class="empty">뽑은 딜러가 없습니다.</p>'}</div>
      <p class="tab-caption">딜러 (${gs.dealers.length}) · N 60% · R 28% · SR 10% · SSR 2%</p>

      <h3 class="section-title">📖 딜러 도감</h3>
      <div class="filter-row">
        ${ownedFilterBtn('all', '전체')}${ownedFilterBtn('owned', '보유')}${ownedFilterBtn('unowned', '미보유')}
      </div>
      <div class="filter-row">
        ${gradeFilterBtn('all', '등급 전체')}${gradeFilterBtn('N', 'N')}${gradeFilterBtn('R', 'R')}${gradeFilterBtn('SR', 'SR')}${gradeFilterBtn('SSR', 'SSR')}
      </div>
      <div class="row-list">${gradeCompendium}</div>

      <h3 class="section-title">🏆 업적</h3>
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

    const designCost = gs.designUpgradeCost();
    const barCost = gs.barUpgradeCost();

    return `
      <div class="venue-card">
        <h2>${tier.name}</h2>
        <p>${tier.description}</p>
        ${jobPathHtml}
      </div>

      <h3 class="section-title">🛋️ 인테리어 디자인 (Lv.${gs.designLevel})</h3>
      <p class="tab-caption">디자인이 좋을수록 씀씀이 좋은 손님(단골/큰손/VIP)이 올 확률이 올라갑니다.</p>
      <button class="big-action design" data-action="upgrade-design" data-cost="${designCost}" ${gs.cash < designCost ? 'disabled' : ''}>
        🖼️ 인테리어 업그레이드 (${formatCash(designCost)})
      </button>

      <h3 class="section-title">🍸 미니바 (Lv.${gs.barLevel})</h3>
      <p class="tab-caption">${gs.barLevel > 0 ? `현재 음료 가격 ${formatCash(gs.drinkPrice())} · 초당 매출 ${formatCash(gs.barIncomePerSecond())}` : '아직 바가 없습니다. 업그레이드하면 음료 판매를 시작합니다.'}</p>
      <button class="big-action bar" data-action="upgrade-bar" data-cost="${barCost}" ${gs.cash < barCost ? 'disabled' : ''}>
        🍹 바 업그레이드 (${formatCash(barCost)})
      </button>

      <div class="advance-block">
        ${
          jobsBlocking
            ? '<p class="final-tier">전직을 먼저 선택해야 매장을 확장할 수 있습니다. (딜러 탭 옆 팝업 확인)</p>'
            : advanceCost === null
            ? '<p class="final-tier">🏆 국내 최고 카지노에 도달했습니다!</p>'
            : gs.tables.length < tier.maxTables
            ? `<p class="final-tier">테이블을 꽉 채우면(${gs.tables.length}/${tier.maxTables}) 다음 층으로 확장할 수 있습니다.</p>`
            : `
          <div class="advance-progress">
            <div class="advance-progress-bar" id="advance-bar" style="width:${Math.min(100, (gs.cash / advanceCost) * 100)}%"></div>
          </div>
          <button class="advance-btn" data-action="advance-venue" data-cost="${advanceCost}" ${gs.canAdvanceVenue() ? '' : 'disabled'}>
            🏗️ 다음 층으로 확장 (${formatCash(advanceCost)}) · 테이블/딜러/인테리어/바 그대로 유지
          </button>`
        }
      </div>`;
  }

  private renderSettingsModal(): string {
    if (!this.settingsOpen) return '';
    return `
      <div class="job-modal">
        <div class="job-modal-inner">
          <h2>⚙️ 설정</h2>
          <div class="job-cards">
            <button class="danger-btn" data-action="reset-game">🗑️ 처음부터 다시 시작 (전체 초기화)</button>
          </div>
          <button class="close-settings-btn" data-action="close-settings">닫기</button>
        </div>
      </div>`;
  }

  private render(): void {
    const gs = this.gameState;

    const tabContent =
      this.tab === 'table' ? this.renderTableTab() : this.tab === 'dealer' ? this.renderDealerTab() : this.renderVenueTab();

    // 전체 다시 그리기 전에 스크롤 위치를 저장해뒀다가 그대로 복원 (강화 버튼 눌렀을 때 목록이 맨 위로 튀는 문제 방지).
    // 단, 탭을 새로 전환한 경우엔 새 탭이니 위에서부터 보여준다.
    const prevScroll = this.suppressScrollRestore ? 0 : this.root.querySelector('.tab-content')?.scrollTop ?? 0;
    this.suppressScrollRestore = false;

    this.root.innerHTML = `
      ${this.renderJobChoiceModal()}
      ${this.renderSettingsModal()}

      <div class="stat-bar">
        <div class="cash" id="hud-cash">💰 ${formatCash(gs.cash)}</div>
        <div class="income" id="hud-income">+${formatCash(gs.totalIncomePerSecond())}/초</div>
        <button class="settings-btn" data-action="open-settings">⚙️</button>
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

    const newTabContent = this.root.querySelector('.tab-content');
    if (newTabContent) newTabContent.scrollTop = prevScroll;
  }
}
