"""Turns an uploaded announcement image into the one form that is stored: WebP, at most
MAX_SIDE pixels on its longest side, with no metadata. Re-encoding is also the check that
the upload really is an image: anything Pillow cannot decode is refused."""

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

# A phone photo is a few MB; more than this is not a picture for an announcement.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
# Wide enough for a sharp image on a phone or a laptop; larger only costs loading time.
MAX_SIDE = 1600
# Only common photo and screenshot formats. Never SVG: it is a document that can carry scripts.
# MPO is a JPEG with more pictures inside: recent iPhones store their photos that way (the second
# picture is an HDR "gain map"). Only the first, the photo itself, is kept.
ALLOWED_FORMATS = {"JPEG", "MPO", "PNG", "WEBP"}
# A small file can decode to a huge picture ("decompression bomb"), so the decoded size is capped too.
MAX_PIXELS = 40_000_000
WEBP_QUALITY = 82


class InvalidImage(ValueError):
    """The upload is not an image the announcements accept. The message is the API's detail."""


@dataclass(frozen=True)
class StoredImage:
    data: bytes
    width: int
    height: int


def prepare_image(data: bytes) -> StoredImage:
    if len(data) > MAX_UPLOAD_BYTES:
        raise InvalidImage("image too large")
    try:
        with Image.open(BytesIO(data)) as original:
            if original.format not in ALLOWED_FORMATS:
                raise InvalidImage("unsupported image type")
            if original.width * original.height > MAX_PIXELS:
                raise InvalidImage("image too large")
            # Phones save the rotation as metadata; apply it now, because the metadata is dropped below.
            image = ImageOps.exif_transpose(original)
            image.thumbnail((MAX_SIDE, MAX_SIDE))  # keeps the proportions; never enlarges
            image = image.convert("RGBA" if image.has_transparency_data else "RGB")
            out = BytesIO()
            # No exif= or icc_profile= is passed, so nothing from the original file is copied over.
            image.save(out, "WEBP", quality=WEBP_QUALITY)
            return StoredImage(out.getvalue(), image.width, image.height)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise InvalidImage("not an image") from error
    