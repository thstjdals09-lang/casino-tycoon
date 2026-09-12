import { collection, doc, onSnapshot, orderBy, query, limit, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getCurrentUid } from './account';

export interface LeaderboardEntry {
  uid: string;
  username: string;
  cash: number;
  totalEarned: number;
  incomePerSecond: number;
  venueTierIndex: number;
}

const COLLECTION = 'leaderboard';

/** 내 현재 상태를 리더보드 문서에 덮어쓴다(자동저장 주기에 맞춰 호출). */
export async function pushLeaderboardStats(displayName: string, stats: Omit<LeaderboardEntry, 'uid' | 'username'>): Promise<void> {
  const uid = getCurrentUid();
  if (!uid || !displayName) return;
  try {
    await setDoc(doc(db, COLLECTION, uid), {
      uid,
      username: displayName,
      ...stats,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // 오프라인이거나 규칙 문제 등 — 리더보드는 부가 기능이라 조용히 무시.
  }
}

/** 초당수익 기준 상위 N명을 실시간 구독. 반환값은 구독 해제 함수. */
export function subscribeLeaderboard(onUpdate: (entries: LeaderboardEntry[]) => void, topN = 20): () => void {
  const q = query(collection(db, COLLECTION), orderBy('incomePerSecond', 'desc'), limit(topN));
  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs.map((d) => d.data() as LeaderboardEntry);
      onUpdate(entries);
    },
    () => {
      onUpdate([]);
    }
  );
}
