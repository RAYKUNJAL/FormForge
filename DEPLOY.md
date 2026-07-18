# Deploying FormForge to a VPS

FormForge has two parts:

- **formforge** — the website (static files served by nginx). Mesh repair, sizing, and file export all run in the visitor's browser.
- **ai** — the picture-to-3D service (FastAPI + open-source TripoSR). Optional but recommended; without it the site still works for image reliefs and uploaded 3D files.

## Requirements

- Docker with the compose plugin
- For the AI service: **8 GB+ RAM recommended**. On CPU-only servers a generation takes a few minutes; with an NVIDIA GPU it takes seconds.
- Disk: the AI image is a few GB, plus ~1.5 GB of model weights downloaded automatically on the first generation (cached in a Docker volume).

## Deploy

```bash
git clone https://github.com/RAYKUNJAL/FormForge.git
cd FormForge
docker compose up -d --build
```

The site is on port 80. The first `docker compose build` compiles the AI image (several minutes); the first picture you convert downloads the TripoSR weights before generating.

To update after new commits:

```bash
cd FormForge
git pull
docker compose up -d --build
```

## Checking the AI service

```bash
curl http://127.0.0.1/api/health        # {"status":"ok","provider":"triposr"}
docker logs -f formforge-ai             # watch generation progress
```

If `/api/health` fails, the site's "3D Model → Print" tab shows a notice and hides the picture-to-3D button — everything else keeps working.

## Options

Set in a `.env` file next to `docker-compose.yml`:

- `FORMFORGE_AI_PROVIDER=synthetic` — replaces the AI with a fast test generator (no weights, no ML). Useful to verify the plumbing on a small server.

Lower `FORMFORGE_MC_RESOLUTION` (default 256) in the ai service environment to trade detail for speed on slow CPUs.

## Static-only hosting (no Docker, no AI)

```bash
npm ci && npm run build
```

Serve `dist/` with any web server; use `nginx.conf` as a starting point (the `/api/` block can be removed). Requires only a `try_files $uri $uri/ /index.html;` SPA fallback.

## HTTPS

Put port 80 behind your existing reverse proxy, or use Caddy:

```
yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
```

(with the formforge service mapped to `"8080:80"`). Keep proxy read timeouts at 10+ minutes so CPU generations aren't cut off.
