"""Rebuild the synthetic #176 PNGs using Pillow's bundled font."""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

directory = Path(__file__).resolve().parent
font = ImageFont.load_default(size=48)
for case in json.loads((directory / "expected.json").read_text())["cases"]:
    image = Image.new("RGB", (1000, 160 + 100 * len(case["source_text"])), "white")
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(case["source_text"]):
        draw.text((70, 70 + 100 * index), line, font=font, fill="black")
    image.save(directory / case["file"])
