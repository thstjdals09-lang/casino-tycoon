import Phaser from 'phaser';
import { gameState } from '../game/instance';
import { formatCash } from '../game/balance';
import { emitStateChanged, gameEvents } from '../game/events';
import { gradeConfig } from '../game/gacha';
import { customerGradeConfig } from '../game/customers';
import { ensurePixelTexture, barCounterGrid, chandelierGrid, chipStackGrid, floorTileGrid, frameGrid, humanoidGrid, plantGrid, tableGrid } from '../game/pixelart';
import { barVisualTier } from '../game/decor';
import type { TableInstance, VenueTierConfig } from '../game/types';

const SLOT_W = 170;
const SLOT_H = 130;
const COLS = 4;
const GRID_TOP = 48;
const AUTOSAVE_MS = 10_000;
const FLOOR_TILE_PX = 6; // floorTileGrid()가 8x8이므로 실제 타일은 48x48

const HUMANOID_PALETTE_BASE = { h: '#2b2320', s: '#f5c9a0', w: '#ffffff', p: '#33415c', b: '#1a1a1a' };
const CUSTOMER_GRADE_IDS = ['C', 'B', 'A', 'S'] as const;

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
  private floorSprite!: Phaser.GameObjects.TileSprite;
  private floorPlaque!: Phaser.GameObjects.Container;
  private floorPlaqueTitle!: Phaser.GameObjects.Text;
  private floorPlaqueSubtitle!: Phaser.GameObjects.Text;
  private hasInitialized = false;
  private timeSinceSave = 0;
  private lastTierId = -1;
  private lastDesignLevel = -1;
  private lastBarLevel = -1;
  private tablePositions = new Map<number, { x: number; y: number }>();
  private dragStartY = 0;
  private dragStartScroll = 0;
  private isDragging = false;
  private dragDistance = 0;

  constructor() {
    super('MainScene');
  }

  create() {
    this.buildSharedTextures();

    const { width, height } = this.scale;
    const initialTier = gameState.tier;
    const initialFloorKey = this.ensureFloorTexture(initialTier.id, initialTier.floorColor);
    this.floorSprite = this.add.tileSprite(0, 0, width, height, initialFloorKey).setOrigin(0, 0);
    this.decor = this.add.container(0, 0);
    this.layoutContainer = this.add.container(0, 0);

    // 카메라를 스크롤해도 항상 화면에 고정되는 "현재 층" 표지판.
    const plaqueBg = this.add.rectangle(0, 0, 128, 40, 0x0d0308, 0.85).setStrokeStyle(2, 0xc9a227, 0.9).setOrigin(0, 0);
    this.floorPlaqueTitle = this.add
      .text(64, 7, '', { fontFamily: 'monospace', fontSize: '13px', color: '#ffd966', fontStyle: 'bold' })
      .setOrigin(0.5, 0);
    this.floorPlaqueSubtitle = this.add
      .text(64, 23, '', { fontFamily: 'monospace', fontSize: '9px', color: '#fff3d6' })
      .setOrigin(0.5, 0);
    this.floorPlaque = this.add.container(8, 8, [plaqueBg, this.floorPlaqueTitle, this.floorPlaqueSubtitle]);
    this.floorPlaque.setScrollFactor(0);
    this.floorPlaque.setDepth(20);

    this.buildDecor();
    this.rebuildLayout();
    this.hasInitialized = true;
    this.scheduleSpeechBubble();

    // 층이 넓어지면(테이블 많아지면) 세로로 드래그해서 둘러볼 수 있게.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragStartY = p.y;
      this.dragStartScroll = this.cameras.main.scrollY;
      this.isDragging = true;
      this.dragDistance = 0;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isDragging || !p.isDown) return;
      const dy = p.y - this.dragStartY;
      this.dragDistance = Math.max(this.dragDistance, Math.abs(dy));
      const maxScroll = Math.max(0, this.cameras.main.getBounds().height - height);
      const newScroll = Phaser.Math.Clamp(this.dragStartScroll - dy, 0, maxScroll);
      this.cameras.main.scrollY = newScroll;
    });
    this.input.on('pointerup', () => {
      this.isDragging = false;
    });

    gameEvents.addEventListener('state-changed', () => this.rebuildLayout());
  }

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    const autoManaged = gameState.tick(dt);
    if (autoManaged) emitStateChanged();

    this.timeSinceSave += deltaMs;
    if (this.timeSinceSave >= AUTOSAVE_MS) {
      this.timeSinceSave = 0;
      gameState.save();
    }
  }

  private buildSharedTextures() {
    ensurePixelTexture(this, 'chip-decor', chipStackGrid(), { x: '#e0455c', y: '#f5f5f5', z: '#4f8fe0', r: '#c9a227', g: '#3a0f16' }, 6);

    const humanoidBase = humanoidGrid('none');
    const humanoidHat = humanoidGrid('hat');
    const humanoidCrown = humanoidGrid('crown');
    const ACCESSORY_GRID: Record<string, ReturnType<typeof humanoidGrid>> = {
      N: humanoidBase,
      R: humanoidBase,
      SR: humanoidHat,
      SSR: humanoidCrown,
    };
    for (const g of ['N', 'R', 'SR', 'SSR'] as const) {
      const color = toHex(gradeConfig(g).color);
      ensurePixelTexture(this, `dealer-${g}`, ACCESSORY_GRID[g], { ...HUMANOID_PALETTE_BASE, v: color, c: '#ffd700', a: '#e0455c' }, 5);
    }
    CUSTOMER_GRADE_IDS.forEach((g) => {
      const color = toHex(customerGradeConfig(g).color);
      const accessory = g === 'S' ? 'hat' : 'none';
      ensurePixelTexture(this, `customer-${g}`, humanoidGrid(accessory), { ...HUMANOID_PALETTE_BASE, v: color, c: '#ffd700' }, 5);
    });
    ensurePixelTexture(this, 'bar-tier-1', barCounterGrid(1), { r: '#c9a227', w: '#3a0f16', x: '#e0455c', y: '#4ecb9a', z: '#4f8fe0', g: '#f5f5f5' }, 6);
    ensurePixelTexture(this, 'bar-tier-2', barCounterGrid(2), { r: '#c9a227', w: '#4a1420', x: '#e0455c', y: '#4ecb9a', z: '#4f8fe0', g: '#c264ff' }, 6);
    ensurePixelTexture(this, 'bar-tier-3', barCounterGrid(3), { r: '#ffd966', w: '#4a1420', x: '#e0455c', y: '#4ecb9a', z: '#4f8fe0', g: '#c264ff' }, 6);
    ensurePixelTexture(this, 'plant-decor', plantGrid(), { l: '#4caf6b', t: '#2e7d4f', p: '#c56a3b' }, 6);
    ensurePixelTexture(this, 'frame-decor', frameGrid(), { g: '#c9a227', c: '#2f6b8a', h: '#e8c99b' }, 5);
    ensurePixelTexture(this, 'chandelier-decor', chandelierGrid(), { r: '#8b5a2b', g: '#ffd966', c: '#f5f5f5' }, 5);
  }

  private ensureTableTexture(tierId: number): string {
    const key = `table-tier-${tierId}`;
    // 등급이 오를수록 펠트가 살짝 밝아지는 것만 반영하고, 홀덤 테이블다운 초록+금테를 기본으로 유지.
    const felt = toHex(lighten(0x0b6e4f, tierId * 8));
    ensurePixelTexture(this, key, tableGrid(18, 9), { r: '#c9a227', f: felt, x: '#e0455c', y: '#f5f5f5', z: '#4f8fe0' }, 5);
    return key;
  }

  /** 층(매장 티어)마다 바닥 색을 다르게 해서 "다른 층에 있다"는 느낌을 준다. */
  private ensureFloorTexture(tierId: number, floorColor: number): string {
    const key = `floor-tile-tier-${tierId}`;
    ensurePixelTexture(this, key, floorTileGrid(), { a: toHex(lighten(floorColor, 40)), b: toHex(floorColor) }, FLOOR_TILE_PX);
    return key;
  }

  private buildDecor() {
    this.decor.removeAll(true);
    const { width } = this.scale;
    const tier = gameState.tier;
    const designLevel = gameState.designLevel;
    const barTier = barVisualTier(gameState.barLevel);

    if (barTier > 0) {
      const bar = this.add.image(width / 2, 4, `bar-tier-${barTier}`).setOrigin(0.5, 0);
      this.decor.add(bar);
      if (barTier >= 3) {
        const sparkle = this.add.text(width / 2 + 60, 6, '✨', { fontSize: '11px' }).setOrigin(0.5);
        this.tweens.add({ targets: sparkle, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });
        this.decor.add(sparkle);
      }
    }

    // 인테리어 레벨이 오르면 샹들리에가 바 위쪽에 작게 걸림 (세로 공간이 좁아서 겹치듯 배치).
    if (designLevel >= 10) {
      this.decor.add(this.add.image(width / 2, 0, 'chandelier-decor').setOrigin(0.5, 0).setScale(0.5).setDepth(5));
    }

    // 좌우로 퍼지는 장식 한 줄: 기본은 칩 스택이고, 인테리어 레벨이 오를수록 화분/액자가 섞여 들어가
    // 매장이 점점 화려해지는 느낌을 준다. 층(티어)이 높을수록 장식 개수 자체도 늘어남.
    const decorKeys: string[] = [];
    const chipCount = 2 + tier.id;
    for (let i = 0; i < chipCount; i++) decorKeys.push('chip-decor');
    if (designLevel >= 3) decorKeys.push('plant-decor', 'plant-decor');
    if (designLevel >= 6) {
      const frameCount = Math.min(4, 1 + Math.floor((designLevel - 6) / 4));
      for (let i = 0; i < frameCount; i++) decorKeys.push('frame-decor');
    }

    const scaleFor = (key: string) => (key === 'frame-decor' ? 0.5 : 1);
    const slots = decorKeys.length + 1; // +1은 바 카운터 자리
    const centerSlot = Math.floor(slots / 2);
    let slotIdx = 0;
    decorKeys.forEach((key) => {
      if (slotIdx === centerSlot) slotIdx++; // 바 카운터 자리는 건너뜀
      const t = slots <= 1 ? 0.5 : slotIdx / (slots - 1);
      const x = 26 + t * (width - 52);
      this.decor.add(this.add.image(x, 8, key).setOrigin(0.5, 0).setScale(scaleFor(key)));
      slotIdx++;
    });
  }

  private showFloorChangeToast(tier: VenueTierConfig) {
    const { width } = this.scale;
    const text = `🎉 ${tier.id + 1}층 입장 · ${tier.name}`;
    const label = this.add
      .text(width / 2, 90, text, { fontFamily: 'monospace', fontSize: '16px', color: '#2a0d13', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30);
    const pad = 12;
    const bg = this.add
      .rectangle(width / 2, 90, label.width + pad * 2, label.height + pad, 0xffd966, 0.95)
      .setStrokeStyle(3, 0xc9a227, 1)
      .setScrollFactor(0)
      .setDepth(29);

    this.tweens.add({ targets: [label, bg], scale: 1.06, duration: 220, yoyo: true, ease: 'Quad.easeOut' });
    this.tweens.add({
      targets: [label, bg],
      alpha: 0,
      duration: 900,
      delay: 2200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        label.destroy();
        bg.destroy();
      },
    });
  }

  private scheduleSpeechBubble() {
    const delay = Phaser.Math.Between(3000, 6500);
    this.time.delayedCall(delay, () => {
      this.showRandomSpeechBubble();
      this.scheduleSpeechBubble();
    });
  }

  private showRandomSpeechBubble() {
    const seatedIds = gameState.tables.filter((t) => t.dealerId !== null).map((t) => t.id);
    if (seatedIds.length === 0) return;
    const tableId = Phaser.Utils.Array.GetRandom(seatedIds);
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
    const tierChanged = tier.id !== this.lastTierId;
    const designChanged = gameState.designLevel !== this.lastDesignLevel;
    const barChanged = gameState.barLevel !== this.lastBarLevel;
    if (tierChanged || designChanged || barChanged) {
      this.lastDesignLevel = gameState.designLevel;
      this.lastBarLevel = gameState.barLevel;
      this.buildDecor();
    }
    if (tierChanged) {
      const isRealAdvance = this.hasInitialized && this.lastTierId !== -1;
      this.lastTierId = tier.id;
      this.floorSprite.setTexture(this.ensureFloorTexture(tier.id, tier.floorColor));
      this.cameras.main.setBackgroundColor(tier.floorColor);
      this.floorPlaqueTitle.setText(`🏢 ${tier.id + 1}층`);
      this.floorPlaqueSubtitle.setText(tier.name);
      if (isRealAdvance) this.showFloorChangeToast(tier);
    }
    this.layoutContainer.removeAll(true);
    this.tablePositions.clear();

    const rows = Math.max(1, Math.ceil(tier.maxTables / COLS));
    const contentHeight = Math.max(this.scale.height, GRID_TOP + rows * SLOT_H + 40);
    this.floorSprite.setSize(this.scale.width, contentHeight);
    this.cameras.main.setBounds(0, 0, this.scale.width, contentHeight);
    // 층이 바뀌면(확장하면) 스크롤을 맨 위로 되돌려서 새로 생긴 자리를 바로 보여준다.
    if (tierChanged) this.cameras.main.scrollY = 0;

    // 층 이름은 상단 HUD에 표시되므로(스크롤 시 겹칠 공간이 부족해) 씬 안에는 따로 배너를 넣지 않는다.

    // 미니바 매출 라벨 (바 스프라이트는 buildDecor에서 고정 배치, 여기선 숫자만 갱신).
    if (gameState.barLevel > 0) {
      const barLabel = this.add
        .text(this.scale.width / 2, 46, `🍸 바 Lv.${gameState.barLevel} · +${formatCash(gameState.barIncomePerSecond())}/초`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffe6b3',
        })
        .setOrigin(0.5, 0);
      this.layoutContainer.add(barLabel);
    }

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

  private drawActiveTable(x: number, y: number, table: TableInstance, tableTextureKey: string) {
    this.tablePositions.set(table.id, { x, y });
    const dealer = gameState.dealerFor(table);
    const income = gameState.tableIncomePerSecond(table);

    const panel = this.add
      .rectangle(x, y, 148, 118, 0xffffff, 0.06)
      .setStrokeStyle(2, 0xffffff, 0.25);
    panel.setInteractive({ useHandCursor: true });
    panel.on('pointerup', () => {
      if (this.dragDistance < 8) this.onTapTable(table.id, x, y);
    });

    const centerX = x;
    const centerY = y + 34;
    const tableImg = this.add.image(centerX, centerY, tableTextureKey).setOrigin(0.5, 0.5).setScale(0.85);

    const items: Phaser.GameObjects.GameObject[] = [panel, tableImg];

    // 홀덤 8인 테이블 컨셉: 딜러 1명 + 손님 최대 8명을 테이블 둘레(타원)에 배치.
    const rx = 54;
    const ry = 30;
    const seatCount = 9; // 딜러 1 + 손님 8
    const angleFor = (i: number) => (-90 + (360 / seatCount) * i) * (Math.PI / 180);

    if (dealer) {
      const a = angleFor(0);
      const dx = centerX + rx * Math.cos(a);
      const dy = centerY + ry * Math.sin(a);
      const dealerImg = this.add.image(dx, dy, `dealer-${dealer.grade}`).setOrigin(0.5, 1).setScale(0.6);
      items.push(dealerImg);
      if (dealer.grade === 'SSR') {
        const sparkle = this.add.text(dx + 8, dy - 30, '✨', { fontSize: '12px' }).setOrigin(0.5);
        this.tweens.add({ targets: sparkle, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });
        items.push(sparkle);
      }

      table.customerGrades.slice(0, 8).forEach((grade, seatIdx) => {
        const a2 = angleFor(seatIdx + 1);
        const cx = centerX + rx * Math.cos(a2);
        const cy = centerY + ry * Math.sin(a2);
        const custImg = this.add.image(cx, cy, `customer-${grade}`).setOrigin(0.5, 1).setScale(0.34);
        items.push(custImg);
        if (grade === 'S') {
          const sparkle = this.add.text(cx + 5, cy - 16, '✨', { fontSize: '9px' }).setOrigin(0.5);
          this.tweens.add({ targets: sparkle, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });
          items.push(sparkle);
        }
      });
    }

    const levelText = this.add
      .text(x, y - 52, `Lv.${table.level}${table.level > 0 && table.level % 10 === 0 ? ' ⭐' : ''}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#fff8ec',
      })
      .setOrigin(0.5);
    const incomeText = this.add
      .text(x, y - 38, `${formatCash(income)}/초`, { fontFamily: 'monospace', fontSize: '10px', color: '#ffe6b3' })
      .setOrigin(0.5);

    items.push(levelText, incomeText);
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
      box.on('pointerup', () => {
        if (this.dragDistance < 8 && gameState.buyTable()) emitStateChanged();
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
    emitStateChanged();

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
