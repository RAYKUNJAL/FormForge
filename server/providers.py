"""Model-generation providers for the FormForge AI service.

`triposr` runs the open-source TripoSR image-to-3D model (MIT licensed).
`synthetic` builds a relief-style mesh from image brightness with no ML
dependencies; it exists so the API and frontend can be exercised end-to-end
on machines without the model weights.
"""

import io
import os
from typing import Callable

import numpy as np
import trimesh
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

StageCallback = Callable[[str], None]


class SyntheticProvider:
    name = "synthetic"

    def generate(self, image_bytes: bytes, out_path: str, set_stage: StageCallback) -> str:
        set_stage("reading the picture")
        image = Image.open(io.BytesIO(image_bytes)).convert("L").resize((48, 48))
        set_stage("building the 3D model")
        heights = (1.0 - np.asarray(image, dtype=np.float32) / 255.0) * 10.0 + 2.0
        rows, cols = heights.shape
        xs = np.linspace(-24.0, 24.0, cols)
        ys = np.linspace(24.0, -24.0, rows)
        top = np.array([[xs[x], ys[y], heights[y, x]] for y in range(rows) for x in range(cols)])
        bottom = top.copy()
        bottom[:, 2] = 0.0
        vertices = np.vstack([top, bottom])
        offset = rows * cols
        faces = []
        idx = lambda x, y: y * cols + x  # noqa: E731
        for y in range(rows - 1):
            for x in range(cols - 1):
                a, b, c, d = idx(x, y), idx(x + 1, y), idx(x + 1, y + 1), idx(x, y + 1)
                faces += [[a, d, b], [b, d, c]]
                faces += [[offset + a, offset + b, offset + d], [offset + b, offset + c, offset + d]]
        for x in range(cols - 1):
            faces += [[idx(x, 0), idx(x + 1, 0), offset + idx(x, 0)],
                      [idx(x + 1, 0), offset + idx(x + 1, 0), offset + idx(x, 0)]]
            faces += [[idx(x + 1, rows - 1), idx(x, rows - 1), offset + idx(x + 1, rows - 1)],
                      [idx(x, rows - 1), offset + idx(x, rows - 1), offset + idx(x + 1, rows - 1)]]
        for y in range(rows - 1):
            faces += [[idx(0, y + 1), idx(0, y), offset + idx(0, y + 1)],
                      [idx(0, y), offset + idx(0, y), offset + idx(0, y + 1)]]
            faces += [[idx(cols - 1, y), idx(cols - 1, y + 1), offset + idx(cols - 1, y)],
                      [idx(cols - 1, y + 1), offset + idx(cols - 1, y + 1), offset + idx(cols - 1, y)]]
        mesh = trimesh.Trimesh(vertices=vertices, faces=np.array(faces), process=True)
        set_stage("exporting")
        mesh.export(out_path)
        return out_path


class TripoSRProvider:
    """Wraps the TripoSR reference implementation (github.com/VAST-AI-Research/TripoSR),
    following the interface documented in its README and demo app."""

    name = "triposr"

    def __init__(self) -> None:
        self._model = None
        self._rembg_session = None

    def _load(self, set_stage: StageCallback):
        if self._model is not None:
            return self._model
        set_stage("loading the AI model (first run downloads about 1.5 GB)")
        import torch  # noqa: F401
        from tsr.system import TSR

        model = TSR.from_pretrained(
            os.environ.get("FORMFORGE_TRIPOSR_MODEL", "stabilityai/TripoSR"),
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        model.renderer.set_chunk_size(int(os.environ.get("FORMFORGE_CHUNK_SIZE", "8192")))
        model.to(self._device())
        self._model = model
        return model

    @staticmethod
    def _device() -> str:
        import torch

        return "cuda:0" if torch.cuda.is_available() else "cpu"

    def _foreground(self, image: Image.Image, set_stage: StageCallback) -> Image.Image:
        try:
            import rembg
            from tsr.utils import remove_background, resize_foreground

            set_stage("separating the subject from the background")
            if self._rembg_session is None:
                self._rembg_session = rembg.new_session()
            cut = remove_background(image.convert("RGB"), self._rembg_session)
            cut = resize_foreground(cut, 0.85)
            rgba = np.asarray(cut).astype(np.float32) / 255.0
            rgb = rgba[:, :, :3] * rgba[:, :, 3:4] + (1 - rgba[:, :, 3:4]) * 0.5
            return Image.fromarray((rgb * 255.0).astype(np.uint8))
        except Exception:
            return image.convert("RGB")

    def generate(self, image_bytes: bytes, out_path: str, set_stage: StageCallback) -> str:
        model = self._load(set_stage)
        image = Image.open(io.BytesIO(image_bytes))
        image = self._foreground(image, set_stage)
        set_stage("generating the 3D shape (this takes a few minutes on CPU)")
        import torch

        with torch.no_grad():
            scene_codes = model([image], device=self._device())
        set_stage("extracting the mesh")
        resolution = int(os.environ.get("FORMFORGE_MC_RESOLUTION", "256"))
        try:
            mesh = model.extract_mesh(scene_codes, True, resolution=resolution)[0]
        except TypeError:
            mesh = model.extract_mesh(scene_codes, resolution=resolution)[0]
        set_stage("exporting")
        mesh.export(out_path)
        return out_path


_PROVIDERS = {"synthetic": SyntheticProvider, "triposr": TripoSRProvider}
_instances: dict[str, object] = {}


def get_provider(name: str):
    if name not in _PROVIDERS:
        raise ValueError(f"Unknown provider '{name}'. Choose one of: {', '.join(sorted(_PROVIDERS))}.")
    if name not in _instances:
        _instances[name] = _PROVIDERS[name]()
    return _instances[name]
