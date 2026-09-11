import Phaser from 'phaser';
import './style.css';
import { gameState } from './game/instance';
import { MainScene } from './scenes/MainScene';
import { HUD } from './ui/HUD';

const offline = gameState.consumeOfflineEarnings();
if (offline.earned > 0) {
  console.info(`오프라인 수익: +${Math.floor(offline.earned).toLocaleString('ko-KR')}원`);
}
gameState.save();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800,
  height: 480,
  backgroundColor: '#12060a',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MainScene],
});

const hudRoot = document.querySelector<HTMLDivElement>('#hud')!;
const hud = new HUD(hudRoot, gameState);
setInterval(() => hud.refresh(), 250);

window.addEventListener('beforeunload', () => gameState.save());
