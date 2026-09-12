import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { GameSaveData } from './types';

const COLLECTION = 'saves';

export async function loadCloudSave(uid: string): Promise<GameSaveData | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    return snap.exists() ? (snap.data() as GameSaveData) : null;
  } catch (e) {
    console.error('클라우드 세이브 불러오기 실패:', e);
    return null;
  }
}

export async function saveCloudSave(uid: string, data: GameSaveData): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTION, uid), data);
  } catch (e) {
    console.error('클라우드 세이브 저장 실패:', e);
  }
}
