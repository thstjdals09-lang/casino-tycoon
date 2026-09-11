// Scene와 HUD가 서로 직접 참조하지 않고도 상태 변화를 알릴 수 있도록 하는 최소 이벤트 버스.
export const gameEvents = new EventTarget();

export function emitStateChanged(): void {
  gameEvents.dispatchEvent(new Event('state-changed'));
}
