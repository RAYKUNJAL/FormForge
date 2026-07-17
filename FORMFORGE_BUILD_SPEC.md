# FormForge Build Specification

## Goal

Build a simple, non-technical image-to-3D-print application. A user uploads artwork, rotates it, enters finished dimensions in inches or millimeters, previews the result in 3D, validates printability, and exports STL or 3MF.

## Current MVP

The repository currently implements a browser-based bas-relief workflow:

1. Upload PNG, JPG, WEBP, or SVG artwork.
2. Rotate the source image.
3. Enter width, height, base thickness, and relief depth.
4. Accept decimal and fractional-inch measurements.
5. Convert measurements internally to millimeters.
6. Generate a closed height-field mesh.
7. Preview the model with Three.js orbit controls.
8. Validate bounding-box dimensions and minimum geometry.
9. Export a binary STL.

## Product principles

- Simple mode is the default.
- Technical controls belong in Advanced Mode.
- Original uploads must remain non-destructive.
- Every geometry-changing operation must be validated afterward.
- Errors must be shown in plain language.
- Relief, silhouette, and parametric workflows must operate without a GPU.
- Full AI sculpture generation must use a replaceable provider adapter.

## Required future workflows

- Raised artwork and silhouettes
- Bas-relief and lithophanes
- Full AI image-to-3D objects
- Parametric functional-product templates
- Imported mesh repair
- Automatic printer-bed fitting and model splitting

## Planned architecture

- Frontend: React/TypeScript, evolving to Next.js if server features require it
- 3D preview: Three.js or React Three Fiber
- Backend: FastAPI/Python
- Jobs: Redis-backed worker queue
- Database: PostgreSQL
- Storage: S3-compatible object storage
- Parametric generation: OpenSCAD and FreeCAD adapters
- Organic processing: Blender headless adapter
- Mesh processing: Trimesh, Manifold3D, PyMeshFix, and MeshIO
- Optional slicing: PrusaSlicer CLI or CuraEngine
- Deployment: Docker on Hetzner with an optional GPU worker

## Primary future interface

- Dashboard
- New Project
- My Projects
- Templates
- Printer Profiles
- Exports
- Settings

The new-project flow should remain:

1. Upload
2. Choose result
3. Set size
4. Preview
5. Make printable
6. Download

## Printability pipeline

1. Normalize orientation.
2. Remove disconnected fragments.
3. Repair holes and invalid surfaces.
4. Correct winding and normals.
5. Make the mesh manifold where possible.
6. Flatten or add a printable base.
7. Apply minimum thickness rules.
8. Scale to exact requested dimensions.
9. Check printer-bed fit.
10. Export STL and 3MF.
11. Re-import and validate exported files.

## Validation tolerances

- Parametric and relief models: target within ±0.10 mm
- AI-generated organic models: target within ±0.50 mm

## Build sequence

1. Stabilize the current relief MVP.
2. Add background removal, crop, and masking.
3. Add silhouette and raised-art generation.
4. Add lithophane presets.
5. Add 3MF export and stronger mesh validation.
6. Add printer profiles and bed-fit visualization.
7. Add mesh repair and oversized-model splitting.
8. Add parametric OpenSCAD templates.
9. Add an optional GPU image-to-3D provider.
10. Add authentication, saved projects, Docker deployment, monitoring, and backups.

## Definition of done

A feature is not complete until its interface, underlying operation, validation, loading state, failure state, responsive behavior, documentation, and automated tests all work. Do not ship dead buttons or simulated successful generation.
