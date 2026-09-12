import Phaser from 'phaser';
import './style.css';
import { gameState } from './game/instance';
import { waitForAuthReady } from './game/account';
import { pushLeaderboardStats } from './game/leaderboard';
import { MainScene } from './scenes/MainScene';
import { HUD } from './ui/HUD';
import { SidePanels } from './ui/SidePanels';
import { AuthGate } from './ui/AuthGate';
import { ChatWidget } from './ui/ChatWidget';

function startGame() {
  gameState.hydrateFromCloud().then(() => {
    const offline = gameState.consumeOfflineEarnings();
    const daily = gameState.claimDailyLogin();
    gameState.save();

    new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      width: 800,
      height: 1000,
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

    const chatRoot = document.querySelector<HTMLDivElement>('#chat-widget')!;
    new ChatWidget(chatRoot, gameState);

    const pushStats = () =>
      pushLeaderboardStats(gameState.venueName, {
        cash: gameState.cash,
        totalEarned: gameState.totalEarned,
        incomePerSecond: gameState.totalIncomePerSecond(),
        venueTierIndex: gameState.tier.id,
      });
    pushStats();
    setInterval(pushStats, 15_000);

    setInterval(() => {
      hud.refresh();
      sidePanels.refresh();
    }, 250);

    window.addEventListener('beforeunload', () => gameState.save());
  });
}

const authRoot = document.querySelector<HTMLDivElement>('#auth-gate')!;
const appRoot = document.querySelector<HTMLDivElement>('#app')!;
appRoot.style.display = 'none';

waitForAuthReady().then((user) => {
  if (user) {
    authRoot.remove();
    appRoot.style.display = '';
    startGame();
  } else {
    new AuthGate(authRoot, () => {
      authRoot.remove();
      appRoot.style.display = '';
      startGame();
    });
  }
});
