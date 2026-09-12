import { createAccount, login } from '../game/account';

export class AuthGate {
  private root: HTMLElement;
  private mode: 'login' | 'signup' = 'login';
  private error = '';
  private onSuccess: () => void;

  constructor(root: HTMLElement, onSuccess: () => void) {
    this.root = root;
    this.onSuccess = onSuccess;
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('submit', (e) => this.onSubmit(e));
    this.render();
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'set-mode') {
      this.mode = btn.dataset.mode as 'login' | 'signup';
      this.error = '';
      this.render();
    }
  }

  private onSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const username = (form.querySelector('#auth-username') as HTMLInputElement).value;
    const password = (form.querySelector('#auth-password') as HTMLInputElement).value;

    const result = this.mode === 'login' ? login(username, password) : createAccount(username, password);
    if (!result.ok) {
      this.error = result.error ?? '오류가 발생했어요.';
      this.render();
      return;
    }
    this.onSuccess();
  }

  private render(): void {
    const isLogin = this.mode === 'login';
    this.root.innerHTML = `
      <div class="auth-card">
        <h1>🎰 카지노 타이쿤</h1>
        <p class="auth-sub">테스트용 계정입니다 — 이 브라우저에만 저장돼요.</p>

        <div class="filter-row auth-mode-row">
          <button type="button" class="chip ${isLogin ? 'active' : ''}" data-action="set-mode" data-mode="login">로그인</button>
          <button type="button" class="chip ${!isLogin ? 'active' : ''}" data-action="set-mode" data-mode="signup">계정 만들기</button>
        </div>

        <form class="auth-form">
          <input id="auth-username" type="text" placeholder="아이디" autocomplete="username" required />
          <input id="auth-password" type="password" placeholder="비밀번호" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required />
          ${this.error ? `<p class="auth-error">${this.error}</p>` : ''}
          <button type="submit" class="big-action">${isLogin ? '로그인' : '계정 만들고 시작하기'}</button>
        </form>
      </div>
    `;
  }
}
