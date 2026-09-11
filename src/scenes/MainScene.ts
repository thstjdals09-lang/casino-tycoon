import Phaser from 'phaser';
import { gameState } from '../game/instance';
import { formatCash } from '../game/balance';
import { emitStateChanged, gameEvents } from '../game/events';
import { gradeConfig } from '../game/gacha';
import { ensurePixelTexture, chipStackGrid, floorTileGrid, humanoidGrid, tableGrid } from '../game/pixelart';

const SLOT_W = 170;
const SLOT_H = 130;
const COLS = 4;
const GRID_TOP = 48;
const AUTOSAVE_MS = 10_000;
const FLOOR_TILE_PX = 6; // floorTileGrid()가 8x8이므로 실제 타일은 48x48

const HUMANOID_PALETTE_BASE = { h: '#2b2320', s: '#f5c9a0', w: '#ffffff', p: '#33415c', b: '#1a1a1a' };
const CUSTOMER_SHIRTS = ['#e0455c', '#4f8fe0', '#f0a63c', '#8a5cf0'];

const PLAYER_LINES = [
  '올인!',
  '풀하우스 떴다!',
  '블러핑 아니지...?',
  '레이즈 갈게요',
  '체크만 할게요',
  '플러시 메이드!',
  '스트레이트다!',
  '이번 판은 접을게요',
  '탑페어인데 어쩌지',
  '콜!',
  '에이스 페어 떴어요',
  '이번엔 감이 좋아요',
  '포커페이스 유지 중',
  '숏스택이라 불안하네',
  '너무 좋은 패인데?',
  '이건 무조건 콜이지',
  '카드 좀 빨리 주세요',
  '쿼드 나올 것 같아',
  '킥커 싸움이네',
  '베팅 사이즈가 무섭다',
];

function toHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function lighten(color: number, amount: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.floor((color & 0xff) + amount));
  return (r << 16) | (g << 8) | b;
}

export class MainScene extends Phaser.Scene {
  private layoutContainer!: Phaser.GameObjects.Container;
  private decor!: Phaser.GameObjects.Container;
  private timeSinceSave = 0;
  private lastTierId = -1;
  private tablePositions = new Map<number, { x: number; y: number }>();

  constructor() {
    super('MainScene');
  }

  create() {
    this.buildSharedTextures();

    const { width, height } = this.scale;
    this.add.tileSprite(0, 0, width, height, 'floor-tile').setOrigin(0, 0);
    this.decor = this.add.container(0, 0);
    this.layoutContainer = this.add.container(0, 0);

    this.buildDecor();
    this.rebuildLayout();
    this.scheduleSpeechBubble();

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

  private buildSharedTextures() {
    ensurePixelTexture(this, 'floor-tile', floorTileGrid(), { a: '#7a1220', b: '#5c0e18' }, FLOOR_TILE_PX);
    ensurePixelTexture(this, 'chip-decor', chipStackGrid(), { x: '#e0455c', y: '#f5f5f5', z: '#4f8fe0', r: '#c9a227', g: '#3a0f16' }, 6);

    const humanoid = humanoidGrid();
    for (const g of ['N', 'R', 'SR', 'SSR'] as const) {
      const color = toHex(gradeConfig(g).color);
      ensurePixelTexture(this, `dealer-${g}`, humanoid, { ...HUMANOID_PALETTE_BASE, v: color }, 5);
    }
    CUSTOMER_SHIRTS.forEach((color, i) => {
      ensurePixelTexture(this, `customer-${i}`, humanoid, { ...HUMANOID_PALETTE_BASE, v: color }, 5);
    });
  }

  private ensureTableTexture(tierId: number): string {
    const key = `table-tier-${tierId}`;
    // 등급이 오를수록 펠트가 살짝 밝아지는 것만 반영하고, 홀덤 테이블다운 초록+금테를 기본으로 유지.
    const felt = toHex(lighten(0x0b6e4f, tierId * 8));
    ensurePixelTexture(this, key, tableGrid(18, 9), { r: '#c9a227', f: felt, x: '#e0455c', y: '#f5f5f5', z: '#4f8fe0' }, 5);
    return key;
  }

  private buildDecor() {
    this.decor.removeAll(true);
    const { width } = this.scale;
    const count = Math.max(3, Math.floor(width / 220));
    for (let i = 0; i < count; i++) {
      const x = 40 + (i * (width - 80)) / Math.max(1, count - 1);
      const chip = this.add.image(x, 18, 'chip-decor').setOrigin(0.5, 0);
      this.decor.add(chip);
    }
  }

  private scheduleSpeechBubble() {
    const delay = Phaser.Math.Between(3000, 6500);
    this.time.delayedCall(delay, () => {
      this.showRandomSpeechBubble();
      this.scheduleSpeechBubble();
    });
  }

  private showRandomSpeechBubble() {
    const occupiedIds = gameState.tables.map((t) => t.id);
    if (occupiedIds.length === 0) return;
    const tableId = Phaser.Utils.Array.GetRandom(occupiedIds);
    const pos = this.tablePositions.get(tableId);
    if (!pos) return;
    const line = Phaser.Utils.Array.GetRandom(PLAYER_LINES);
    this.spawnSpeechBubble(pos.x, pos.y - 20, line);
  }

  private spawnSpeechBubble(x: number, y: number, text: string) {
    const label = this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '11px', color: '#2a0d13' })
      .setOrigin(0.5);
    const pad = 6;
    const bubble = this.add
      .rectangle(x, y, label.width + pad * 2, label.height + pad * 1.4, 0xfff3d6, 0.95)
      .setStrokeStyle(2, 0xc9a227, 1);
    const tail = this.add.triangle(x, y + label.height / 2 + pad * 0.7 + 4, 0, 0, 8, 0, 4, 6, 0xfff3d6, 0.95);

    bubble.setDepth(10);
    tail.setDepth(10);
    label.setDepth(11);

    this.tweens.add({
      targets: [bubble, tail, label],
      y: '-=18',
      alpha: 0,
      duration: 2200,
      delay: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        bubble.destroy();
        tail.destroy();
        label.destroy();
      },
    });
  }

  private rebuildLayout() {
    const tier = gameState.tier;
    if (tier.id !== this.lastTierId) {
      this.lastTierId = tier.id;
      this.buildDecor();
    }
    this.layoutContainer.removeAll(true);
    this.tablePositions.clear();

    const tables = gameState.tables;
    const tableTextureKey = this.ensureTableTexture(tier.id);
    const startX = (this.scale.width - Math.min(tier.maxTables, COLS) * SLOT_W) / 2 + SLOT_W / 2;

    for (let i = 0; i < tier.maxTables; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = startX + col * SLOT_W;
      const y = GRID_TOP + SLOT_H / 2 + row * SLOT_H;

      if (i < tables.length) {
        this.drawActiveTable(x, y, tables[i], tableTextureKey);
      } else if (i === tables.length) {
        this.drawBuySlot(x, y);
      } else {
        this.drawLockedSlot(x, y);
      }
    }
  }

  private drawActiveTable(x: number, y: number, table: { id: number; level: number }, tableTextureKey: string) {
    this.tablePositions.set(table.id, { x, y });
    const dealer = gameState.dealerFor(table as never);
    const income = gameState.tableIncomePerSecond(table as never);

    const panel = this.add
      .rectangle(x, y, 148, 118, 0xffffff, 0.06)
      .setStrokeStyle(2, 0xffffff, 0.25);
    panel.setInteractive({ useHandCursor: true });
    panel.on('pointerdown', () => this.onTapTable(table.id, x, y));

    const tableImg = this.add.image(x, y + 30, tableTextureKey).setOrigin(0.5, 0.5);

    let dealerImg: Phaser.GameObjects.Image | null = null;
    if (dealer) {
      dealerImg = this.add.image(x - 14, y + 6, `dealer-${dealer.grade}`).setOrigin(0.5, 1);
    }

    // 모든 활성 테이블에는 게임을 하는 손님이 앉아 있다 (딜러 유무와 무관).
    const customerKey = `customer-${table.id % CUSTOMER_SHIRTS.length}`;
    const customerImg = this.add.image(x + 16, y + 52, customerKey).setOrigin(0.5, 1).setScale(0.9);

    const levelText = this.add
      .text(x, y - 44, `Lv.${table.level}`, { fontFamily: 'monospace', fontSize: '14px', color: '#fff8ec' })
      .setOrigin(0.5);
    const incomeText = this.add
      .text(x, y + 48, `${formatCash(income)}/초`, { fontFamily: 'monospace', fontSize: '11px', color: '#ffe6b3' })
      .setOrigin(0.5);
    const gradeText = dealer
      ? this.add
          .text(x, y - 28, `[${gradeConfig(dealer.grade).label}]`, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: toHex(gradeConfig(dealer.grade).color),
          })
          .setOrigin(0.5)
      : null;

    const items: Phaser.GameObjects.GameObject[] = [panel, tableImg, customerImg, levelText, incomeText];
    if (dealerImg) items.push(dealerImg);
    if (gradeText) items.push(gradeText);
    this.layoutContainer.add(items);
  }

  private drawBuySlot(x: number, y: number) {
    const cost = gameState.nextTableCost();
    const box = this.add.rectangle(x, y, 148, 118, 0xfff3d6, 0.12).setStrokeStyle(2, 0xffd98a, 0.7);
    const label = this.add
      .text(x, y - 12, '+ 테이블 구매', { fontFamily: 'monospace', fontSize: '13px', color: '#fff3d6' })
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
    const box = this.add.rectangle(x, y, 148, 118, 0x000000, 0.12).setStrokeStyle(1, 0xffffff, 0.15);
    const label = this.add
      .text(x, y, '잠김', { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff55' })
      .setOrigin(0.5);
    this.layoutContainer.add([box, label]);
  }

  private onTapTable(tableId: number, x: number, y: number) {
    const bonus = gameState.tapTable(tableId);
    if (bonus <= 0) return;

    const floatText = this.add
      .text(x, y - 50, `+${formatCash(bonus)}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffd966',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: floatText,
      y: y - 90,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => floatText.destroy(),
    });
  }
}
