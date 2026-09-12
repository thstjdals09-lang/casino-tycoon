import type { GameSaveData } from './types';
import { emptyPullCounts } from './achievements';

const STORAGE_KEY = 'casino-tycoon-save-v14';
export const SAVE_VERSION = 14;

/** 밸런스/컨텐츠 대격변 패치를 배포할 때마다 올린다 — 클라우드 세이브에 저장된 값이
 * 이보다 낮으면 hydrateFromCloud()가 병합하지 않고 전체 계정을 강제로 새로 시작시킨다. */
export const CONTENT_PATCH_VERSION = 2;

function emptyMissionSet() {
  return { chat: 0, pull: 0, upgrade: 0 };
}
function emptyMissionClaimedSet() {
  return { chat: false, pull: false, upgrade: false };
}

export function createNewSave(defaultVenueName = ''): GameSaveData {
  return {
    version: SAVE_VERSION,
    venueTierIndex: 0,
    cash: 0,
    totalEarned: 0,
    prestigeMultiplier: 1,
    tables: [{ id: 0, level: 1, dealerId: null, customerGrades: [] }],
    dealers: [],
    nextTableId: 1,
    nextDealerId: 0,
    lastSavedAt: Date.now(),
    jobPath: [],
    dealerPulls: emptyPullCounts(),
    achievements: [],
    designLevel: 0,
    barLevel: 0,
    lastLoginDate: '',
    loginStreak: 0,
    autoUpgradeEnabled: false,
    missionProgress: emptyMissionSet(),
    missionClaimed: emptyMissionClaimedSet(),
    weeklyMissionProgress: emptyMissionSet(),
    weeklyMissionClaimed: emptyMissionClaimedSet(),
    lastWeekKey: '',
    monthlyMissionProgress: emptyMissionSet(),
    monthlyMissionClaimed: emptyMissionClaimedSet(),
    lastMonthKey: '',
    venueName: defaultVenueName,
    dupeStock: {},
    diamonds: 0,
    skipGachaAnimation: false,
    autoPullEnabled: false,
    contentPatchVersion: CONTENT_PATCH_VERSION,
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
