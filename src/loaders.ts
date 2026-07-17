import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SUPPORTED_MODEL_EXTENSIONS = ['stl', 'obj', 'glb', 'gltf', '3mf'];

function collectGeometries(root: THREE.Object3D): THREE.BufferGeometry[] {
  root.updateWorldMatrix(true, true);
  const geometries: THREE.BufferGeometry[] = [];
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const source = mesh.geometry as THREE.BufferGeometry;
    const position = source.getAttribute('position');
    if (!position) return;
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', position.clone());
    if (source.index) clean.setIndex(source.index.clone());
    const nonIndexed = clean.index ? clean.toNonIndexed() : clean;
    if (nonIndexed !== clean) clean.dispose();
    nonIndexed.applyMatrix4(mesh.matrixWorld);
    geometries.push(nonIndexed);
  });
  return geometries;
}

function mergeAll(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 0) throw new Error('The file did not contain any 3D geometry.');
  if (geometries.length === 1) return geometries[0];
  const merged = mergeGeometries(geometries, false);
  geometries.forEach(g => g.dispose());
  if (!merged) throw new Error('The file could not be combined into a single mesh.');
  return merged;
}

export async function loadModelFile(file: File): Promise<THREE.BufferGeometry> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!SUPPORTED_MODEL_EXTENSIONS.includes(extension)) {
    throw new Error('Unsupported file type. Upload an STL, OBJ, GLB, GLTF, or 3MF model.');
  }
  try {
    if (extension === 'stl') {
      const geometry = new STLLoader().parse(await file.arrayBuffer());
      return geometry;
    }
    if (extension === 'obj') {
      const group = new OBJLoader().parse(await file.text());
      return mergeAll(collectGeometries(group));
    }
    if (extension === '3mf') {
      const group = new ThreeMFLoader().parse(await file.arrayBuffer());
      return mergeAll(collectGeometries(group));
    }
    const gltf = await new GLTFLoader().parseAsync(await file.arrayBuffer(), '');
    return mergeAll(collectGeometries(gltf.scene));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The file')) throw error;
    if (error instanceof Error && error.message.startsWith('Unsupported')) throw error;
    throw new Error(
      extension === 'gltf'
        ? 'This GLTF file references external resources. Export it as a single .glb file and try again.'
        : `The ${extension.toUpperCase()} file could not be read. Re-export it from the tool that created it and try again.`,
    );
  }
}
