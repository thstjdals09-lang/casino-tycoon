import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { GameSaveData } from './types';

const COLLECTION = 'saves';

export async function loadCloudSave(uid: string): Promise<GameSaveData | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    return snap.exists() ? (snap.data() as GameSaveData) : null;
  } catch {
    return null;
  }
}

export async function saveCloudSave(uid: string, data: GameSaveData): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTION, uid), data);
  } catch {
    // 오프라인이거나 규칙 문제 등 — 로컬 저장은 이미 됐으므로 게임 진행엔 지장 없음.
  }
}
