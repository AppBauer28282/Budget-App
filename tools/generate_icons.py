#!/usr/bin/env python3
"""Erzeugt die App-Icons (weißer Hintergrund, zentriertes Euro-Symbol).

Nutzung: python3 tools/generate_icons.py
Erzeugt icons/icon-512.png, icons/icon-192.png, icons/icon-180.png.
Nur ein Entwicklungs-Hilfsskript (Pillow wird nicht zur Laufzeit der App gebraucht).
"""
import os
from PIL import Image, ImageDraw, ImageFont

INK = "#14202b"
WHITE = "#ffffff"

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

SIZES = [512, 192, 180]
SUPERSAMPLE = 4  # für glatte Kanten: groß zeichnen, dann verkleinern

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")


def find_font():
    for path in FONT_CANDIDATES:
        if os.path.isfile(path):
            return path
    raise FileNotFoundError("Keine passende Schriftdatei gefunden: " + ", ".join(FONT_CANDIDATES))


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make_icon(base_size, font_path):
    size = base_size * SUPERSAMPLE
    radius = int(size * 0.22)

    img = Image.new("RGBA", (size, size), WHITE)
    mask = rounded_mask(size, radius)
    bg = Image.new("RGBA", (size, size), WHITE)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(bg, (0, 0), mask)

    draw = ImageDraw.Draw(canvas)
    font_size = int(size * 0.56)
    font = ImageFont.truetype(font_path, font_size)
    text = "€"  # Euro-Zeichen

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) / 2 - bbox[0]
    y = (size - text_h) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=INK)

    return canvas.resize((base_size, base_size), Image.LANCZOS)


def main():
    font_path = find_font()
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        icon = make_icon(size, font_path)
        out_path = os.path.join(OUT_DIR, f"icon-{size}.png")
        icon.save(out_path)
        print("geschrieben:", out_path)


if __name__ == "__main__":
    main()
