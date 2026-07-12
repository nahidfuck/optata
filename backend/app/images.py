"""Server-side image pipeline (tech-spec §3).

Re-encoding through Pillow is not cosmetic: it proves the payload is a
real image (not a polyglot) and drops ALL metadata — EXIF, GPS, ICC —
because nothing is passed to save(). Users photograph wishes at home;
without this their address ships inside the file.

Decompression-bomb defence: a ~300KB PNG can declare 12000x12000 in its
header and balloon to ~576MB of RGBA on decode — instant OOM on a 512MB
container. Image.open() only parses the header, so .size is checked
against a hard pixel budget BEFORE any decode. Legitimate uploads are
client-resized to 1200px on the long edge (<2MP), so 25MP is generous.
"""

import io

from PIL import Image

WEBP_QUALITY = 82
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_PIXELS = 25_000_000

# Backstop for anything that slips past the explicit check below.
# Pillow's default (~89MP warning / ~178MP error) is calibrated for a
# desktop, not a small container.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def reencode_webp(data: bytes) -> bytes:
    """Decode, validate, re-encode as clean WebP.

    Raises ValueError on ANY input problem — undecodable bytes, wrong
    format, oversized dimensions, decompression bombs, exotic modes that
    fail conversion. The caller maps ValueError to 415; user input must
    never surface as a 500.
    """
    try:
        image = Image.open(io.BytesIO(data))  # lazy: header only, no decode
    except Exception as exc:  # includes DecompressionBombError
        raise ValueError("not a decodable image") from exc

    if image.format not in ALLOWED_FORMATS:
        raise ValueError(f"unsupported format: {image.format}")

    width, height = image.size
    if width * height > MAX_PIXELS:
        raise ValueError(f"image too large: {width}x{height}")

    try:
        image.load()
        # Explicit mode normalization: CMYK JPEGs, palette PNGs with
        # transparency and 16-bit inputs raise on a direct WebP save.
        if image.mode in ("RGBA", "LA", "PA", "P"):
            image = image.convert("RGBA")
        elif image.mode != "RGB":
            image = image.convert("RGB")
        out = io.BytesIO()
        image.save(out, "WEBP", quality=WEBP_QUALITY)
    except Exception as exc:
        raise ValueError("image could not be processed") from exc
    return out.getvalue()
