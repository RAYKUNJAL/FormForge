import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareModel } from './prepare';

function cube(width = 1, depth = 2, height = 4): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, depth, height);
  geometry.translate(5, -3, 9); // arbitrary offset to prove recentering
  return geometry;
}

describe('prepareModel', () => {
  it('scales the longest side to the target and rests the model on the bed', () => {
    const { geometry, size, scale } = prepareModel(cube(), { targetMm: 100, axis: 'longest', addBase: false, baseMm: 0 });
    expect(size.z).toBeCloseTo(100);
    expect(size.x).toBeCloseTo(25);
    expect(size.y).toBeCloseTo(50);
    expect(scale).toBeCloseTo(25);
    const box = geometry.boundingBox!;
    expect(box.min.z).toBeCloseTo(0);
    expect(box.min.x).toBeCloseTo(-12.5);
    expect(box.max.x).toBeCloseTo(12.5);
  });

  it('scales a specific axis when requested', () => {
    const { size } = prepareModel(cube(), { targetMm: 30, axis: 'x', addBase: false, baseMm: 0 });
    expect(size.x).toBeCloseTo(30);
    expect(size.z).toBeCloseTo(120);
  });

  it('adds a base plate under the footprint', () => {
    const { geometry, size } = prepareModel(cube(), { targetMm: 40, axis: 'longest', addBase: true, baseMm: 3 });
    expect(size.z).toBeCloseTo(43);
    expect(size.x).toBeCloseTo(10);
    expect(geometry.boundingBox!.min.z).toBeCloseTo(0);
  });

  it('rejects nonsense sizes', () => {
    expect(() => prepareModel(cube(), { targetMm: 0, axis: 'longest', addBase: false, baseMm: 0 })).toThrow();
  });
});
