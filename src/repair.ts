import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type MeshAnalysis = {
  vertexCount: number;
  triangleCount: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  components: number;
  watertight: boolean;
};

export type RepairResult = {
  geometry: THREE.BufferGeometry;
  before: MeshAnalysis;
  after: MeshAnalysis;
  notes: string[];
};

// Packed undirected edge key; supports meshes up to 2^26 vertices.
const EDGE_BASE = 67108864;
const edgeKey = (a: number, b: number) => (a < b ? a * EDGE_BASE + b : b * EDGE_BASE + a);

type RawMesh = { positions: number[]; triangles: number[] };

function toRawMesh(geometry: THREE.BufferGeometry): RawMesh {
  const position = geometry.getAttribute('position');
  const positions: number[] = new Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
  }
  const triangles: number[] = [];
  if (geometry.index) {
    for (let i = 0; i < geometry.index.count; i++) triangles.push(geometry.index.getX(i));
  } else {
    for (let i = 0; i < position.count; i++) triangles.push(i);
  }
  return { positions, triangles };
}

function toGeometry(mesh: RawMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setIndex(mesh.triangles);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function edgeCounts(mesh: RawMesh): Map<number, number> {
  const counts = new Map<number, number>();
  const tris = mesh.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const key = edgeKey(tris[i + e], tris[i + (e + 1) % 3]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function componentLabels(mesh: RawMesh): { labels: number[]; count: number } {
  const vertexCount = mesh.positions.length / 3;
  const parent = new Array<number>(vertexCount);
  for (let i = 0; i < vertexCount; i++) parent[i] = i;
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) { const next = parent[x]; parent[x] = root; x = next; }
    return root;
  };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const tris = mesh.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    union(tris[i], tris[i + 1]);
    union(tris[i], tris[i + 2]);
  }
  const labelOf = new Map<number, number>();
  const labels = new Array<number>(tris.length / 3);
  for (let t = 0; t < tris.length; t += 3) {
    const root = find(tris[t]);
    if (!labelOf.has(root)) labelOf.set(root, labelOf.size);
    labels[t / 3] = labelOf.get(root)!;
  }
  return { labels, count: labelOf.size };
}

function analyzeRaw(mesh: RawMesh): MeshAnalysis {
  const counts = edgeCounts(mesh);
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of counts.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }
  const { count: components } = componentLabels(mesh);
  return {
    vertexCount: mesh.positions.length / 3,
    triangleCount: mesh.triangles.length / 3,
    boundaryEdges,
    nonManifoldEdges,
    components,
    watertight: boundaryEdges === 0 && nonManifoldEdges === 0 && mesh.triangles.length > 0,
  };
}

export function analyzeGeometry(geometry: THREE.BufferGeometry): MeshAnalysis {
  return analyzeRaw(toRawMesh(geometry));
}

function removeDegenerateTriangles(mesh: RawMesh): number {
  const kept: number[] = [];
  const p = mesh.positions;
  let removed = 0;
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const a = mesh.triangles[i], b = mesh.triangles[i + 1], c = mesh.triangles[i + 2];
    if (a === b || b === c || a === c) { removed++; continue; }
    const abx = p[b * 3] - p[a * 3], aby = p[b * 3 + 1] - p[a * 3 + 1], abz = p[b * 3 + 2] - p[a * 3 + 2];
    const acx = p[c * 3] - p[a * 3], acy = p[c * 3 + 1] - p[a * 3 + 1], acz = p[c * 3 + 2] - p[a * 3 + 2];
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
    if (cx * cx + cy * cy + cz * cz < 1e-16) { removed++; continue; }
    kept.push(a, b, c);
  }
  mesh.triangles = kept;
  return removed;
}

function removeSmallComponents(mesh: RawMesh, minFraction = 0.02): number {
  const { labels, count } = componentLabels(mesh);
  if (count <= 1) return 0;
  const sizes = new Array<number>(count).fill(0);
  for (const label of labels) sizes[label]++;
  const largest = Math.max(...sizes);
  const keepLabel = sizes.map(size => size >= Math.max(4, largest * minFraction));
  const kept: number[] = [];
  let removed = 0;
  for (let t = 0; t < labels.length; t++) {
    if (keepLabel[labels[t]]) kept.push(mesh.triangles[t * 3], mesh.triangles[t * 3 + 1], mesh.triangles[t * 3 + 2]);
    else removed++;
  }
  mesh.triangles = kept;
  return removed;
}

function unifyWinding(mesh: RawMesh): number {
  const tris = mesh.triangles;
  const triangleCount = tris.length / 3;
  // Map each manifold undirected edge to the triangles that use it.
  const edgeTris = new Map<number, number[]>();
  for (let t = 0; t < triangleCount; t++) {
    for (let e = 0; e < 3; e++) {
      const key = edgeKey(tris[t * 3 + e], tris[t * 3 + (e + 1) % 3]);
      const list = edgeTris.get(key);
      if (list) list.push(t); else edgeTris.set(key, [t]);
    }
  }
  const hasDirectedEdge = (t: number, a: number, b: number) => {
    for (let e = 0; e < 3; e++) {
      if (tris[t * 3 + e] === a && tris[t * 3 + (e + 1) % 3] === b) return true;
    }
    return false;
  };
  const visited = new Uint8Array(triangleCount);
  const flip = new Uint8Array(triangleCount);
  let flipped = 0;
  for (let seed = 0; seed < triangleCount; seed++) {
    if (visited[seed]) continue;
    visited[seed] = 1;
    const queue = [seed];
    while (queue.length) {
      const t = queue.pop()!;
      for (let e = 0; e < 3; e++) {
        let a = tris[t * 3 + e], b = tris[t * 3 + (e + 1) % 3];
        if (flip[t]) { const swap = a; a = b; b = swap; }
        const neighbors = edgeTris.get(edgeKey(a, b))!;
        if (neighbors.length !== 2) continue;
        const other = neighbors[0] === t ? neighbors[1] : neighbors[0];
        if (visited[other]) continue;
        visited[other] = 1;
        // Orientation is consistent when the shared edge runs in opposite
        // directions in the two triangles.
        const otherHasSameDirection = flip[other] ? hasDirectedEdge(other, b, a) : hasDirectedEdge(other, a, b);
        if (otherHasSameDirection) { flip[other] = 1; flipped++; }
        queue.push(other);
      }
    }
  }
  for (let t = 0; t < triangleCount; t++) {
    if (flip[t]) {
      const i = t * 3;
      const swap = tris[i + 1];
      tris[i + 1] = tris[i + 2];
      tris[i + 2] = swap;
    }
  }
  return flipped;
}

function fillHoles(mesh: RawMesh): { filled: number; skipped: number } {
  const counts = edgeCounts(mesh);
  // Boundary directed edges as they appear in triangles chain head-to-tail
  // around each hole for a consistently wound mesh.
  const nextVertex = new Map<number, number>();
  let ambiguous = false;
  const tris = mesh.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tris[i + e], b = tris[i + (e + 1) % 3];
      if (counts.get(edgeKey(a, b)) === 1) {
        if (nextVertex.has(a)) ambiguous = true;
        nextVertex.set(a, b);
      }
    }
  }
  let filled = 0;
  let skipped = 0;
  const consumed = new Set<number>();
  for (const start of nextVertex.keys()) {
    if (consumed.has(start)) continue;
    const loop: number[] = [start];
    consumed.add(start);
    let current = nextVertex.get(start)!;
    let closed = false;
    while (loop.length <= nextVertex.size) {
      if (current === start) { closed = true; break; }
      if (consumed.has(current) || !nextVertex.has(current)) break;
      loop.push(current);
      consumed.add(current);
      current = nextVertex.get(current)!;
    }
    if (!closed || loop.length < 3) { skipped++; continue; }
    const centroid = [0, 0, 0];
    for (const v of loop) {
      centroid[0] += mesh.positions[v * 3];
      centroid[1] += mesh.positions[v * 3 + 1];
      centroid[2] += mesh.positions[v * 3 + 2];
    }
    const centroidIndex = mesh.positions.length / 3;
    mesh.positions.push(centroid[0] / loop.length, centroid[1] / loop.length, centroid[2] / loop.length);
    // Boundary edge (a -> b) borders a triangle; the capping fan runs (b, a, c)
    // so the shared edge is traversed in the opposite direction.
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      mesh.triangles.push(b, a, centroidIndex);
    }
    filled++;
  }
  if (ambiguous && filled === 0) skipped++;
  return { filled, skipped };
}

function orientOutward(mesh: RawMesh): boolean {
  const { labels, count } = componentLabels(mesh);
  const volumes = new Array<number>(count).fill(0);
  const p = mesh.positions;
  const tris = mesh.triangles;
  for (let t = 0; t < labels.length; t++) {
    const a = tris[t * 3], b = tris[t * 3 + 1], c = tris[t * 3 + 2];
    const v =
      p[a * 3] * (p[b * 3 + 1] * p[c * 3 + 2] - p[b * 3 + 2] * p[c * 3 + 1]) -
      p[a * 3 + 1] * (p[b * 3] * p[c * 3 + 2] - p[b * 3 + 2] * p[c * 3]) +
      p[a * 3 + 2] * (p[b * 3] * p[c * 3 + 1] - p[b * 3 + 1] * p[c * 3]);
    volumes[labels[t]] += v / 6;
  }
  let flippedAny = false;
  for (let t = 0; t < labels.length; t++) {
    if (volumes[labels[t]] < 0) {
      const i = t * 3;
      const swap = tris[i + 1];
      tris[i + 1] = tris[i + 2];
      tris[i + 2] = swap;
      flippedAny = true;
    }
  }
  return flippedAny;
}

export function repairGeometry(input: THREE.BufferGeometry): RepairResult {
  const notes: string[] = [];
  const before = analyzeGeometry(input);

  const positionOnly = new THREE.BufferGeometry();
  positionOnly.setAttribute('position', input.getAttribute('position').clone());
  if (input.index) positionOnly.setIndex(input.index.clone());
  positionOnly.computeBoundingBox();
  const diagonal = positionOnly.boundingBox!.getSize(new THREE.Vector3()).length();
  const welded = mergeVertices(positionOnly, Math.max(diagonal * 1e-5, 1e-7));
  positionOnly.dispose();

  const mesh = toRawMesh(welded);
  welded.dispose();
  if (before.vertexCount > mesh.positions.length / 3) {
    notes.push(`Merged ${(before.vertexCount - mesh.positions.length / 3).toLocaleString()} duplicate vertices.`);
  }

  const degenerate = removeDegenerateTriangles(mesh);
  if (degenerate) notes.push(`Removed ${degenerate.toLocaleString()} zero-area triangles.`);

  const debris = removeSmallComponents(mesh);
  if (debris) notes.push(`Removed ${debris.toLocaleString()} triangles of floating debris.`);

  const flipped = unifyWinding(mesh);
  if (flipped) notes.push(`Fixed the facing direction of ${flipped.toLocaleString()} triangles.`);

  const holes = fillHoles(mesh);
  if (holes.filled) notes.push(`Filled ${holes.filled.toLocaleString()} hole${holes.filled === 1 ? '' : 's'} in the surface.`);
  if (holes.skipped) notes.push(`${holes.skipped.toLocaleString()} surface gap${holes.skipped === 1 ? '' : 's'} could not be closed automatically.`);

  if (orientOutward(mesh)) notes.push('Turned inside-out surfaces right-side out.');

  const after = analyzeRaw(mesh);
  if (!after.watertight) {
    notes.push('The mesh is not fully watertight; most slicers will still repair the remainder on import.');
  }
  if (notes.length === 0) notes.push('No repairs were needed.');
  return { geometry: toGeometry(mesh), before, after, notes };
}
