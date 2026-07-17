# Deploying FormForge to a VPS

FormForge is a fully static single-page app — no backend, no database. Everything (mesh generation, validation, STL export) runs in the visitor's browser.

## Option 1: Docker (recommended)

On the VPS:

```bash
git clone https://github.com/RAYKUNJAL/FormForge.git
cd FormForge
docker compose up -d --build
```

The site is now on port 80. To use a different port, change the `ports` mapping in `docker-compose.yml` (e.g. `"8080:80"`).

To update after new commits:

```bash
cd FormForge
git pull
docker compose up -d --build
```

## Option 2: Plain static hosting (no Docker)

Build locally or on the VPS (requires Node 20+):

```bash
npm ci
npm run build
```

Copy the `dist/` folder to your web root and serve it with any web server (nginx, Apache, Caddy). For nginx, use `nginx.conf` in this repo as a starting point — the only requirement is a `try_files $uri $uri/ /index.html;` fallback.

## HTTPS

Put the container behind your existing reverse proxy, or use Caddy for automatic certificates:

```bash
# Caddyfile
yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
```

(with the container mapped to `"8080:80"`).
