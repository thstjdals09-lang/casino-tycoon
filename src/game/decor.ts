/** 디자인(인테리어) 업그레이드 1회 비용. 후반으로 갈수록 가팔라지도록 레벨이 오를수록 성장률 자체도 조금씩 커진다. */
export function designUpgradeCost(currentLevel: number): number {
  const growth = 1.6 + currentLevel * 0.01;
  return Math.round(300 * Math.pow(growth, currentLevel));
}

/** 디자인 레벨이 손님 등급 확률에 주는 보너스(0~). 로그형으로 완만해져서 무한히 찍어도 무한정 좋아지진 않는다. */
export function designBonusFor(level: number): number {
  return Math.log2(level + 1) * 0.35;
}

/** 미니바 업그레이드 1회 비용. 후반으로 갈수록 가팔라짐. */
export function barUpgradeCost(currentLevel: number): number {
  const growth = 1.75 + currentLevel * 0.012;
  return Math.round(500 * Math.pow(growth, currentLevel));
}

/** 바 레벨에 따른 음료 1잔 가격 (레벨이 오를수록 더 비싼 음료를 판매). */
export function drinkPriceFor(level: number): number {
  if (level <= 0) return 0;
  return 2 * Math.pow(1.35, level - 1);
}

export interface DrinkMenuItem {
  name: string;
  unlockLevel: number;
}

/** 바 레벨이 오르면서 하나씩 풀리는 메뉴. 실제 매출 계산엔 관여하지 않고(가격은 drinkPriceFor가 대표), 연출/정보용. */
export const DRINK_MENU: DrinkMenuItem[] = [
  { name: '생맥주', unlockLevel: 1 },
  { name: '소주', unlockLevel: 1 },
  { name: '하이볼', unlockLevel: 3 },
  { name: '와인', unlockLevel: 5 },
  { name: '시그니처 칵테일', unlockLevel: 7 },
  { name: '프리미엄 위스키', unlockLevel: 10 },
  { name: '올드 빈티지 브랜디', unlockLevel: 14 },
];

export function unlockedDrinks(level: number): DrinkMenuItem[] {
  return DRINK_MENU.filter((d) => d.unlockLevel <= level);
}

/** 바 외형 단계 (0=바 없음, 1=기본 카운터, 2=칵테일바, 3=고급 라운지). 도트 스프라이트 선택에 사용. */
export function barVisualTier(level: number): 0 | 1 | 2 | 3 {
  if (level <= 0) return 0;
  if (level < 5) return 1;
  if (level < 10) return 2;
  return 3;
}

/** 바 레벨 + 착석 손님 수 + 손님 등급 배율 합으로 초당 바 매출을 계산. */
export function barIncomePerSecond(level: number, seatedDrinkMultiplierSum: number): number {
  if (level <= 0) return 0;
  const price = drinkPriceFor(level);
  // 손님이 없어도 카운터 손님 정도의 기본 매출은 소량 발생.
  return price * (0.4 + seatedDrinkMultiplierSum * 0.5);
}
