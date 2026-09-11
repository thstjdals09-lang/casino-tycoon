import Phaser from 'phaser';
import { gameState } from '../game/instance';
import { formatCash } from '../game/balance';
import { emitStateChanged, gameEvents } from '../game/events';

const SLOT_W = 170;
const SLOT_H = 130;
const COLS = 4;
const GRID_TOP = 40;
const AUTOSAVE_MS = 10_000;

export class MainScene extends Phaser.Scene {
  private layoutContainer!: Phaser.GameObjects.Container;
  private bg!: Phaser.GameObjects.Rectangle;
  private timeSinceSave = 0;

  constructor() {
    super('MainScene');
  }

  create() {
    const { width, height } = this.scale;
    this.bg = this.add.rectangle(0, 0, width, height, gameState.tier.floorColor).setOrigin(0, 0);
    this.layoutContainer = this.add.container(0, 0);

    this.rebuildLayout();

    gameEvents.addEventListener('state-changed', () => this.rebuildLayout());
  }

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    gameState.tick(dt);

    this.timeSinceSave += deltaMs;
    if (this.timeSinceSave >= AUTOSAVE_MS) {
      this.timeSinceSave = 0;
      gameState.save();
    }
  }

  private rebuildLayout() {
    this.bg.setFillStyle(gameState.tier.floorColor);
    this.layoutContainer.removeAll(true);

    const tier = gameState.tier;
    const tables = gameState.tables;
    const startX = (this.scale.width - Math.min(tier.maxTables, COLS) * SLOT_W) / 2 + SLOT_W / 2;

    for (let i = 0; i < tier.maxTables; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = startX + col * SLOT_W;
      const y = GRID_TOP + SLOT_H / 2 + row * SLOT_H;

      if (i < tables.length) {
        this.drawActiveTable(x, y, tables[i]);
      } else if (i === tables.length) {
        this.drawBuySlot(x, y);
      } else {
        this.drawLockedSlot(x, y);
      }
    }
  }

  private drawActiveTable(x: number, y: number, table: { id: number; level: number }) {
    const tier = gameState.tier;
    const dealer = gameState.dealerFor(table as never);
    const income = gameState.tableIncomePerSecond(table as never);

    const box = this.add.rectangle(x, y, 120, 84, tier.themeColor).setStrokeStyle(3, 0xffffff, 0.85);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => this.onTapTable(table.id, x, y));

    const dot = this.add.circle(x + 48, y - 30, 7, dealer ? 0x53d769 : 0x6b6b6b);
    dot.setStrokeStyle(1.5, 0x000000, 0.6);

    const levelText = this.add
      .text(x, y - 8, `Lv.${table.level}`, { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
      .setOrigin(0.5);
    const incomeText = this.add
      .text(x, y + 16, `${formatCash(income)}/초`, { fontFamily: 'monospace', fontSize: '12px', color: '#e8e8e8' })
      .setOrigin(0.5);

    this.layoutContainer.add([box, dot, levelText, incomeText]);
  }

  private drawBuySlot(x: number, y: number) {
    const cost = gameState.nextTableCost();
    const box = this.add.rectangle(x, y, 120, 84, 0x000000, 0.25).setStrokeStyle(2, 0xffffff, 0.5);
    const label = this.add
      .text(x, y - 10, '+ 테이블 구매', { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff' })
      .setOrigin(0.5);
    const costText = this.add
      .text(x, y + 14, cost !== null ? formatCash(cost) : '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffd966',
      })
      .setOrigin(0.5);

    if (cost !== null) {
      box.setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => {
        if (gameState.buyTable()) emitStateChanged();
      });
    }

    this.layoutContainer.add([box, label, costText]);
  }

  private drawLockedSlot(x: number, y: number) {
    const box = this.add.rectangle(x, y, 120, 84, 0x000000, 0.15).setStrokeStyle(1, 0xffffff, 0.2);
    const label = this.add
      .text(x, y, '잠김', { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff55' })
      .setOrigin(0.5);
    this.layoutContainer.add([box, label]);
  }

  private onTapTable(tableId: number, x: number, y: number) {
    const bonus = gameState.tapTable(tableId);
    if (bonus <= 0) return;

    const floatText = this.add
      .text(x, y - 40, `+${formatCash(bonus)}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffd966',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: floatText,
      y: y - 80,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => floatText.destroy(),
    });
  }
}
