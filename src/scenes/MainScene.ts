import Phaser from 'phaser';
import { gameState } from '../game/instance';
import { formatCash } from '../game/balance';
import { emitStateChanged, gameEvents } from '../game/events';
import { gradeConfig } from '../game/gacha';

const SLOT_W = 170;
const SLOT_H = 130;
const COLS = 4;
const GRID_TOP = 40;
const AUTOSAVE_MS = 10_000;
const TILE = 16; // 도트 느낌을 위한 바닥 타일 크기

export class MainScene extends Phaser.Scene {
  private layoutContainer!: Phaser.GameObjects.Container;
  private floor!: Phaser.GameObjects.Container;
  private timeSinceSave = 0;

  constructor() {
    super('MainScene');
  }

  create() {
    this.floor = this.add.container(0, 0);
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

  private drawFloor() {
    this.floor.removeAll(true);
    const tier = gameState.tier;
    const { width, height } = this.scale;
    const cols = Math.ceil(width / TILE);
    const rows = Math.ceil(height / TILE);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const shade = (r + c) % 2 === 0 ? tier.floorColor : this.darken(tier.floorColor, 0.85);
        const tile = this.add.rectangle(c * TILE, r * TILE, TILE, TILE, shade).setOrigin(0, 0);
        this.floor.add(tile);
      }
    }
  }

  private darken(color: number, factor: number): number {
    const r = Math.floor(((color >> 16) & 0xff) * factor);
    const g = Math.floor(((color >> 8) & 0xff) * factor);
    const b = Math.floor((color & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  private rebuildLayout() {
    this.drawFloor();
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

  /** 픽셀 느낌의 트림(테두리 점무늬)을 사각형 위쪽에 그린다. */
  private drawPixelTrim(x: number, y: number, w: number, color: number) {
    const dotSize = 6;
    const count = Math.floor(w / (dotSize * 2));
    const startX = x - (count * dotSize * 2) / 2 + dotSize / 2;
    for (let i = 0; i < count; i++) {
      const dot = this.add.rectangle(startX + i * dotSize * 2, y, dotSize, dotSize, color, 0.9);
      this.layoutContainer.add(dot);
    }
  }

  private drawActiveTable(x: number, y: number, table: { id: number; level: number }) {
    const tier = gameState.tier;
    const dealer = gameState.dealerFor(table as never);
    const income = gameState.tableIncomePerSecond(table as never);

    const box = this.add.rectangle(x, y, 120, 84, tier.themeColor).setStrokeStyle(3, 0xffffff, 0.85);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => this.onTapTable(table.id, x, y));
    this.drawPixelTrim(x, y - 42, 120, 0xffffff);

    const dealerColor = dealer ? gradeConfig(dealer.grade).color : 0x555555;
    // 딜러 배지: 등급 색으로 채워진 작은 픽셀 사각형 3x3 블록 형태
    const badge = this.add.container(x + 40, y - 30);
    const px = 4;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const isCorner = (r === 0 || r === 2) && (c === 0 || c === 2);
        const cell = this.add.rectangle((c - 1) * px, (r - 1) * px, px, px, dealerColor, isCorner ? 0.5 : 1);
        badge.add(cell);
      }
    }

    const levelText = this.add
      .text(x, y - 8, `Lv.${table.level}`, { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
      .setOrigin(0.5);
    const incomeText = this.add
      .text(x, y + 16, `${formatCash(income)}/초`, { fontFamily: 'monospace', fontSize: '12px', color: '#e8e8e8' })
      .setOrigin(0.5);
    const gradeText = dealer
      ? this.add
          .text(x, y + 34, `[${gradeConfig(dealer.grade).label}]`, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#' + dealerColor.toString(16).padStart(6, '0'),
          })
          .setOrigin(0.5)
      : null;

    this.layoutContainer.add([box, badge, levelText, incomeText, ...(gradeText ? [gradeText] : [])]);
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
