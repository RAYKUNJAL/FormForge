"""FormForge AI service: turns a picture into a 3D model file.

POST /api/generate            -> {"job_id": ...}
GET  /api/jobs/{job_id}       -> {"status": "queued"|"processing"|"complete"|"failed", "stage": ..., "error": ...}
GET  /api/jobs/{job_id}/model -> the generated GLB file
GET  /api/health              -> {"status": "ok", "provider": ...}
"""

import io
import os
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageFile

import providers

# Browsers tolerate minor file damage (bad checksums, truncation); match them.
ImageFile.LOAD_TRUNCATED_IMAGES = True

PROVIDER_NAME = os.environ.get("FORMFORGE_AI_PROVIDER", "triposr")
OUTPUT_DIR = os.environ.get("FORMFORGE_AI_OUTPUT", os.path.join(tempfile.gettempdir(), "formforge-jobs"))
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
JOB_TTL_SECONDS = 3600

app = FastAPI(title="FormForge AI service")
jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()
executor = ThreadPoolExecutor(max_workers=1)  # generation is CPU-heavy; run one at a time
os.makedirs(OUTPUT_DIR, exist_ok=True)


def _update(job_id: str, **fields) -> None:
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(fields)


def _cleanup_expired() -> None:
    now = time.time()
    with jobs_lock:
        expired = [job_id for job_id, job in jobs.items() if now - job["created"] > JOB_TTL_SECONDS]
        for job_id in expired:
            path = jobs.pop(job_id).get("path")
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


def _run_job(job_id: str, image_bytes: bytes) -> None:
    _update(job_id, status="processing", stage="starting")
    try:
        provider = providers.get_provider(PROVIDER_NAME)
        out_path = os.path.join(OUTPUT_DIR, f"{job_id}.glb")
        provider.generate(image_bytes, out_path, lambda stage: _update(job_id, stage=stage))
        _update(job_id, status="complete", stage="done", path=out_path)
    except Exception as error:  # noqa: BLE001 - surfaced to the user in plain language
        _update(job_id, status="failed", error=f"3D generation failed: {error}")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "provider": PROVIDER_NAME}


@app.post("/api/generate")
async def generate(image: UploadFile = File(...)) -> dict:
    data = await image.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "The picture is too large. Use an image under 25 MB.")
    try:
        Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as error:
        raise HTTPException(400, "That file is not a readable image. Upload a PNG, JPG, or WEBP picture.") from error
    _cleanup_expired()
    job_id = uuid.uuid4().hex
    with jobs_lock:
        jobs[job_id] = {"status": "queued", "stage": "waiting for a free slot", "created": time.time()}
    executor.submit(_run_job, job_id, data)
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str) -> dict:
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Unknown job. It may have expired; upload the picture again.")
        return {key: job[key] for key in ("status", "stage", "error") if key in job}


@app.get("/api/jobs/{job_id}/model")
def job_model(job_id: str) -> FileResponse:
    with jobs_lock:
        job = jobs.get(job_id)
    if not job or job.get("status") != "complete" or not job.get("path"):
        raise HTTPException(404, "The model is not ready yet.")
    return FileResponse(job["path"], media_type="model/gltf-binary", filename="formforge-generated.glb")
