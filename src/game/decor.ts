/** 디자인(인테리어) 업그레이드 1회 비용. */
export function designUpgradeCost(currentLevel: number): number {
  return Math.round(300 * Math.pow(1.55, currentLevel));
}

/** 디자인 레벨이 손님 등급 확률에 주는 보너스(0~). rollCustomerGrade의 designBonus로 사용. */
export function designBonusFor(level: number): number {
  return level * 0.09;
}

/** 미니바 업그레이드 1회 비용. */
export function barUpgradeCost(currentLevel: number): number {
  return Math.round(500 * Math.pow(1.7, currentLevel));
}

/** 바 레벨에 따른 음료 1잔 가격 (레벨이 오를수록 더 비싼 음료를 판매). */
export function drinkPriceFor(level: number): number {
  if (level <= 0) return 0;
  return 2 * Math.pow(1.35, level - 1);
}

/** 바 레벨 + 착석 손님 수 + 손님 등급 배율 합으로 초당 바 매출을 계산. */
export function barIncomePerSecond(level: number, seatedDrinkMultiplierSum: number): number {
  if (level <= 0) return 0;
  const price = drinkPriceFor(level);
  // 손님이 없어도 카운터 손님 정도의 기본 매출은 소량 발생.
  return price * (0.4 + seatedDrinkMultiplierSum * 0.5);
}
