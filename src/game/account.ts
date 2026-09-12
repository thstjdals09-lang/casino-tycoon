// 테스트 목적의 아주 단순한 계정 시스템. 서버가 없는 정적 사이트라
// 실제 인증이 아니라 이 브라우저 안에서만 유효한 로컬 아이디/비번 게이트다.
// (평문 저장 — 절대 실제 비밀번호를 재사용하지 말 것.)

const ACCOUNTS_KEY = 'casino-tycoon-accounts';
const SESSION_KEY = 'casino-tycoon-session';

type Accounts = Record<string, string>;

function loadAccounts(): Accounts {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as Accounts) : {};
  } catch {
    return {};
  }
}

function saveAccounts(accounts: Accounts): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function getCurrentUser(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export function createAccount(username: string, password: string): AuthResult {
  const id = username.trim();
  if (id.length < 2) return { ok: false, error: '아이디는 2자 이상 입력해주세요.' };
  if (password.length < 4) return { ok: false, error: '비밀번호는 4자 이상 입력해주세요.' };
  const accounts = loadAccounts();
  if (accounts[id]) return { ok: false, error: '이미 존재하는 아이디예요.' };
  accounts[id] = password;
  saveAccounts(accounts);
  localStorage.setItem(SESSION_KEY, id);
  return { ok: true };
}

export function login(username: string, password: string): AuthResult {
  const id = username.trim();
  const accounts = loadAccounts();
  if (!accounts[id] || accounts[id] !== password) {
    return { ok: false, error: '아이디 또는 비밀번호가 일치하지 않아요.' };
  }
  localStorage.setItem(SESSION_KEY, id);
  return { ok: true };
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}
