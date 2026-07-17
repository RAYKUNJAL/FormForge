import { describe, expect, it } from 'vitest';
import { buildReliefGeometry, geometryToBinaryStl, parseDimension, validateGeometry } from './mesh';

describe('dimension parsing', () => {
  it('converts inches', () => expect(parseDimension('8', 'in')).toBeCloseTo(203.2));
  it('accepts fractions', () => expect(parseDimension('8 1/2', 'in')).toBeCloseTo(215.9));
  it('rejects zero', () => expect(() => parseDimension('0', 'mm')).toThrow());
});

describe('mesh generation', () => {
  it('creates and exports a dimensionally valid closed relief', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    for (let i = 0; i < data.length; i += 4) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255; }
    const settings = { widthMm: 100, heightMm: 60, baseMm: 3, reliefMm: 2, resolution: 12, invert: false };
    const imageData = { data, width: 4, height: 4 } as ImageData;
    const geometry = buildReliefGeometry(imageData, settings);
    const report = validateGeometry(geometry, settings);
    expect(report.valid).toBe(true);
    expect(report.size.x).toBeCloseTo(100);
    expect(report.size.y).toBeCloseTo(60);
    const blob = geometryToBinaryStl(geometry);
    expect(blob.size).toBe(84 + report.triangleCount * 50);

    const index = geometry.index!;
    const edges = new Map<string, number>();
    for (let i = 0; i < index.count; i += 3) {
      const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every(count => count === 2)).toBe(true);
  });
});
