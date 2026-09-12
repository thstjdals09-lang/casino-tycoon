import { GameState, type DailyLoginResult, type OfflineEarningsResult } from '../game/GameState';
import { formatCash, VENUE_TIERS } from '../game/balance';
import { emitStateChanged, gameEvents } from '../game/events';
import { gradeConfig, type DealerGrade } from '../game/gacha';
import { JOBS } from '../game/jobs';
import { ACHIEVEMENTS } from '../game/achievements';
import { customerGradeConfig } from '../game/customers';
import { DEALER_ROSTER, STAR_CONFIG, accessoryForGrade, specialtyMeta, templateById } from '../game/dealerRoster';
import { HUMANOID_BASE_PALETTE, gridToSvg, humanoidGrid } from '../game/pixelart';

const GRADE_ORDER: DealerGrade[] = ['SSR', 'SR', 'R', 'N'];

type Tab = 'table' | 'dealer' | 'compendium' | 'venue';
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
  private buyMultiplier: 1 | 10 | 100 | 'max' = 1;

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
      case 'claim-mission':
        if (btn.dataset.mission) changed = this.gameState.claimMission(btn.dataset.mission as 'tap' | 'pull' | 'upgrade');
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
          const dealer = gs.dealers.find((d) => d.id === last.dealerId);
          const name = dealer ? templateById(dealer.templateId).name : '';
          return `<div class="gacha-flash" style="color:${gradeHex(cfg.color)}">🎉 [${cfg.label}] ${name} 획득!</div>`;
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
              <span class="row-sub star-line" style="color:${gradeHex(cfg.color)}">${starsDisplay(star.stars, star.maxStars)}${star.isMax ? ' (만성 ✨)' : ` (보유 ${star.owned}명)`}</span>
              <span class="row-sub">${d.assignedTableId !== null ? `테이블 #${d.assignedTableId + 1} 배정 중` : '대기 중'} · ${meta.kind}: ${meta.label} +${(template.specialtyValue * 100).toFixed(0)}%p</span>
            </div>
            <div class="row-details">
              <button data-action="upgrade-dealer" data-id="${d.id}" data-cost="${upgradeCost}" ${gs.cash < upgradeCost ? 'disabled' : ''}>
                교육${this.multLabel()} (${formatCash(upgradeCost)}~)
              </button>
            </div>
          </div>`;
      })
      .join('');

    return `
      <button class="big-action gacha" data-action="pull-dealer" data-cost="${nextGachaCost}" ${gs.cash < nextGachaCost ? 'disabled' : ''}>
        🎰 딜러 가챠 (${formatCash(nextGachaCost)})
      </button>
      ${flash}
      ${unlockedFlash}
      <div class="row-list">${rows || '<p class="empty">뽑은 딜러가 없습니다.</p>'}</div>
      <p class="tab-caption">딜러 (${gs.dealers.length}) · N 60% · R 28% · SR 10% · SSR 2% · 등급별 효과는 도감 탭에서 확인</p>`;
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
                ${owned ? `<span class="row-sub star-line" style="${colorStyle}">${starsDisplay(star.stars, star.maxStars)}${star.isMax ? ' 만성 ✨' : ` (보유 ${star.owned}명)`}</span>` : ''}
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

  private renderMissions(): string {
    const gs = this.gameState;
    const defs: Array<{ type: 'tap' | 'pull' | 'upgrade'; label: string; icon: string }> = [
      { type: 'tap', label: '테이블 탭하기', icon: '👆' },
      { type: 'pull', label: '딜러 가챠 뽑기', icon: '🎰' },
      { type: 'upgrade', label: '강화하기(테이블+딜러)', icon: '💪' },
    ];
    const rows = defs
      .map((d) => {
        const progress = gs.missionProgress[d.type];
        const target = gs.missionTarget(d.type);
        const claimed = gs.missionClaimed[d.type];
        const done = progress >= target;
        const pct = Math.min(100, (progress / target) * 100);
        return `
          <div class="row mission-row">
            <div class="row-main">
              <span class="row-title">${d.icon} ${d.label} (${Math.min(progress, target)}/${target})</span>
              <div class="mission-bar"><div class="mission-bar-fill" style="width:${pct}%"></div></div>
            </div>
            <button data-action="claim-mission" data-mission="${d.type}" ${done && !claimed ? '' : 'disabled'}>
              ${claimed ? '완료 ✅' : `수령 (+${formatCash(gs.missionReward(d.type))})`}
            </button>
          </div>`;
      })
      .join('');
    return `
      <h3 class="section-title">📋 오늘의 미션</h3>
      <div class="row-list">${rows}</div>`;
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

      ${this.renderMissions()}

      <h3 class="section-title">🛋️ 인테리어 디자인 (Lv.${gs.designLevel})</h3>
      <p class="tab-caption">디자인이 좋을수록 씀씀이 좋은 손님(단골/큰손/VIP)이 올 확률이 올라갑니다. Lv.3 화분, Lv.6 액자, Lv.10 샹들리에가 매장에 추가돼요.</p>
      <button class="big-action design" data-action="upgrade-design" data-cost="${designCost}" ${gs.cash < designCost ? 'disabled' : ''}>
        🖼️ 인테리어 업그레이드${this.multLabel()} (${formatCash(designCost)}~)
      </button>

      <h3 class="section-title">🍸 미니바 (Lv.${gs.barLevel})</h3>
      <p class="tab-caption">${gs.barLevel > 0 ? `현재 음료 가격 ${formatCash(gs.drinkPrice())} · 초당 매출 ${formatCash(gs.barIncomePerSecond())}` : '아직 바가 없습니다. 업그레이드하면 바가 생기고 음료 판매를 시작합니다.'}</p>
      ${gs.barLevel > 0 ? `<p class="tab-caption">🍹 취급 메뉴: ${gs.unlockedDrinks().map((d) => d.name).join(' · ')}</p>` : ''}
      <button class="big-action bar" data-action="upgrade-bar" data-cost="${barCost}" ${gs.cash < barCost ? 'disabled' : ''}>
        🍹 바 업그레이드${this.multLabel()} (${formatCash(barCost)}~)
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
      this.tab === 'table'
        ? this.renderTableTab()
        : this.tab === 'dealer'
        ? this.renderDealerTab()
        : this.tab === 'compendium'
        ? this.renderCompendiumTab()
        : this.renderVenueTab();

    // 전체 다시 그리기 전에 스크롤 위치를 저장해뒀다가 그대로 복원 (강화 버튼 눌렀을 때 목록이 맨 위로 튀는 문제 방지).
    // 단, 탭을 새로 전환한 경우엔 새 탭이니 위에서부터 보여준다.
    const prevScroll = this.suppressScrollRestore ? 0 : this.root.querySelector('.tab-content')?.scrollTop ?? 0;
    this.suppressScrollRestore = false;

    this.root.innerHTML = `
      ${this.renderJobChoiceModal()}
      ${this.renderWelcomeModal()}
      ${this.renderSettingsModal()}

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
        <button class="nav-btn ${this.tab === 'dealer' ? 'active' : ''}" data-action="set-tab" data-tab="dealer">
          <span class="nav-icon">🎰</span><span>딜러</span>
        </button>
        <button class="nav-btn ${this.tab === 'compendium' ? 'active' : ''}" data-action="set-tab" data-tab="compendium">
          <span class="nav-icon">📖</span><span>도감</span>
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
