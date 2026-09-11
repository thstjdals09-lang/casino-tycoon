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

/** 바 레벨 + 착석 손님 수 + 손님 등급 배율 합으로 초당 바 매출을 계산. */
export function barIncomePerSecond(level: number, seatedDrinkMultiplierSum: number): number {
  if (level <= 0) return 0;
  const price = drinkPriceFor(level);
  // 손님이 없어도 카운터 손님 정도의 기본 매출은 소량 발생.
  return price * (0.4 + seatedDrinkMultiplierSum * 0.5);
}
