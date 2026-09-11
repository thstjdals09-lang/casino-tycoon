import Phaser from 'phaser';

export type PixelGrid = string[];
export type Palette = Record<string, string>;

function fillRow(width: number, fill: string, overrides: Record<number, string> = {}): string {
  const arr = new Array(width).fill(fill);
  for (const [i, ch] of Object.entries(overrides)) arr[Number(i)] = ch;
  return arr.join('');
}

function cutCorners(width: number, fill: string, cornerCut: number): string {
  const arr = new Array(width).fill(fill);
  for (let i = 0; i < cornerCut; i++) {
    arr[i] = '.';
    arr[width - 1 - i] = '.';
  }
  return arr.join('');
}

function rimTransition(width: number, inner: string, rim: string): string {
  const arr = new Array(width).fill(inner);
  arr[0] = rim;
  arr[width - 1] = rim;
  return arr.join('');
}

/** 귀엽고 아기자기한 느낌의 작은 챕터형 캐릭터(딜러/손님 공용 실루엣). 6폭 x 10높이. */
export function humanoidGrid(): PixelGrid {
  return [
    fillRow(6, '.', { 2: 'h', 3: 'h' }),
    fillRow(6, '.', { 1: 'h', 2: 's', 3: 's', 4: 'h' }),
    fillRow(6, '.', { 1: 'h', 2: 's', 3: 's', 4: 'h' }),
    fillRow(6, '.', { 2: 's', 3: 's' }),
    fillRow(6, '.', { 1: 'v', 2: 'v', 3: 'v', 4: 'v' }),
    fillRow(6, '.', { 1: 'v', 2: 'w', 3: 'w', 4: 'v' }),
    fillRow(6, '.', { 1: 'v', 2: 'v', 3: 'v', 4: 'v' }),
    fillRow(6, '.', { 1: 'p', 2: 'p', 3: 'p', 4: 'p' }),
    fillRow(6, '.', { 1: 'p', 2: 'p', 3: 'p', 4: 'p' }),
    fillRow(6, '.', { 1: 'b', 2: 'b', 4: 'b' }),
  ];
}

/** 위에서 본 포커 테이블. 나무 테두리 + 펠트 + 칩 3개. width x height 파라미터로 조절 가능. */
export function tableGrid(width = 20, height = 10): PixelGrid {
  const rows: string[] = [];
  rows.push(cutCorners(width, 'r', 2));
  rows.push(rimTransition(width, 'f', 'r'));
  for (let i = 0; i < height - 4; i++) {
    if (i === Math.floor((height - 4) / 2)) {
      const mid = Math.floor(width / 2);
      rows.push(fillRow(width, 'f', { [mid - 2]: 'x', [mid]: 'y', [mid + 2]: 'z' }));
    } else {
      rows.push(fillRow(width, 'f'));
    }
  }
  rows.push(rimTransition(width, 'f', 'r'));
  rows.push(cutCorners(width, 'r', 2));
  return rows;
}

/** 따뜻한 나무 바닥 타일 (2색 교차용 기본 패턴 하나). 8x8. */
export function floorTileGrid(): PixelGrid {
  return [
    fillRow(8, 'a', { 7: 'b' }),
    fillRow(8, 'a', { 7: 'b' }),
    fillRow(8, 'a', { 7: 'b' }),
    fillRow(8, 'a', { 7: 'b' }),
    fillRow(8, 'b', { 0: 'a' }),
    fillRow(8, 'b', { 0: 'a' }),
    fillRow(8, 'b', { 0: 'a' }),
    fillRow(8, 'b', { 0: 'a' }),
  ];
}

/** 벽 장식용 작은 화분. 6x8. */
export function plantGrid(): PixelGrid {
  return [
    fillRow(6, '.', { 2: 'l', 3: 'l' }),
    fillRow(6, '.', { 1: 'l', 2: 'l', 3: 'l', 4: 'l' }),
    fillRow(6, '.', { 1: 'l', 2: 'l', 3: 'l', 4: 'l' }),
    fillRow(6, '.', { 2: 'l', 3: 'l' }),
    fillRow(6, '.', { 2: 't', 3: 't' }),
    fillRow(6, '.', { 1: 'p', 2: 'p', 3: 'p', 4: 'p' }),
    fillRow(6, '.', { 1: 'p', 2: 'p', 3: 'p', 4: 'p' }),
    fillRow(6, '.'),
  ];
}

export function ensurePixelTexture(
  scene: Phaser.Scene,
  key: string,
  grid: PixelGrid,
  palette: Palette,
  pixelSize: number
): { width: number; height: number } {
  const h = grid.length;
  const w = grid[0].length;
  if (scene.textures.exists(key)) {
    return { width: w * pixelSize, height: h * pixelSize };
  }
  const canvasTexture = scene.textures.createCanvas(key, w * pixelSize, h * pixelSize)!;
  const ctx = canvasTexture.getContext();
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === undefined) continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }
  }
  canvasTexture.refresh();
  return { width: w * pixelSize, height: h * pixelSize };
}
