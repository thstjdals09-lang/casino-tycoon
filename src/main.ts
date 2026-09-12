import Phaser from 'phaser';
import './style.css';
import { gameState } from './game/instance';
import { getCurrentUser } from './game/account';
import { MainScene } from './scenes/MainScene';
import { HUD } from './ui/HUD';
import { SidePanels } from './ui/SidePanels';
import { AuthGate } from './ui/AuthGate';

function startGame() {
  const offline = gameState.consumeOfflineEarnings();
  const daily = gameState.claimDailyLogin();
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
  hud.showWelcomeBack(offline, daily);

  const sideRightRoot = document.querySelector<HTMLDivElement>('#side-actions')!;
  const sideLeftRoot = document.querySelector<HTMLDivElement>('#side-actions-left')!;
  const sidePanels = new SidePanels(sideRightRoot, sideLeftRoot, gameState);

  setInterval(() => {
    hud.refresh();
    sidePanels.refresh();
  }, 250);

  window.addEventListener('beforeunload', () => gameState.save());
}

const authRoot = document.querySelector<HTMLDivElement>('#auth-gate')!;
const appRoot = document.querySelector<HTMLDivElement>('#app')!;

if (getCurrentUser()) {
  authRoot.remove();
  startGame();
} else {
  appRoot.style.display = 'none';
  new AuthGate(authRoot, () => {
    authRoot.remove();
    appRoot.style.display = '';
    startGame();
  });
}
