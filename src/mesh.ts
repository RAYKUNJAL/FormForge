import * as THREE from 'three';

export type MeshSettings = {
  widthMm: number;
  heightMm: number;
  baseMm: number;
  reliefMm: number;
  resolution: number;
  invert: boolean;
};

export function parseDimension(value: string, unit: 'in' | 'mm'): number {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a dimension.');
  let numeric: number;
  if (/^\d+\s+\d+\/\d+$/.test(trimmed)) {
    const [whole, fraction] = trimmed.split(/\s+/);
    const [n, d] = fraction.split('/').map(Number);
    if (!d) throw new Error('Invalid fraction.');
    numeric = Number(whole) + n / d;
  } else if (/^\d+\/\d+$/.test(trimmed)) {
    const [n, d] = trimmed.split('/').map(Number);
    if (!d) throw new Error('Invalid fraction.');
    numeric = n / d;
  } else {
    numeric = Number(trimmed);
  }
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Dimensions must be greater than zero.');
  return unit === 'in' ? numeric * 25.4 : numeric;
}

export function buildReliefGeometry(imageData: ImageData, settings: MeshSettings): THREE.BufferGeometry {
  const cols = Math.max(8, Math.min(160, Math.round(settings.resolution)));
  const rows = Math.max(8, Math.round(cols * settings.heightMm / settings.widthMm));
  const heights: number[][] = [];
  for (let y = 0; y <= rows; y++) {
    const row: number[] = [];
    for (let x = 0; x <= cols; x++) {
      const sx = Math.min(imageData.width - 1, Math.round((x / cols) * (imageData.width - 1)));
      const sy = Math.min(imageData.height - 1, Math.round((1 - y / rows) * (imageData.height - 1)));
      const i = (sy * imageData.width + sx) * 4;
      const alpha = imageData.data[i + 3] / 255;
      const lum = (0.2126 * imageData.data[i] + 0.7152 * imageData.data[i + 1] + 0.0722 * imageData.data[i + 2]) / 255;
      let depth = alpha * (1 - lum);
      if (settings.invert) depth = alpha * lum;
      row.push(settings.baseMm + depth * settings.reliefMm);
    }
    heights.push(row);
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const topIndex = (x: number, y: number) => y * (cols + 1) + x;
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= cols; x++) {
      positions.push((x / cols - 0.5) * settings.widthMm, (y / rows - 0.5) * settings.heightMm, heights[y][x]);
    }
  }
  const bottomOffset = positions.length / 3;
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= cols; x++) {
      positions.push((x / cols - 0.5) * settings.widthMm, (y / rows - 0.5) * settings.heightMm, 0);
    }
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = topIndex(x, y), b = topIndex(x + 1, y), c = topIndex(x + 1, y + 1), d = topIndex(x, y + 1);
      indices.push(a, b, d, b, c, d);
      indices.push(bottomOffset + a, bottomOffset + d, bottomOffset + b, bottomOffset + b, bottomOffset + d, bottomOffset + c);
    }
  }

  const addSide = (topA: number, topB: number) => {
    const botA = bottomOffset + topA;
    const botB = bottomOffset + topB;
    indices.push(topA, botA, topB, topB, botA, botB);
  };
  for (let x = 0; x < cols; x++) {
    addSide(topIndex(x + 1, 0), topIndex(x, 0));
    addSide(topIndex(x, rows), topIndex(x + 1, rows));
  }
  for (let y = 0; y < rows; y++) {
    addSide(topIndex(0, y), topIndex(0, y + 1));
    addSide(topIndex(cols, y + 1), topIndex(cols, y));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export { geometryToBinaryStl } from './exporters';

export function validateGeometry(geometry: THREE.BufferGeometry, settings: MeshSettings) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const errors: string[] = [];
  if (!Number.isFinite(size.x + size.y + size.z)) errors.push('The generated mesh contains invalid coordinates.');
  if (Math.abs(size.x - settings.widthMm) > 0.2) errors.push('Width is outside the allowed tolerance.');
  if (Math.abs(size.y - settings.heightMm) > 0.2) errors.push('Height is outside the allowed tolerance.');
  if (size.z < settings.baseMm - 0.1) errors.push('Model thickness is below the selected base thickness.');
  const triangleCount = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  if (triangleCount < 12) errors.push('The generated mesh is incomplete.');
  return { valid: errors.length === 0, errors, size, triangleCount };
}
