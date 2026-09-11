import type { GameSaveData } from './types';
import { emptyPullCounts } from './achievements';

const STORAGE_KEY = 'casino-tycoon-save-v5';
const SAVE_VERSION = 5;

export function createNewSave(): GameSaveData {
  return {
    version: SAVE_VERSION,
    venueTierIndex: 0,
    cash: 0,
    totalEarned: 0,
    prestigeMultiplier: 1,
    tables: [{ id: 0, level: 1, dealerId: null, lastTapAt: 0, customerGrades: [] }],
    dealers: [],
    nextTableId: 1,
    nextDealerId: 0,
    lastSavedAt: Date.now(),
    jobPath: [],
    dealerPulls: emptyPullCounts(),
    achievements: [],
    designLevel: 0,
    barLevel: 0,
  };
}

export function loadSave(): GameSaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as GameSaveData;
    if (data.version !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function persistSave(data: GameSaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 사용 불가(프라이빗 모드 등) - 저장 실패는 조용히 무시
  }
}

export function resetSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
