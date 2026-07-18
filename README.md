# FormForge

A browser-based tool for turning artwork and AI-generated 3D models into print-ready files for Bambu Lab printers. Everything runs client-side — no accounts, no uploads to a server, no per-model fees.

## Two workflows

### Image → Relief
Upload artwork (PNG/JPG/WEBP/SVG), optionally strip the background, rotate it, enter finished dimensions in inches or millimeters, generate a closed bas-relief mesh, preview it in 3D, and export.

### 3D Model → Print
Upload a 3D model (STL, OBJ, GLB, GLTF, or 3MF) — or just a **picture**: the built-in AI service (open-source TripoSR, MIT license, self-hosted) turns a single image into a full 3D model with no third-party accounts or fees. Either way, the mesh is automatically repaired — duplicate vertices welded, floating debris removed, holes filled, flipped triangles fixed, inside-out surfaces corrected — then scaled uniformly to your exact finished size, rested on the bed, optionally given a flat base plate, checked against your printer's build volume, and exported.

## Features

- Built-in picture-to-3D generation (TripoSR) with progress reporting, running entirely on your own server
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

## AI service

`server/` contains a FastAPI service that powers the picture-to-3D button. It wraps the open-source TripoSR model and downloads the weights (~1.5 GB) automatically on first use. A `synthetic` provider (`FORMFORGE_AI_PROVIDER=synthetic`) exercises the same API and pipeline without any ML dependencies — used by the automated tests. Verify the service alone with:

```bash
cd server && python selftest.py
```

The frontend checks `/api/health`; when the service isn't deployed, the AI button is hidden and the rest of the app works unchanged.
