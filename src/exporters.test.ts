import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { strFromU8, unzipSync } from 'fflate';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { geometryTo3mf, geometryToBinaryStl } from './exporters';

function cube(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(10, 20, 30);
  geometry.translate(0, 0, 15);
  return geometry;
}

describe('geometryTo3mf', () => {
  it('produces a valid 3MF package', async () => {
    const blob = geometryTo3mf(cube(), 'test cube');
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files)).toContain('[Content_Types].xml');
    expect(Object.keys(files)).toContain('_rels/.rels');
    expect(Object.keys(files)).toContain('3D/3dmodel.model');
    const model = strFromU8(files['3D/3dmodel.model']);
    expect(model).toContain('unit="millimeter"');
    expect(model.match(/<triangle /g)).toHaveLength(12);
    expect(model.match(/<vertex /g)).toHaveLength(24); // BoxGeometry has split normals: 24 vertices
    expect(model).toContain('<item objectid="1"/>');
  });
});

describe('geometryToBinaryStl', () => {
  it('round-trips through the STL loader', async () => {
    const blob = geometryToBinaryStl(cube());
    expect(blob.size).toBe(84 + 12 * 50);
    const parsed = new STLLoader().parse(await blob.arrayBuffer());
    expect(parsed.getAttribute('position').count).toBe(36);
    parsed.computeBoundingBox();
    const size = new THREE.Vector3();
    parsed.boundingBox!.getSize(size);
    expect(size.x).toBeCloseTo(10);
    expect(size.y).toBeCloseTo(20);
    expect(size.z).toBeCloseTo(30);
  });
});
