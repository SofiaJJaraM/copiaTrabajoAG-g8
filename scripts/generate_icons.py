"""Genera los iconos PNG del manifest de la PWA a partir del logo de Ñamii.

Uso:
    pip install pillow
    python scripts/generate_icons.py
"""

from PIL import Image
from pathlib import Path

SRC = Path.home() / "Downloads" / "icono.png"
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

img = Image.open(SRC).convert("RGB")

img.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png")
img.resize((512, 512), Image.LANCZOS).save(OUT / "icon-512.png")
img.resize((512, 512), Image.LANCZOS).save(OUT / "icon-512-maskable.png")

print(f"Iconos generados en {OUT}")
