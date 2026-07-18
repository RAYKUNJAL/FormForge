"""Exercises the synthetic provider end-to-end without ML dependencies.

Run: python selftest.py
"""

import io
import os
import tempfile

from PIL import Image

import providers


def main() -> None:
    image = Image.new("L", (32, 32), 240)
    for x in range(8, 24):
        for y in range(8, 24):
            image.putpixel((x, y), 20)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    stages: list[str] = []
    out_path = os.path.join(tempfile.gettempdir(), "formforge-selftest.glb")
    provider = providers.get_provider("synthetic")
    provider.generate(buffer.getvalue(), out_path, stages.append)

    data = open(out_path, "rb").read()
    assert data[:4] == b"glTF", "output is not a GLB file"
    assert len(data) > 10_000, f"GLB suspiciously small: {len(data)} bytes"
    assert stages, "no progress stages reported"
    os.remove(out_path)
    print(f"selftest ok: {len(data)} byte GLB, stages: {stages}")


if __name__ == "__main__":
    main()
