import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { geometryToBinaryStl } from './exporters';
import { loadModelFile } from './loaders';

const OBJ_CUBE = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1
f 1 3 2
f 1 4 3
f 5 6 7
f 5 7 8
f 1 2 6
f 1 6 5
f 3 4 8
f 3 8 7
f 1 5 8
f 1 8 4
f 2 3 7
f 2 7 6
`;

describe('loadModelFile', () => {
  it('loads binary STL files', async () => {
    const blob = geometryToBinaryStl(new THREE.BoxGeometry(5, 5, 5));
    const file = new File([blob], 'cube.stl');
    const geometry = await loadModelFile(file);
    expect(geometry.getAttribute('position').count).toBe(36);
  });

  it('loads OBJ files', async () => {
    const file = new File([OBJ_CUBE], 'cube.obj');
    const geometry = await loadModelFile(file);
    expect(geometry.getAttribute('position').count).toBe(36);
  });

  it('rejects unsupported formats in plain language', async () => {
    const file = new File(['solid nope'], 'cube.step');
    await expect(loadModelFile(file)).rejects.toThrow('Unsupported file type');
  });
});
