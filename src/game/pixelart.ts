import Phaser from 'phaser';

export type PixelGrid = string[];
export type Palette = Record<string, string>;

/** 딜러/손님 실루엣 공용 기본 팔레트 (v/c/a는 등급·용도별로 덮어써서 사용). */
export const HUMANOID_BASE_PALETTE: Palette = { h: '#2b2320', s: '#f5c9a0', w: '#ffffff', p: '#33415c', b: '#1a1a1a' };

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

/** 귀엽고 아기자기한 느낌의 작은 챕터형 캐릭터(딜러/손님 공용 실루엣). 6폭 x 10높이.
 * accessory로 등급 높은 딜러일수록 모자/왕관 같은 장식이 위에 덧붙는다(높이가 늘어남, 원점은 바닥 기준이라 레이아웃엔 영향 없음). */
export function humanoidGrid(accessory: 'none' | 'hat' | 'crown' = 'none'): PixelGrid {
  const base: PixelGrid = [
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
  if (accessory === 'hat') {
    return [fillRow(6, '.', { 1: 'c', 2: 'c', 3: 'c', 4: 'c' }), fillRow(6, '.', { 2: 'c', 3: 'c' }), ...base];
  }
  if (accessory === 'crown') {
    return [
      fillRow(6, '.', { 0: 'c', 2: 'c', 3: 'c', 5: 'c' }),
      fillRow(6, '.', { 0: 'c', 1: 'c', 2: 'a', 3: 'a', 4: 'c', 5: 'c' }),
      ...base,
    ];
  }
  return base;
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

/** 벽 장식용 포커 칩 스택 (홀덤펍 분위기). 6x10. */
export function chipStackGrid(): PixelGrid {
  return [
    fillRow(6, '.', { 1: 'x', 2: 'x', 3: 'x', 4: 'x' }),
    fillRow(6, '.', { 1: 'r', 4: 'r' }),
    fillRow(6, '.', { 1: 'y', 2: 'y', 3: 'y', 4: 'y' }),
    fillRow(6, '.', { 1: 'r', 4: 'r' }),
    fillRow(6, '.', { 1: 'z', 2: 'z', 3: 'z', 4: 'z' }),
    fillRow(6, '.', { 1: 'r', 4: 'r' }),
    fillRow(6, '.', { 1: 'x', 2: 'x', 3: 'x', 4: 'x' }),
    fillRow(6, '.', { 1: 'r', 4: 'r' }),
    fillRow(6, '.', { 0: 'g', 1: 'g', 2: 'g', 3: 'g', 4: 'g', 5: 'g' }),
    fillRow(6, '.'),
  ];
}

/** 미니바 카운터 (병 + 카운터). tier가 오를수록 폭이 넓어지고 병 종류가 늘어난다. tier: 1=기본, 2=칵테일바, 3=고급 라운지. */
export function barCounterGrid(tier: 1 | 2 | 3 = 1): PixelGrid {
  const width = tier === 1 ? 16 : tier === 2 ? 22 : 28;
  const bottleSpacing = tier === 1 ? 3 : 2;
  const bottleRow1 = fillRow(width, '.');
  const bottleRow2 = fillRow(width, '.');
  const arr1 = bottleRow1.split('');
  const arr2 = bottleRow2.split('');
  const colors = ['x', 'y', 'z', 'g'];
  let ci = 0;
  for (let x = 2; x < width - 2; x += bottleSpacing) {
    arr1[x] = colors[ci % colors.length];
    arr2[x] = colors[ci % colors.length];
    ci++;
  }
  const rows: string[] = [arr1.join(''), arr2.join(''), fillRow(width, 'w'), fillRow(width, '.')];
  const rimRows = tier === 3 ? 4 : 3;
  for (let i = 0; i < rimRows; i++) {
    rows.push(fillRow(width, 'r', { 0: '.', [width - 1]: '.' }));
  }
  rows.push(fillRow(width, 'r'));
  return rows;
}

/** 벽에 거는 액자(그림). 인테리어 레벨이 오르면 하나씩 늘어나는 장식. 10x12. */
export function frameGrid(): PixelGrid {
  const rows: string[] = [];
  rows.push(cutCorners(10, 'g', 1));
  for (let i = 0; i < 8; i++) {
    rows.push(i === 3 ? fillRow(10, 'c', { 0: 'g', 9: 'g', 4: 'h', 5: 'h' }) : fillRow(10, 'c', { 0: 'g', 9: 'g' }));
  }
  rows.push(cutCorners(10, 'g', 1));
  return rows;
}

/** 샹들리에(천장 조명). 인테리어 최상급 장식. 14x8. */
export function chandelierGrid(): PixelGrid {
  const rows: string[] = [];
  rows.push(fillRow(14, '.', { 6: 'r', 7: 'r' }));
  rows.push(fillRow(14, '.', { 5: 'r', 6: 'r', 7: 'r', 8: 'r' }));
  rows.push(cutCorners(14, 'g', 3));
  rows.push(fillRow(14, 'g', { 0: '.', 13: '.' }));
  for (let i = 0; i < 2; i++) {
    rows.push(fillRow(14, '.', { 2: 'c', 5: 'c', 8: 'c', 11: 'c' }));
  }
  rows.push(cutCorners(14, 'g', 4));
  return rows;
}

/** 픽셀 격자를 HTML용 인라인 SVG 문자열로 변환 (도감 등 DOM 안에 직접 박아넣을 때 사용). */
export function gridToSvg(grid: PixelGrid, palette: Palette, pixelSize = 4): string {
  const h = grid.length;
  const w = grid[0].length;
  let rects = '';
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === undefined) continue;
      const color = palette[ch];
      if (!color) continue;
      rects += `<rect x="${x * pixelSize}" y="${y * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${color}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * pixelSize}" height="${h * pixelSize}" viewBox="0 0 ${w * pixelSize} ${h * pixelSize}" shape-rendering="crispEdges">${rects}</svg>`;
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
