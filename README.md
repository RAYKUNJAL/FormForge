# FormForge

A browser-based tool for turning artwork and AI-generated 3D models into print-ready files for Bambu Lab printers. Everything runs client-side — no accounts, no uploads to a server, no per-model fees.

## Two workflows

### Image → Relief
Upload artwork (PNG/JPG/WEBP/SVG), optionally strip the background, rotate it, enter finished dimensions in inches or millimeters, generate a closed bas-relief mesh, preview it in 3D, and export.

### 3D Model → Print
Upload a 3D model (STL, OBJ, GLB, GLTF, or 3MF) from ChatGPT, Google, Meshy, Tripo, or any other tool. The mesh is automatically repaired — duplicate vertices welded, floating debris removed, holes filled, flipped triangles fixed, inside-out surfaces corrected — then scaled uniformly to your exact finished size, rested on the bed, optionally given a flat base plate, checked against your printer's build volume, and exported.

## Features

- One-click automatic background removal for AI renders
- Inch, millimeter, decimal, and fractional-inch dimensions (e.g. `8 1/2`)
- Automatic mesh repair with a plain-language report
- Bambu Lab printer profiles (A1 mini, A1, P1P, P1S, X1C, X1E, H2D) with bed-fit checking and a bed outline in the preview
- 3MF export (Bambu's native format) and binary STL export
- Interactive Three.js preview
- Dimensional validation before every export
- Simple mode by default; advanced controls tucked away

## Run

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

## Verify

```bash
npm test        # unit tests: parsing, mesh generation, repair, exporters, printers, background removal
npm run lint
npm run build
node tests/e2e.mjs   # full browser test against a running preview server
```

For the e2e test, start `npm run preview` first (or set `FORMFORGE_URL`). Set `CHROMIUM_PATH` to use a pre-installed Chromium.

## Deploy

See `DEPLOY.md` — a Dockerfile, nginx config, and docker-compose file are included.

## Current boundary

FormForge repairs and prepares existing 3D models; it does not generate the unseen sides of a 2D picture by itself. To go from a single image to a full 3D object, generate the model with an image-to-3D tool (Meshy, Tripo, TripoSR, Hunyuan3D, etc.) and drop the result into the **3D Model → Print** workflow. A built-in generation provider is a planned phase in `FORMFORGE_BUILD_SPEC.md`.
