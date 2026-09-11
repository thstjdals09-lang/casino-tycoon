import { GameState } from './GameState';

// Scene와 HUD가 동일한 상태를 공유하기 위한 싱글턴.
export const gameState = new GameState();
