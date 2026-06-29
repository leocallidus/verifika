from __future__ import annotations

import hashlib
import struct
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.db.models import QuestionImage
from app.schemas.question_image import QuestionImageOut


ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


class ImageValidationError(ValueError):
    pass


@dataclass(frozen=True)
class StoredImage:
    storage_key: str
    original_name: Optional[str]
    content_type: str
    size_bytes: int
    width_px: Optional[int]
    height_px: Optional[int]
    sha256_hex: str


def upload_root() -> Path:
    settings = get_settings()
    root = Path(settings.upload_dir)
    if not root.is_absolute():
        root = Path(__file__).resolve().parents[2] / root
    return root


def question_image_url(image_id: int) -> str:
    return f"/api/v2/question-images/{image_id}"


def discipline_image_url(image_id: int) -> str:
    return f"/api/v2/discipline-images/{image_id}"


def topic_image_url(image_id: int) -> str:
    return f"/api/v2/topic-images/{image_id}"


def image_out(image: QuestionImage) -> QuestionImageOut:
    return QuestionImageOut(
        image_id=image.image_id,
        question_id=image.question_id,
        url=question_image_url(image.image_id),
        content_type=image.content_type,
        size_bytes=image.size_bytes,
        width_px=image.width_px,
        height_px=image.height_px,
        original_name=image.original_name,
    )


def storage_path(storage_key: str) -> Path:
    root = upload_root().resolve()
    path = (root / storage_key).resolve()
    if root not in path.parents and path != root:
        raise ImageValidationError("invalid storage path")
    return path


def delete_storage_file(storage_key: str | None) -> None:
    if not storage_key:
        return
    try:
        storage_path(storage_key).unlink(missing_ok=True)
    except FileNotFoundError:
        return


def save_question_image(
    question_id: int,
    data: bytes,
    original_name: str | None,
    declared_content_type: str | None,
) -> StoredImage:
    return save_scoped_image(
        "question-images",
        question_id,
        data,
        original_name,
        declared_content_type,
    )


def save_discipline_image(
    discipline_id: int,
    data: bytes,
    original_name: str | None,
    declared_content_type: str | None,
) -> StoredImage:
    return save_scoped_image(
        "discipline-images",
        discipline_id,
        data,
        original_name,
        declared_content_type,
    )


def save_topic_image(
    topic_id: int,
    data: bytes,
    original_name: str | None,
    declared_content_type: str | None,
) -> StoredImage:
    return save_scoped_image(
        "topic-images",
        topic_id,
        data,
        original_name,
        declared_content_type,
    )


def save_scoped_image(
    scope: str,
    owner_id: int,
    data: bytes,
    original_name: str | None,
    declared_content_type: str | None,
) -> StoredImage:
    settings = get_settings()
    if not data:
        raise ImageValidationError("invalid image file")
    if len(data) > settings.question_image_max_bytes:
        raise ImageValidationError("image too large")

    content_type, width, height, ext = inspect_image(data)
    if declared_content_type and declared_content_type not in ALLOWED_CONTENT_TYPES:
        raise ImageValidationError("unsupported image type")
    if declared_content_type and declared_content_type != content_type:
        raise ImageValidationError("invalid image file")

    storage_key = f"{scope}/{owner_id}/{uuid.uuid4().hex}.{ext}"
    path = storage_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

    return StoredImage(
        storage_key=storage_key,
        original_name=Path(original_name).name if original_name else None,
        content_type=content_type,
        size_bytes=len(data),
        width_px=width,
        height_px=height,
        sha256_hex=hashlib.sha256(data).hexdigest(),
    )


def inspect_image(data: bytes) -> tuple[str, Optional[int], Optional[int], str]:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        if len(data) < 24:
            raise ImageValidationError("invalid image file")
        width, height = struct.unpack(">II", data[16:24])
        _validate_dimensions(width, height)
        return "image/png", width, height, "png"

    if data.startswith(b"\xff\xd8"):
        width, height = _jpeg_dimensions(data)
        _validate_dimensions(width, height)
        return "image/jpeg", width, height, "jpg"

    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        width, height = _webp_dimensions(data)
        _validate_dimensions(width, height)
        return "image/webp", width, height, "webp"

    raise ImageValidationError("unsupported image type")


def _validate_dimensions(width: int | None, height: int | None) -> None:
    if width is None or height is None:
        return
    if width < 64 or height < 64:
        raise ImageValidationError("image dimensions too small")
    if width > 4096 or height > 4096:
        raise ImageValidationError("image dimensions too large")


def _jpeg_dimensions(data: bytes) -> tuple[int, int]:
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        i += 2
        if marker in (0xD8, 0xD9):
            continue
        if i + 2 > len(data):
            break
        segment_len = int.from_bytes(data[i:i + 2], "big")
        if segment_len < 2 or i + segment_len > len(data):
            break
        if marker in {
            0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
        }:
            height = int.from_bytes(data[i + 3:i + 5], "big")
            width = int.from_bytes(data[i + 5:i + 7], "big")
            return width, height
        i += segment_len
    raise ImageValidationError("invalid image file")


def _webp_dimensions(data: bytes) -> tuple[int, int]:
    chunk = data[12:16]
    if chunk == b"VP8X" and len(data) >= 30:
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
        return width, height
    if chunk == b"VP8L" and len(data) >= 25:
        b0, b1, b2, b3 = data[21], data[22], data[23], data[24]
        width = 1 + (((b1 & 0x3F) << 8) | b0)
        height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
        return width, height
    if chunk == b"VP8 " and len(data) >= 30:
        marker = data.find(b"\x9d\x01\x2a", 20)
        if marker != -1 and marker + 7 < len(data):
            width = int.from_bytes(data[marker + 3:marker + 5], "little") & 0x3FFF
            height = int.from_bytes(data[marker + 5:marker + 7], "little") & 0x3FFF
            return width, height
    raise ImageValidationError("invalid image file")
