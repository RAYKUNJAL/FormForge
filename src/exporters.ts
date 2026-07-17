import * as THREE from 'three';
import { strToU8, zipSync } from 'fflate';

export function geometryToBinaryStl(geometry: THREE.BufferGeometry): Blob {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = nonIndexed.getAttribute('position');
  const normal = nonIndexed.getAttribute('normal');
  const triangleCount = position.count / 3;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangleCount, true);
  let offset = 84;
  for (let i = 0; i < position.count; i += 3) {
    const nx = normal ? (normal.getX(i) + normal.getX(i + 1) + normal.getX(i + 2)) / 3 : 0;
    const ny = normal ? (normal.getY(i) + normal.getY(i + 1) + normal.getY(i + 2)) / 3 : 0;
    const nz = normal ? (normal.getZ(i) + normal.getZ(i + 1) + normal.getZ(i + 2)) / 3 : 1;
    for (const n of [nx, ny, nz]) { view.setFloat32(offset, n, true); offset += 4; }
    for (let v = 0; v < 3; v++) {
      view.setFloat32(offset, position.getX(i + v), true); offset += 4;
      view.setFloat32(offset, position.getY(i + v), true); offset += 4;
      view.setFloat32(offset, position.getZ(i + v), true); offset += 4;
    }
    view.setUint16(offset, 0, true); offset += 2;
  }
  nonIndexed.dispose();
  return new Blob([buffer], { type: 'model/stl' });
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

const round = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};

export function geometryTo3mf(geometry: THREE.BufferGeometry, title = 'FormForge model'): Blob {
  const position = geometry.getAttribute('position');
  if (!position) throw new Error('The model has no geometry to export.');
  const vertexParts: string[] = [];
  for (let i = 0; i < position.count; i++) {
    vertexParts.push(`<vertex x="${round(position.getX(i))}" y="${round(position.getY(i))}" z="${round(position.getZ(i))}"/>`);
  }
  const triangleParts: string[] = [];
  if (geometry.index) {
    const index = geometry.index;
    for (let i = 0; i < index.count; i += 3) {
      triangleParts.push(`<triangle v1="${index.getX(i)}" v2="${index.getX(i + 1)}" v3="${index.getX(i + 2)}"/>`);
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      triangleParts.push(`<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}"/>`);
    }
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Title">${title.replace(/[<>&"]/g, '')}</metadata>
 <metadata name="Application">FormForge</metadata>
 <resources>
  <object id="1" type="model">
   <mesh>
    <vertices>${vertexParts.join('')}</vertices>
    <triangles>${triangleParts.join('')}</triangles>
   </mesh>
  </object>
 </resources>
 <build>
  <item objectid="1"/>
 </build>
</model>`;
  const zipped = zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES_XML),
    '_rels/.rels': strToU8(RELS_XML),
    '3D/3dmodel.model': strToU8(model),
  }, { level: 6 });
  const bytes = new Uint8Array(zipped);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'model/3mf' });
}
