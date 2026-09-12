import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';

// Firebase Auth는 이메일 형식을 요구하므로, 아이디를 내부적으로
// "아이디@casino-tycoon.local" 형태의 가짜 이메일로 변환해서 사용한다.
// 화면에는 항상 원래 아이디(닉네임, displayName)만 보여준다.
const EMAIL_SUFFIX = '@casino-tycoon.local';

function toEmail(username: string): string {
  return `${username.trim().toLowerCase()}${EMAIL_SUFFIX}`;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

function mapFirebaseError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return '이미 존재하는 아이디예요.';
    case 'auth/invalid-email':
      return '아이디에 사용할 수 없는 문자가 있어요.';
    case 'auth/weak-password':
      return '비밀번호는 6자 이상이어야 해요.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return '아이디 또는 비밀번호가 일치하지 않아요.';
    case 'auth/too-many-requests':
      return '시도가 너무 많아요. 잠시 후 다시 시도해주세요.';
    default:
      return '오류가 발생했어요. 잠시 후 다시 시도해주세요.';
  }
}

export async function createAccount(username: string, password: string): Promise<AuthResult> {
  const id = username.trim();
  if (id.length < 2) return { ok: false, error: '아이디는 2자 이상 입력해주세요.' };
  if (password.length < 6) return { ok: false, error: '비밀번호는 6자 이상 입력해주세요.' };
  try {
    const cred = await createUserWithEmailAndPassword(auth, toEmail(id), password);
    await updateProfile(cred.user, { displayName: id });
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    return { ok: false, error: mapFirebaseError(code) };
  }
}

export async function login(username: string, password: string): Promise<AuthResult> {
  const id = username.trim();
  try {
    await signInWithEmailAndPassword(auth, toEmail(id), password);
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    return { ok: false, error: mapFirebaseError(code) };
  }
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export function getCurrentUsername(): string | null {
  return auth.currentUser?.displayName ?? null;
}

export function getCurrentUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

/** 앱 시작 시 로그인 상태를 한 번 확인(비동기)하기 위한 헬퍼. */
export function waitForAuthReady(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}
