import { GameState } from '../game/GameState';
import { emitStateChanged, gameEvents } from '../game/events';
import { formatCash } from '../game/balance';
import { getCurrentUsername } from '../game/account';
import { subscribeLeaderboard, type LeaderboardEntry } from '../game/leaderboard';

type LeftModal = 'none' | 'event' | 'mission' | 'ranking';

export class SidePanels {
  private rightRoot: HTMLElement;
  private leftRoot: HTMLElement;
  private modalRoot: HTMLElement;
  private gameState: GameState;
  private openModal: LeftModal = 'none';
  private leaderboard: LeaderboardEntry[] = [];
  private lastBoostState: 'active' | 'ready' | 'cooldown' = 'ready';

  constructor(rightRoot: HTMLElement, leftRoot: HTMLElement, gameState: GameState) {
    this.rightRoot = rightRoot;
    this.leftRoot = leftRoot;
    this.gameState = gameState;

    // 모달은 leftRoot(transform: translateY(-50%) 적용된 좁은 박스) 밖, body 바로 아래에 별도로 띄운다.
    // leftRoot 안에 fixed 모달을 넣으면 transform이 걸린 조상 때문에 화면 전체가 아니라
    // 그 좁은 박스 기준으로 깨져버린다(=CSS에서 transform이 fixed의 containing block이 되는 현상).
    this.modalRoot = document.createElement('div');
    document.body.appendChild(this.modalRoot);

    this.rightRoot.addEventListener('click', (e) => this.onClick(e));
    this.leftRoot.addEventListener('click', (e) => this.onClick(e));
    this.modalRoot.addEventListener('click', (e) => this.onClick(e));
    gameEvents.addEventListener('state-changed', () => this.render());

    subscribeLeaderboard((entries) => {
      this.leaderboard = entries;
      this.render();
    });

    this.render();
  }

  /** 250ms 틱마다 가벼운 갱신 (부스트 카운트다운 숫자만 갱신, 상태가 바뀌면 전체 재렌더). */
  refresh(): void {
    const gs = this.gameState;
    const boostState = gs.isBoostActive() ? 'active' : gs.canActivateBoost() ? 'ready' : 'cooldown';
    if (boostState !== this.lastBoostState) {
      this.lastBoostState = boostState;
      this.render();
      return;
    }
    const timer = this.rightRoot.querySelector('#side-boost-timer');
    if (timer) {
      timer.textContent = `${gs.isBoostActive() ? gs.boostSecondsRemaining() : gs.boostCooldownSecondsRemaining()}초`;
    }
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;

    if (target.classList.contains('job-modal')) {
      this.openModal = 'none';
      this.render();
      return;
    }

    const btn = target.closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'toggle-auto') {
      this.gameState.toggleAutoUpgrade();
      this.gameState.save();
      emitStateChanged();
      return;
    }
    if (action === 'activate-boost') {
      if (this.gameState.activateBoost()) {
        this.gameState.save();
        emitStateChanged();
      }
      return;
    }
    if (action === 'open-modal' && btn.dataset.modal) {
      const modal = btn.dataset.modal as LeftModal;
      this.openModal = this.openModal === modal ? 'none' : modal;
      this.render();
      return;
    }
    if (action === 'close-left-modal') {
      this.openModal = 'none';
      this.render();
      return;
    }
    if (action === 'goto-mission') {
      // "이벤트" 안의 미션 항목을 누르면 바로 미션 모달로 이동.
      this.openModal = 'mission';
      this.render();
      return;
    }
    if (action === 'claim-mission') {
      if (btn.dataset.mission && btn.dataset.period) {
        const changed = this.gameState.claimMission(
          btn.dataset.period as 'daily' | 'weekly' | 'monthly',
          btn.dataset.mission as 'chat' | 'pull' | 'upgrade'
        );
        if (changed) {
          this.gameState.save();
          emitStateChanged();
        }
      }
      return;
    }
  }

  private renderEventModal(): string {
    const gs = this.gameState;
    const missionDefs: Array<{ type: 'chat' | 'pull' | 'upgrade'; label: string }> = [
      { type: 'chat', label: '채팅 보내기' },
      { type: 'pull', label: '딜러 가챠 뽑기' },
      { type: 'upgrade', label: '강화하기' },
    ];
    const missionLines = missionDefs
      .map((d) => {
        const done = gs.missionClaimedFor('daily', d.type);
        const progress = gs.missionProgressFor('daily', d.type);
        const target = gs.missionTarget('daily', d.type);
        const complete = progress >= target;
        const status = done ? '✅ 수령완료' : complete ? '🎁 수령 가능!' : `${progress}/${target}`;
        return `<div class="event-mission-line" data-action="goto-mission">${d.label}: <b>${status}</b> <span class="event-mission-arrow">›</span></div>`;
      })
      .join('');

    return `
      <div class="job-modal">
        <div class="job-modal-inner">
          <h2>🎁 이벤트 · 출석</h2>
          <div class="event-modal-body">
            <div>📅 연속 출석 <b>${gs.loginStreak}일차</b> — 매일 접속할수록 출석 보상이 커져요 (최대 7일차까지).</div>
            <br />
            <div>오늘의 미션 진행 상황 (눌러서 바로 이동):</div>
            ${missionLines}
          </div>
          <button class="close-settings-btn" data-action="close-left-modal">닫기</button>
        </div>
      </div>`;
  }

  private renderMissionPeriod(period: 'daily' | 'weekly' | 'monthly', title: string): string {
    const gs = this.gameState;
    const defs: Array<{ type: 'chat' | 'pull' | 'upgrade'; label: string; icon: string }> = [
      { type: 'chat', label: '채팅 보내기', icon: '💬' },
      { type: 'pull', label: '딜러 가챠 뽑기', icon: '🎰' },
      { type: 'upgrade', label: '강화하기(테이블+딜러)', icon: '💪' },
    ];
    const rows = defs
      .map((d) => {
        const progress = gs.missionProgressFor(period, d.type);
        const target = gs.missionTarget(period, d.type);
        const claimed = gs.missionClaimedFor(period, d.type);
        const reward = gs.missionDiamondReward(period, d.type);
        const done = progress >= target;
        const pct = Math.min(100, (progress / target) * 100);
        return `
          <div class="row mission-row">
            <div class="row-main">
              <span class="row-title">${d.icon} ${d.label} (${Math.min(progress, target)}/${target})</span>
              <div class="mission-bar"><div class="mission-bar-fill" style="width:${pct}%"></div></div>
            </div>
            <button data-action="claim-mission" data-period="${period}" data-mission="${d.type}" ${done && !claimed ? '' : 'disabled'}>
              ${claimed ? '완료 ✅' : `수령 (💎${reward})`}
            </button>
          </div>`;
      })
      .join('');
    return `<h3 class="section-title">${title}</h3><div class="row-list">${rows}</div>`;
  }

  private renderMissionModal(): string {
    return `
      <div class="job-modal">
        <div class="job-modal-inner mission-modal-inner">
          <h2>📋 미션</h2>
          ${this.renderMissionPeriod('daily', '📋 오늘의 미션')}
          ${this.renderMissionPeriod('weekly', '🗓️ 이번 주 미션')}
          ${this.renderMissionPeriod('monthly', '📅 이번 달 미션')}
          <button class="close-settings-btn" data-action="close-left-modal">닫기</button>
        </div>
      </div>`;
  }

  private renderRankingModal(): string {
    const me = getCurrentUsername();
    const body =
      this.leaderboard.length === 0
        ? '<p class="tab-caption">아직 랭킹 데이터가 없어요.</p>'
        : `<div class="row-list">${this.leaderboard
            .map((e, i) => {
              const isMe = e.username === me;
              return `
                <div class="row ${isMe ? 'row-done' : ''}">
                  <div class="row-main">
                    <span class="row-title">${i + 1}위 · ${e.username}${isMe ? ' (나)' : ''} · ${e.venueTierIndex + 1}층</span>
                    <span class="row-sub">초당 ${formatCash(e.incomePerSecond)} · 누적 ${formatCash(e.totalEarned)}</span>
                  </div>
                </div>`;
            })
            .join('')}</div>`;
    return `
      <div class="job-modal">
        <div class="job-modal-inner mission-modal-inner">
          <h2>🏆 실시간 랭킹 (초당수익)</h2>
          ${body}
          <button class="close-settings-btn" data-action="close-left-modal">닫기</button>
        </div>
      </div>`;
  }

  private render(): void {
    const gs = this.gameState;
    const boostActive = gs.isBoostActive();
    const boostReady = gs.canActivateBoost();

    this.rightRoot.innerHTML = `
      <button class="side-btn ${gs.autoUpgradeEnabled ? 'active' : ''}" data-action="toggle-auto">
        <span class="side-btn-icon">🤖</span>
        <span class="side-btn-label">자동${gs.autoUpgradeEnabled ? ' ON' : ' OFF'}</span>
      </button>
      <button class="side-btn ${boostActive ? 'active' : ''} ${boostReady && !boostActive ? 'boost-ready' : ''}" data-action="activate-boost" ${boostReady ? '' : 'disabled'}>
        <span class="side-btn-icon">🔥</span>
        <span class="side-btn-label">${boostActive ? '부스트 중' : boostReady ? '부스트' : '대기중'}</span>
        ${
          boostActive || !boostReady
            ? `<span class="side-btn-timer" id="side-boost-timer">${boostActive ? gs.boostSecondsRemaining() : gs.boostCooldownSecondsRemaining()}초</span>`
            : ''
        }
      </button>
    `;

    const missionReady = (['daily', 'weekly', 'monthly'] as const).some((period) =>
      (['chat', 'pull', 'upgrade'] as const).some(
        (t) => gs.missionProgressFor(period, t) >= gs.missionTarget(period, t) && !gs.missionClaimedFor(period, t)
      )
    );

    this.leftRoot.innerHTML = `
      <button class="side-btn" data-action="open-modal" data-modal="event">
        <span class="side-btn-icon">🎁</span>
        <span class="side-btn-label">이벤트</span>
        ${missionReady ? '<span class="side-btn-dot"></span>' : ''}
      </button>
      <button class="side-btn" data-action="open-modal" data-modal="mission">
        <span class="side-btn-icon">📋</span>
        <span class="side-btn-label">미션</span>
        ${missionReady ? '<span class="side-btn-dot"></span>' : ''}
      </button>
      <button class="side-btn" data-action="open-modal" data-modal="ranking">
        <span class="side-btn-icon">🏆</span>
        <span class="side-btn-label">랭킹</span>
      </button>
    `;

    this.modalRoot.innerHTML =
      this.openModal === 'event'
        ? this.renderEventModal()
        : this.openModal === 'mission'
        ? this.renderMissionModal()
        : this.openModal === 'ranking'
        ? this.renderRankingModal()
        : '';
  }
}
