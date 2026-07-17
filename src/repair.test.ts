import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { analyzeGeometry, repairGeometry } from './repair';

const CUBE_VERTICES = [
  0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
  0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
];

const CUBE_TRIANGLES = [
  0, 2, 1, 0, 3, 2, // bottom
  4, 5, 6, 4, 6, 7, // top
  0, 1, 5, 0, 5, 4, // front
  2, 3, 7, 2, 7, 6, // back
  0, 4, 7, 0, 7, 3, // left
  1, 2, 6, 1, 6, 5, // right
];

function makeGeometry(vertices: number[], triangles: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(triangles);
  return geometry;
}

function signedVolume(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  const index = geometry.index!;
  let volume = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i));
    b.fromBufferAttribute(position, index.getX(i + 1));
    c.fromBufferAttribute(position, index.getX(i + 2));
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

describe('analyzeGeometry', () => {
  it('reports a closed cube as watertight', () => {
    const report = analyzeGeometry(makeGeometry(CUBE_VERTICES, CUBE_TRIANGLES));
    expect(report.watertight).toBe(true);
    expect(report.triangleCount).toBe(12);
    expect(report.components).toBe(1);
    expect(report.boundaryEdges).toBe(0);
  });

  it('detects holes', () => {
    const report = analyzeGeometry(makeGeometry(CUBE_VERTICES, CUBE_TRIANGLES.slice(0, 33)));
    expect(report.watertight).toBe(false);
    expect(report.boundaryEdges).toBe(3);
  });
});

describe('repairGeometry', () => {
  it('fills holes left by missing triangles', () => {
    const broken = makeGeometry(CUBE_VERTICES, CUBE_TRIANGLES.slice(0, 30)); // two triangles missing
    const { after, geometry } = repairGeometry(broken);
    expect(after.watertight).toBe(true);
    expect(signedVolume(geometry)).toBeGreaterThan(0.9);
  });

  it('removes floating debris', () => {
    const vertices = [...CUBE_VERTICES, 5, 5, 5, 5.01, 5, 5, 5, 5.01, 5];
    const triangles = [...CUBE_TRIANGLES, 8, 9, 10];
    const { after } = repairGeometry(makeGeometry(vertices, triangles));
    expect(after.components).toBe(1);
    expect(after.triangleCount).toBe(12);
  });

  it('fixes inconsistent winding', () => {
    const triangles = [...CUBE_TRIANGLES];
    [triangles[0], triangles[1]] = [triangles[1], triangles[0]]; // flip one triangle
    const broken = makeGeometry(CUBE_VERTICES, triangles);
    expect(analyzeGeometry(broken).watertight).toBe(true); // undirected check cannot see it
    const { geometry, after } = repairGeometry(broken);
    expect(after.watertight).toBe(true);
    expect(signedVolume(geometry)).toBeCloseTo(1, 3);
  });

  it('turns an inside-out mesh right-side out', () => {
    const flipped: number[] = [];
    for (let i = 0; i < CUBE_TRIANGLES.length; i += 3) {
      flipped.push(CUBE_TRIANGLES[i], CUBE_TRIANGLES[i + 2], CUBE_TRIANGLES[i + 1]);
    }
    const { geometry } = repairGeometry(makeGeometry(CUBE_VERTICES, flipped));
    expect(signedVolume(geometry)).toBeCloseTo(1, 3);
  });

  it('welds duplicated vertices from triangle soup', () => {
    const soup: number[] = [];
    for (const index of CUBE_TRIANGLES) {
      soup.push(CUBE_VERTICES[index * 3], CUBE_VERTICES[index * 3 + 1], CUBE_VERTICES[index * 3 + 2]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(soup, 3));
    const { after } = repairGeometry(geometry);
    expect(after.vertexCount).toBe(8);
    expect(after.watertight).toBe(true);
  });
});
