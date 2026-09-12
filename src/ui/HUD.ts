import { GameState, type DailyLoginResult, type OfflineEarningsResult, type GachaResult } from '../game/GameState';
import { getCurrentUsername, logout } from '../game/account';
import { formatCash, VENUE_TIERS } from '../game/balance';
import { emitStateChanged, gameEvents } from '../game/events';
import { gradeConfig, type DealerGrade } from '../game/gacha';
import { JOBS } from '../game/jobs';
import { ACHIEVEMENTS } from '../game/achievements';
import { customerGradeConfig } from '../game/customers';
import { DEALER_ROSTER, STAR_CONFIG, accessoryForGrade, specialtyMeta, templateById } from '../game/dealerRoster';
import { HUMANOID_BASE_PALETTE, gridToSvg, humanoidGrid } from '../game/pixelart';

const GRADE_ORDER: DealerGrade[] = ['SSR', 'SR', 'R', 'N'];

type Tab = 'table' | 'venue';
type OwnedFilter = 'all' | 'owned' | 'unowned';
type GradeFilter = DealerGrade | 'all';

function gradeHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function starsDisplay(stars: number, maxStars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, maxStars - stars));
}

function dealerPortraitSvg(grade: DealerGrade, colorHex: string): string {
  const grid = humanoidGrid(accessoryForGrade(grade));
  return gridToSvg(grid, { ...HUMANOID_BASE_PALETTE, v: colorHex, c: '#ffd700', a: '#e0455c' }, 4);
}

export class HUD {
  private root: HTMLElement;
  private gameState: GameState;
  private tab: Tab = 'table';
  private ownedFilter: OwnedFilter = 'all';
  private gradeFilter: GradeFilter = 'all';
  private suppressScrollRestore = false;
  private settingsOpen = false;
  private welcomeBack: { offline: OfflineEarningsResult; daily: DailyLoginResult | null } | null = null;
  private nicknameError = '';
  private gachaReveal: GachaResult[] | null = null;
  private continuousBatchSize: number | null = null;
  private bigPopup: 'gacha' | 'roster' | null = null;
  private continuousAccumulatorMs = 0;
  private buyMultiplier: 1 | 10 | 100 | 'max' = 1;

  constructor(root: HTMLElement, gameState: GameState) {
    this.root = root;
    this.gameState = gameState;

    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    this.root.addEventListener('submit', (e) => this.onSubmit(e));
    gameEvents.addEventListener('state-changed', () => this.render());

    this.render();
  }

  /**
   * 매 틱(250ms)마다 호출되는 가벼운 갱신. 잔고처럼 계속 바뀌는 숫자와
   * 버튼 활성/비활성만 갱신하고 DOM 구조는 절대 다시 그리지 않는다.
   */
  refresh(): void {
    const gs = this.gameState;

    if (this.continuousBatchSize !== null) {
      const totalCost = gs.nextGachaCost() * this.continuousBatchSize;
      if (gs.diamonds < totalCost) {
        this.continuousBatchSize = null; // 다이아 부족하면 자동 정지
        this.render();
      } else {
        this.continuousAccumulatorMs += 250;
        if (this.continuousAccumulatorMs >= 1100) {
          this.continuousAccumulatorMs = 0;
          const results = gs.pullDealerMultiple(this.continuousBatchSize);
          if (results.length > 0 && !gs.skipGachaAnimation) this.gachaReveal = results;
          gs.save();
          this.render();
        }
      }
    }

    const cashEl = this.root.querySelector('#hud-cash');
    if (cashEl) cashEl.textContent = `💰 ${formatCash(gs.cash)}`;
    const incomeEl = this.root.querySelector('#hud-income');
    if (incomeEl) incomeEl.textContent = `+${formatCash(gs.totalIncomePerSecond())}/초`;

    const diamondsEl = this.root.querySelector('#hud-diamonds');
    if (diamondsEl) diamondsEl.textContent = String(gs.diamonds);

    this.root.querySelectorAll<HTMLButtonElement>('button[data-diamond-cost]').forEach((btn) => {
      const cost = Number(btn.dataset.diamondCost);
      btn.disabled = gs.diamonds < cost;
    });

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

  /**
   * 게임 시작 시 1회 호출. 오프라인 수익이 있거나 오늘 첫 접속(출석 보상)이면 환영 모달을 띄운다.
   */
  showWelcomeBack(offline: OfflineEarningsResult, daily: DailyLoginResult | null): void {
    if (offline.earned > 0 || daily) {
      this.welcomeBack = { offline, daily };
      this.render();
    }
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;

    // 팝업(job-modal) 바깥의 어두운 배경을 직접 눌렀을 때 닫기. 전직 선택처럼 반드시
    // 응답해야 하는 모달(닫기 버튼이 없음)은 배경 클릭으로 닫히지 않게 자연히 제외됨.
    if (target.classList.contains('job-modal')) {
      if (this.gachaReveal) {
        this.gachaReveal = null;
        this.render();
      } else if (this.welcomeBack) {
        this.welcomeBack = null;
        this.render();
      } else if (this.settingsOpen) {
        this.settingsOpen = false;
        this.render();
      } else if (this.bigPopup) {
        this.bigPopup = null;
        this.render();
      }
      return;
    }

    const btn = target.closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id !== undefined ? Number(btn.dataset.id) : undefined;

    if (action === 'close-welcome') {
      this.welcomeBack = null;
      this.render();
      return;
    }
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
    if (action === 'open-big-popup' && btn.dataset.popup) {
      this.bigPopup = btn.dataset.popup as 'gacha' | 'roster';
      this.render();
      return;
    }
    if (action === 'close-big-popup') {
      this.bigPopup = null;
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
    if (action === 'set-buy-multiplier' && btn.dataset.mult) {
      this.buyMultiplier = (btn.dataset.mult === 'max' ? 'max' : Number(btn.dataset.mult)) as 1 | 10 | 100 | 'max';
      this.render();
      return;
    }

    let changed = false;
    switch (action) {
      case 'buy-table':
        changed = this.gameState.buyTable();
        break;
      case 'upgrade-table':
        if (id !== undefined) changed = this.gameState.upgradeTableTimes(id, this.buyMultiplier) > 0;
        break;
      case 'pull-dealer':
        changed = this.gameState.pullDealer() !== null;
        break;
      case 'upgrade-dealer':
        if (id !== undefined) changed = this.gameState.upgradeDealerTimes(id, this.buyMultiplier) > 0;
        break;
      case 'auto-assign-dealers':
        this.gameState.autoAssignDealers();
        changed = true;
        break;
      case 'upgrade-all-tables':
        changed = this.gameState.upgradeAllTables(this.buyMultiplier) > 0;
        break;
      case 'upgrade-all-dealers':
        changed = this.gameState.upgradeAllDealers(this.buyMultiplier) > 0;
        break;
      case 'upgrade-stars':
        if (btn.dataset.template) changed = this.gameState.upgradeDealerStars(btn.dataset.template);
        break;
      case 'advance-venue':
        changed = this.gameState.advanceVenue();
        break;
      case 'choose-job':
        if (btn.dataset.job) changed = this.gameState.chooseJob(btn.dataset.job);
        break;
      case 'upgrade-design':
        changed = this.gameState.upgradeDesignTimes(this.buyMultiplier) > 0;
        break;
      case 'upgrade-bar':
        changed = this.gameState.upgradeBarTimes(this.buyMultiplier) > 0;
        break;
      case 'reset-game':
        if (window.confirm('정말 초기화할까요? 현금/테이블/딜러/전직/도감이 전부 사라지고 처음부터 다시 시작합니다.')) {
          this.gameState.resetGame();
          window.location.reload();
        }
        return;
      case 'logout':
        if (window.confirm('로그아웃할까요?')) {
          logout().finally(() => window.location.reload());
        }
        return;
      case 'pull-gacha': {
        const count = Number(btn.dataset.count ?? 1);
        if (this.gameState.autoPullEnabled) {
          // 연속 뽑기 모드: 같은 횟수 버튼을 다시 누르면 정지, 다른 버튼을 누르면 그 횟수로 전환.
          this.continuousBatchSize = this.continuousBatchSize === count ? null : count;
          this.continuousAccumulatorMs = 0;
          this.render();
          return;
        }
        const results = this.gameState.pullDealerMultiple(count);
        if (results.length > 0) {
          if (!this.gameState.skipGachaAnimation) this.gachaReveal = results;
          changed = true;
        }
        break;
      }
      case 'close-gacha-reveal':
        this.gachaReveal = null;
        this.render();
        return;
      case 'toggle-skip-gacha-animation':
        this.gameState.toggleSkipGachaAnimation();
        changed = true;
        break;
      case 'toggle-auto-pull':
        this.gameState.toggleAutoPull();
        if (!this.gameState.autoPullEnabled) this.continuousBatchSize = null; // 모드 끄면 진행 중인 반복도 정지
        changed = true;
        break;
      case 'stop-continuous-pull':
        this.continuousBatchSize = null;
        this.render();
        return;
    }
    if (changed) {
      this.gameState.save();
      emitStateChanged();
    }
  }

  private onSubmit(e: Event) {
    const form = e.target as HTMLElement;
    if (!form.classList.contains('nickname-form')) return;
    e.preventDefault();
    const input = (form as HTMLFormElement).querySelector<HTMLInputElement>('#venue-name-input');
    if (!input) return;
    const ok = this.gameState.setVenueName(input.value);
    this.nicknameError = ok ? '' : '매장 이름은 2~12자로 입력해주세요.';
    this.render();
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

  private multLabel(): string {
    return this.buyMultiplier === 1 ? '' : ` x${this.buyMultiplier === 'max' ? 'MAX' : this.buyMultiplier}`;
  }

  private renderBuyMultiplierRow(): string {
    const options: Array<1 | 10 | 100 | 'max'> = [1, 10, 100, 'max'];
    const chips = options
      .map(
        (m) =>
          `<button class="chip ${this.buyMultiplier === m ? 'active' : ''}" data-action="set-buy-multiplier" data-mult="${m}">${m === 'max' ? 'MAX' : `x${m}`}</button>`
      )
      .join('');
    return `<div class="filter-row buy-mult-row">${chips}</div>`;
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
        const dealerOptions = GRADE_ORDER.map((grade) => {
          const inGrade = gs.dealers.filter((d) => d.grade === grade);
          if (inGrade.length === 0) return '';
          const options = inGrade
            .map((d) => {
              const label =
                d.assignedTableId === null
                  ? '대기 중'
                  : d.assignedTableId === t.id
                  ? '이 테이블'
                  : `테이블 #${d.assignedTableId + 1}에서 이동`;
              const name = templateById(d.templateId).name;
              return `<option value="${d.id}" ${d.assignedTableId === t.id ? 'selected' : ''}>${name} (Lv.${d.level}) · ${label}</option>`;
            })
            .join('');
          return `<optgroup label="${gradeConfig(grade).label} 등급">${options}</optgroup>`;
        }).join('');
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
                강화${this.multLabel()} (${formatCash(upgradeCost)}~)
              </button>
            </div>
          </div>`;
      })
      .join('');

    return `
      <button class="big-action" data-action="buy-table" data-cost="${nextTableCost ?? Infinity}" ${nextTableCost === null || gs.cash < nextTableCost ? 'disabled' : ''}>
        + 테이블 구매${nextTableCost !== null ? ` (${formatCash(nextTableCost)})` : ' (매장 만석)'}
      </button>
      <button class="big-action auto-assign" data-action="auto-assign-dealers" ${gs.dealers.length === 0 ? 'disabled' : ''}>
        🎯 딜러 자동배치 (좋은 딜러 → 좋은 테이블)
      </button>
      <button class="big-action upgrade-all" data-action="upgrade-all-tables" ${gs.tables.length === 0 ? 'disabled' : ''}>
        🔧 전체 테이블 강화${this.multLabel()}
      </button>
      <div class="row-list">${rows}</div>
      <p class="tab-caption">테이블 (${gs.tables.length}/${tier.maxTables}) · 딜러 배정 시 손님 최대 8명이 착석하며 등급이 높을수록 더 씀씀이가 좋습니다</p>`;
  }

  private renderDealerTab(): string {
    const gs = this.gameState;
    const cost = gs.nextGachaCost();
    const last = gs.lastGachaResult;

    const flash = last
      ? (() => {
          const cfg = gradeConfig(last.grade);
          const name = templateById(last.templateId).name;
          const msg = last.isDuplicate ? `${name} 중복! 중복재고 +1 (성급 업그레이드에 사용)` : `${name} 신규 획득!`;
          const gradeClass = `flash-${last.grade.toLowerCase()}`;
          return `<div class="gacha-flash ${gradeClass}" style="color:${gradeHex(cfg.color)}">🎉 [${cfg.label}] ${msg}</div>`;
        })()
      : '';

    const unlockedFlash = gs.lastUnlocked
      .map((a) => `<div class="gacha-flash achievement-flash">🏆 업적 달성: ${a.name} (수익 x${a.incomeMultiplier})</div>`)
      .join('');

    const rows = GRADE_ORDER.flatMap((grade) => gs.dealers.filter((d) => d.grade === grade))
      .map((d) => {
        const upgradeCost = gs.dealerUpgradeCost(d);
        const cfg = gradeConfig(d.grade);
        const template = templateById(d.templateId);
        const meta = specialtyMeta(template.specialty);
        const star = gs.starInfoFor(d.templateId);
        return `
          <div class="row">
            <div class="row-main">
              <span class="row-title" style="color:${gradeHex(cfg.color)}">[${cfg.label}] ${template.name} · Lv.${d.level}</span>
              <span class="row-sub star-line" style="color:${gradeHex(cfg.color)}">${starsDisplay(star.stars, star.maxStars)}${star.isMax ? ' (만성 ✨)' : ` · 중복재고 ${star.dupeStock}/${star.dupeCost}`}</span>
              <span class="row-sub">${d.assignedTableId !== null ? `테이블 #${d.assignedTableId + 1} 배정 중` : '대기 중'} · ${meta.kind}: ${meta.label} +${(template.specialtyValue * 100).toFixed(0)}%p</span>
            </div>
            <div class="row-details">
              <button data-action="upgrade-dealer" data-id="${d.id}" data-cost="${upgradeCost}" ${gs.cash < upgradeCost ? 'disabled' : ''}>
                교육${this.multLabel()} (${formatCash(upgradeCost)}~)
              </button>
              <button data-action="upgrade-stars" data-template="${d.templateId}" ${!star.isMax && star.dupeStock >= star.dupeCost ? '' : 'disabled'}>
                ⭐ 성급 업 (재고 ${star.dupeCost}개)
              </button>
            </div>
          </div>`;
      })
      .join('');

    const pullBtn = (count: number, label: string) => {
      const total = cost * count;
      const isLooping = this.continuousBatchSize === count;
      const diamondAttr = isLooping ? '' : `data-diamond-cost="${total}"`;
      return `<button class="big-action gacha ${isLooping ? 'looping' : ''}" data-action="pull-gacha" data-count="${count}" ${diamondAttr} ${gs.diamonds < total && !isLooping ? 'disabled' : ''}>
        ${isLooping ? `⏸ 반복 중 (${label})` : `${label} (💎${total})`}
      </button>`;
    };

    return `
      <div class="diamond-bar">💎 보유 다이아: <b id="hud-diamonds">${gs.diamonds}</b> · 가챠 1회 💎${cost} (고정가) · 바에서 초당 +${gs.diamondsPerSecond().toFixed(2)}💎</div>
      <div class="gacha-options-row">
        <label class="gacha-checkbox"><input type="checkbox" data-action="toggle-skip-gacha-animation" ${gs.skipGachaAnimation ? 'checked' : ''} /> 연출 스킵</label>
        <label class="gacha-checkbox"><input type="checkbox" data-action="toggle-auto-pull" ${gs.autoPullEnabled ? 'checked' : ''} /> 연속 뽑기(자동)</label>
      </div>
      <div class="gacha-pull-row">
        ${pullBtn(1, '1회 뽑기')}
        ${pullBtn(10, '10회 뽑기')}
      </div>
      <div class="gacha-pull-row">
        ${pullBtn(30, '30회 뽑기')}
        ${pullBtn(100, '100회 뽑기')}
      </div>
      ${
        this.continuousBatchSize !== null
          ? `<button class="big-action stop-continuous" data-action="stop-continuous-pull">⏹ 연속 뽑기 정지 (${this.continuousBatchSize}회 반복 중)</button>`
          : ''
      }
      <button class="big-action auto-assign" data-action="auto-assign-dealers" ${gs.dealers.length === 0 ? 'disabled' : ''}>
        🎯 딜러 자동배치 (좋은 딜러 → 좋은 테이블)
      </button>
      <button class="big-action upgrade-all" data-action="upgrade-all-dealers" ${gs.dealers.length === 0 ? 'disabled' : ''}>
        🔧 전체 딜러 강화${this.multLabel()}
      </button>
      ${flash}
      ${unlockedFlash}
      <div class="row-list">${rows || '<p class="empty">뽑은 딜러가 없습니다.</p>'}</div>
      <p class="tab-caption">딜러 (${gs.dealers.length}) · N 60% · R 28% · SR 10% · SSR 2% · 이미 보유한 딜러가 또 나오면 중복재고로 쌓여요 (같은 딜러 중복 배치 불가, ⭐성급 업으로 소모)</p>`;
  }

  private renderCompendiumTab(): string {
    const gs = this.gameState;
    const pulls = gs.dealerPulls;
    const ownedTemplateIds = new Set(gs.dealers.map((d) => d.templateId));

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

    // 이름 붙은 딜러 개별 도감: 보유(해당 템플릿으로 한 번이라도 뽑음)면 컬러, 미보유면 무채색+실루엣.
    const roster = [...DEALER_ROSTER].sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade));
    const dealerCompendium = roster
      .filter((t) => this.gradeFilter === 'all' || this.gradeFilter === t.grade)
      .filter((t) => {
        const owned = ownedTemplateIds.has(t.id);
        if (this.ownedFilter === 'owned') return owned;
        if (this.ownedFilter === 'unowned') return !owned;
        return true;
      })
      .map((t) => {
        const owned = ownedTemplateIds.has(t.id);
        const gcfg = gradeConfig(t.grade);
        const star = gs.starInfoFor(t.id);
        const colorStyle = owned ? `color:${gradeHex(gcfg.color)}` : 'color:#7a6a5a; filter:grayscale(1);';
        const meta = specialtyMeta(t.specialty);
        const portrait = dealerPortraitSvg(t.grade, gradeHex(gcfg.color));
        return `
          <div class="row compendium-row ${owned ? '' : 'row-unowned'}">
            <div class="dealer-portrait ${owned ? '' : 'portrait-locked'}">${portrait}</div>
            <div class="compendium-info">
              <div class="row-main">
                <span class="row-title" style="${colorStyle}">${owned ? '' : '🔒 '}[${gcfg.label}] ${t.name}</span>
                ${owned ? `<span class="row-sub star-line" style="${colorStyle}">${starsDisplay(star.stars, star.maxStars)}${star.isMax ? ' 만성 ✨' : ` · 중복재고 ${star.dupeStock}/${star.dupeCost}`}</span>` : ''}
                <span class="row-sub">${owned ? t.flavor : '???'}</span>
              </div>
              <div class="effect-detail">
                <div class="effect-line">${meta.kind === '보유효과' ? '👜' : '🪑'} <b>${meta.kind}</b> — ${meta.label} +${(t.specialtyValue * 100).toFixed(0)}%p${meta.kind === '배치효과' ? ' (테이블에 배정 시)' : ' (보유만 해도 적용)'} · 별 하나당 +${(STAR_CONFIG[t.grade].bonusPerStar * 100).toFixed(0)}%</div>
                <div class="effect-line">🌟 <b>만성 각성</b> — ${star.maxStars}성 달성 시 전체 수익 +${(STAR_CONFIG[t.grade].maxStarBonus * 100).toFixed(0)}% 영구 적용</div>
              </div>
            </div>
          </div>`;
      })
      .join('');

    const ownedCount = DEALER_ROSTER.filter((t) => ownedTemplateIds.has(t.id)).length;

    const ownedFilterBtn = (f: OwnedFilter, label: string) =>
      `<button class="chip ${this.ownedFilter === f ? 'active' : ''}" data-action="set-owned-filter" data-filter="${f}">${label}</button>`;
    const gradeFilterBtn = (f: GradeFilter, label: string) =>
      `<button class="chip ${this.gradeFilter === f ? 'active' : ''}" data-action="set-grade-filter" data-filter="${f}">${label}</button>`;

    return `
      <h3 class="section-title">📖 딜러 도감 (${ownedCount}/${DEALER_ROSTER.length})</h3>
      <div class="filter-row">
        ${ownedFilterBtn('all', '전체')}${ownedFilterBtn('owned', '보유')}${ownedFilterBtn('unowned', '미보유')}
      </div>
      <div class="filter-row">
        ${gradeFilterBtn('all', '등급 전체')}${gradeFilterBtn('N', 'N')}${gradeFilterBtn('R', 'R')}${gradeFilterBtn('SR', 'SR')}${gradeFilterBtn('SSR', 'SSR')}
      </div>
      <div class="row-list">${dealerCompendium}</div>

      <h3 class="section-title">🏆 업적 (누적 고용 N ${pulls.N} · R ${pulls.R} · SR ${pulls.SR} · SSR ${pulls.SSR})</h3>
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

      <p class="tab-caption">📋 오늘의 미션과 🏆 실시간 랭킹은 화면 왼쪽 아이콘에서 확인할 수 있어요.</p>

      <h3 class="section-title">🛋️ 인테리어 디자인 (Lv.${gs.designLevel})</h3>
      <p class="tab-caption">디자인이 좋을수록 씀씀이 좋은 손님(단골/큰손/VIP)이 올 확률이 올라갑니다. Lv.3 화분, Lv.6 액자, Lv.10 샹들리에가 매장에 추가돼요.</p>
      <button class="big-action design" data-action="upgrade-design" data-cost="${designCost}" ${gs.cash < designCost ? 'disabled' : ''}>
        🖼️ 인테리어 업그레이드${this.multLabel()} (${formatCash(designCost)}~)
      </button>

      <h3 class="section-title">🍸 미니바 (Lv.${gs.barLevel}) · 💎 다이아 채굴</h3>
      <p class="tab-caption">${gs.barLevel > 0 ? `바에서 초당 💎${gs.diamondsPerSecond().toFixed(2)} 획득 (딜러 가챠 전용 재화)` : '아직 바가 없습니다. 업그레이드하면 바가 생기고 다이아를 산출하기 시작합니다.'}</p>
      ${gs.barLevel > 0 ? `<p class="tab-caption">🍹 취급 메뉴: ${gs.unlockedDrinks().map((d) => d.name).join(' · ')}</p>` : ''}
      <button class="big-action bar" data-action="upgrade-bar" data-cost="${barCost}" ${gs.cash < barCost ? 'disabled' : ''}>
        🍹 바 업그레이드${this.multLabel()} (${formatCash(barCost)}~)
      </button>

      <div class="advance-block">
        ${
          jobsBlocking
            ? '<p class="final-tier">전직을 먼저 선택해야 매장을 확장할 수 있습니다. (화면 하단 팝업 확인)</p>'
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

  private renderGachaRevealModal(): string {
    if (!this.gachaReveal || this.gachaReveal.length === 0) return '';
    const cards = this.gachaReveal
      .map((r, i) => {
        const cfg = gradeConfig(r.grade);
        const template = templateById(r.templateId);
        const portrait = dealerPortraitSvg(r.grade, gradeHex(cfg.color));
        const gradeClass = `grade-${r.grade.toLowerCase()}`;
        const sparkle = r.grade === 'SR' || r.grade === 'SSR' ? '<div class="gacha-card-sparkle">✨</div>' : '';
        const rays = r.grade === 'SSR' ? '<div class="gacha-card-rays"></div>' : '';
        return `
          <div class="gacha-card ${gradeClass}" style="border-color:${gradeHex(cfg.color)}; animation-delay:${i * 60}ms">
            ${rays}
            ${sparkle}
            <div class="gacha-card-portrait">${portrait}</div>
            <div class="gacha-card-name" style="color:${gradeHex(cfg.color)}">[${cfg.label}] ${template.name}</div>
            <div class="gacha-card-tag">${r.isDuplicate ? '중복' : 'NEW'}</div>
          </div>`;
      })
      .join('');
    const newCount = this.gachaReveal.filter((r) => !r.isDuplicate).length;
    const dupeCount = this.gachaReveal.length - newCount;
    return `
      <div class="job-modal">
        <div class="job-modal-inner gacha-reveal-inner">
          <h2>🎰 뽑기 결과 (${this.gachaReveal.length}회)</h2>
          <p class="tab-caption">신규 ${newCount}명 · 중복 ${dupeCount}개</p>
          <div class="gacha-card-grid">${cards}</div>
          <button class="close-settings-btn" data-action="close-gacha-reveal">확인</button>
        </div>
      </div>`;
  }

  private renderWelcomeModal(): string {
    if (!this.welcomeBack) return '';
    const { offline, daily } = this.welcomeBack;
    const offlineLine =
      offline.earned > 0
        ? `<div class="job-desc">⏱️ 자리를 비운 동안(${Math.round(offline.elapsedMs / 60000)}분) <b>${formatCash(offline.earned)}</b> 벌었어요.</div>`
        : '';
    const dailyLine = daily
      ? `<div class="job-desc">📅 ${daily.streak}일 연속 출석! 보상 <b>${formatCash(daily.reward)}</b> 지급됐어요.</div>`
      : '';
    return `
      <div class="job-modal">
        <div class="job-modal-inner">
          <h2>👋 어서오세요!</h2>
          <div class="job-cards">
            ${offlineLine}
            ${dailyLine}
          </div>
          <button class="close-settings-btn" data-action="close-welcome">확인</button>
        </div>
      </div>`;
  }

  private renderSettingsModal(): string {
    if (!this.settingsOpen) return '';
    const gs = this.gameState;
    return `
      <div class="job-modal">
        <div class="job-modal-inner">
          <h2>⚙️ 설정</h2>
          <div class="job-cards">
            <div class="account-section">
              <p class="tab-caption" style="text-align:left">👤 로그인: <b>${getCurrentUsername() ?? '(알 수 없음)'}</b></p>
              <button class="chip" data-action="logout">로그아웃</button>
            </div>
            <div class="nickname-section">
              <p class="tab-caption" style="text-align:left">🏷️ 매장 이름(닉네임) — 채팅/랭킹에 표시돼요</p>
              <form class="nickname-form">
                <input id="venue-name-input" type="text" value="${gs.venueName}" maxlength="12" placeholder="매장 이름" />
                <button type="submit">변경</button>
              </form>
              ${this.nicknameError ? `<p class="auth-error">${this.nicknameError}</p>` : ''}
            </div>
            <button class="danger-btn" data-action="reset-game">🗑️ 처음부터 다시 시작 (전체 초기화)</button>
          </div>
          <button class="close-settings-btn" data-action="close-settings">닫기</button>
        </div>
      </div>`;
  }

  private renderBigPopup(): string {
    if (!this.bigPopup) return '';
    const title = this.bigPopup === 'gacha' ? '🎰 뽑기' : '📖 딜러';
    const content = this.bigPopup === 'gacha' ? this.renderDealerTab() : this.renderCompendiumTab();
    return `
      <div class="job-modal">
        <div class="job-modal-inner big-popup-inner">
          <div class="big-popup-header">
            <h2>${title}</h2>
            <button class="close-settings-btn big-popup-close" data-action="close-big-popup">✕ 닫기</button>
          </div>
          <div class="big-popup-body">${content}</div>
        </div>
      </div>`;
  }

  private render(): void {
    const gs = this.gameState;

    const tabContent = this.tab === 'table' ? this.renderTableTab() : this.renderVenueTab();

    // 전체 다시 그리기 전에 스크롤 위치를 저장해뒀다가 그대로 복원 (강화 버튼 눌렀을 때 목록이 맨 위로 튀는 문제 방지).
    // 단, 탭을 새로 전환한 경우엔 새 탭이니 위에서부터 보여준다.
    const prevScroll = this.suppressScrollRestore ? 0 : this.root.querySelector('.tab-content')?.scrollTop ?? 0;
    this.suppressScrollRestore = false;

    this.root.innerHTML = `
      ${this.renderJobChoiceModal()}
      ${this.renderWelcomeModal()}
      ${this.renderSettingsModal()}
      ${this.renderBigPopup()}
      ${this.renderGachaRevealModal()}

      <div class="stat-bar">
        <div class="cash" id="hud-cash">💰 ${formatCash(gs.cash)}</div>
        <div class="floor-badge">🏢 ${gs.tier.id + 1}/${VENUE_TIERS.length}층</div>
        <div class="income" id="hud-income">+${formatCash(gs.totalIncomePerSecond())}/초</div>
        <button class="settings-btn" data-action="open-settings">⚙️</button>
      </div>
      ${this.renderBuyMultiplierRow()}

      <div class="tab-content">${tabContent}</div>

      <nav class="bottom-nav">
        <button class="nav-btn ${this.tab === 'table' ? 'active' : ''}" data-action="set-tab" data-tab="table">
          <span class="nav-icon">♠</span><span>테이블</span>
        </button>
        <button class="nav-btn ${this.bigPopup === 'gacha' ? 'active' : ''}" data-action="open-big-popup" data-popup="gacha">
          <span class="nav-icon">🎰</span><span>뽑기</span>
        </button>
        <button class="nav-btn ${this.bigPopup === 'roster' ? 'active' : ''}" data-action="open-big-popup" data-popup="roster">
          <span class="nav-icon">📖</span><span>딜러</span>
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
