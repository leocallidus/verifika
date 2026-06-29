from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.services.question_images import upload_root, inspect_image, ImageValidationError

def save_proctor_snapshot(
    session_id: int,
    data: bytes,
    original_name: Optional[str],
    declared_content_type: Optional[str],
) -> str:
    """
    Saves proctor webcam snapshot to the disk and returns the relative storage key.
    """
    if not data:
        raise ImageValidationError("empty snapshot data")
    
    # Simple check on file size - snapshots shouldn't be too huge, e.g., max 2MB
    if len(data) > 2 * 1024 * 1024:
        raise ImageValidationError("webcam snapshot too large")
        
    try:
        content_type, width, height, ext = inspect_image(data)
    except ImageValidationError as exc:
        # If inspection fails (e.g. dimensions format) but it starts with standard JPEG header, 
        # let's be more lenient for webcam snapshots, or just use JPG extension.
        if data.startswith(b"\xff\xd8"):
            content_type = "image/jpeg"
            ext = "jpg"
        elif data.startswith(b"\x89PNG\r\n\x1a\n"):
            content_type = "image/png"
            ext = "png"
        else:
            raise ImageValidationError("invalid webcam snapshot format") from exc

    storage_key = f"proctor-snapshots/{session_id}/{uuid.uuid4().hex}.{ext}"
    
    root = upload_root().resolve()
    path = (root / storage_key).resolve()
    
    # Ensure directory exists
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    
    return storage_key
