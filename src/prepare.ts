import * as THREE from 'three';

export type SizeAxis = 'longest' | 'x' | 'y' | 'z';

export type PrepareSettings = {
  targetMm: number;
  axis: SizeAxis;
  addBase: boolean;
  baseMm: number;
};

export type PreparedModel = {
  geometry: THREE.BufferGeometry;
  size: THREE.Vector3;
  scale: number;
};

// Uniformly scales the model so the chosen dimension matches targetMm,
// centers it on the bed, rests it on z = 0, and optionally adds a flat
// base plate beneath the footprint.
export function prepareModel(source: THREE.BufferGeometry, settings: PrepareSettings): PreparedModel {
  let geometry = source.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const reference =
    settings.axis === 'x' ? size.x :
    settings.axis === 'y' ? size.y :
    settings.axis === 'z' ? size.z :
    Math.max(size.x, size.y, size.z);
  if (!(reference > 0)) throw new Error('The model has no measurable size along the selected dimension.');
  if (!(settings.targetMm > 0)) throw new Error('Enter a finished size greater than zero.');
  const scale = settings.targetMm / reference;
  const center = new THREE.Vector3();
  box.getCenter(center);
  geometry.translate(-center.x, -center.y, -box.min.z);
  geometry.scale(scale, scale, scale);

  if (settings.addBase && settings.baseMm > 0) {
    geometry.translate(0, 0, settings.baseMm);
    geometry.computeBoundingBox();
    const scaled = geometry.boundingBox!;
    const baseWidth = Math.max(scaled.max.x - scaled.min.x, 1);
    const baseDepth = Math.max(scaled.max.y - scaled.min.y, 1);
    // Overlap the plate into the model slightly so the two shells fuse in the slicer.
    const base = new THREE.BoxGeometry(baseWidth, baseDepth, settings.baseMm + 0.1);
    base.translate((scaled.max.x + scaled.min.x) / 2, (scaled.max.y + scaled.min.y) / 2, (settings.baseMm + 0.1) / 2);
    const modelPart = geometry.index ? geometry.toNonIndexed() : geometry;
    const basePart = base.toNonIndexed();
    const modelPosition = modelPart.getAttribute('position');
    const basePosition = basePart.getAttribute('position');
    const combined = new Float32Array((modelPosition.count + basePosition.count) * 3);
    combined.set(modelPosition.array as Float32Array, 0);
    combined.set(basePosition.array as Float32Array, modelPosition.count * 3);
    if (modelPart !== geometry) modelPart.dispose();
    geometry.dispose();
    base.dispose();
    basePart.dispose();
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(combined, 3));
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const finalSize = new THREE.Vector3();
  geometry.boundingBox!.getSize(finalSize);
  return { geometry, size: finalSize, scale };
}
