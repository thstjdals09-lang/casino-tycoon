import { GameState } from '../game/GameState';
import { emitStateChanged, gameEvents } from '../game/events';

export class SidePanels {
  private rightRoot: HTMLElement;
  private leftRoot: HTMLElement;
  private modalRoot: HTMLElement;
  private gameState: GameState;
  private eventModalOpen = false;
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
    if (action === 'toggle-event-modal') {
      this.eventModalOpen = !this.eventModalOpen;
      this.render();
      return;
    }
    if (action === 'close-event-modal') {
      this.eventModalOpen = false;
      this.render();
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
        const done = gs.missionClaimed[d.type];
        const complete = gs.missionProgress[d.type] >= gs.missionTarget(d.type);
        const status = done ? '✅ 수령완료' : complete ? '🎁 수령 가능!' : `${gs.missionProgress[d.type]}/${gs.missionTarget(d.type)}`;
        return `<div>${d.label}: <b>${status}</b></div>`;
      })
      .join('');

    return `
      <div class="job-modal">
        <div class="job-modal-inner">
          <h2>🎁 이벤트 · 출석</h2>
          <div class="event-modal-body">
            <div>📅 연속 출석 <b>${gs.loginStreak}일차</b> — 매일 접속할수록 출석 보상이 커져요 (최대 7일차까지).</div>
            <br />
            <div>오늘의 미션 진행 상황:</div>
            ${missionLines}
            <br />
            <div>미션 수령은 <b>매장 탭</b>에서 할 수 있어요.</div>
          </div>
          <button class="close-settings-btn" data-action="close-event-modal">닫기</button>
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

    const missionReady = (['chat', 'pull', 'upgrade'] as const).some(
      (t) => gs.missionProgress[t] >= gs.missionTarget(t) && !gs.missionClaimed[t]
    );

    this.leftRoot.innerHTML = `
      <button class="side-btn" data-action="toggle-event-modal">
        <span class="side-btn-icon">🎁</span>
        <span class="side-btn-label">이벤트</span>
        ${missionReady ? '<span class="side-btn-dot"></span>' : ''}
      </button>
    `;
    this.modalRoot.innerHTML = this.eventModalOpen ? this.renderEventModal() : '';
  }
}
