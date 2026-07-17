# FormForge MVP

A browser-based image-to-printable-bas-relief application. Upload artwork, rotate it, enter finished dimensions in inches or millimeters, generate a closed 3D mesh, inspect it in a rotatable Three.js preview, and export a binary STL.

## Included

- PNG/JPG/WEBP/SVG upload
- 90-degree image rotation
- Inch, millimeter, decimal, and fractional-inch dimensions
- Base thickness and relief depth
- Adjustable mesh resolution
- Inverted depth option
- Interactive Three.js preview
- Closed/watertight height-field mesh construction
- Dimensional validation
- Binary STL export
- Responsive simple-mode interface
- Optional advanced controls

## Run

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

## Verify

```bash
npm test
npm run lint
npm run build
```

## Current boundary

This MVP creates printable bas-reliefs from images. It does not yet perform full AI reconstruction of the unseen sides of characters or functional products. Those require the later GPU and parametric-engine phases described in `FORMFORGE_BUILD_SPEC.md`.
