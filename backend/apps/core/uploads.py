"""Validation and safe naming for uploaded files."""

import uuid
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "MPO"}


def validate_file_size(file):
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    if file.size > limit:
        raise ValidationError(
            f"This file is too large. The limit is {settings.MAX_UPLOAD_MB} MB.", code="file_too_large"
        )


def validate_image(file):
    """Checks the real file content (not only the name) is an allowed image."""
    validate_file_size(file)
    try:
        file.seek(0)
        image = Image.open(file)
        fmt = image.format
        image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise ValidationError("Please choose a photo (JPG, PNG or WEBP).", code="invalid_image")
    finally:
        file.seek(0)
    if fmt not in ALLOWED_IMAGE_FORMATS:
        raise ValidationError("Please choose a photo (JPG, PNG or WEBP).", code="invalid_image")


def validate_receipt(file):
    """Receipts may be a photo or a PDF document."""
    validate_file_size(file)
    if Path(file.name).suffix.lower() == ".pdf":
        file.seek(0)
        head = file.read(5)
        file.seek(0)
        if head != b"%PDF-":
            raise ValidationError("This PDF file could not be read.", code="invalid_document")
        return
    validate_image(file)


def _random_name(folder, filename):
    suffix = Path(filename).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"}:
        suffix = ".jpg"
    return f"{folder}/{uuid.uuid4().hex}{suffix}"


def property_photo_path(instance, filename):
    return _random_name("properties", filename)


def inspection_photo_path(instance, filename):
    return _random_name("inspections", filename)


def maintenance_photo_path(instance, filename):
    return _random_name("maintenance", filename)


def receipt_path(instance, filename):
    return _random_name("receipts", filename)
