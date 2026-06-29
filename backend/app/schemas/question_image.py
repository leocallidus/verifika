from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class QuestionImageOut(BaseModel):
    image_id: int
    question_id: int
    url: str
    content_type: str
    size_bytes: int
    width_px: Optional[int] = None
    height_px: Optional[int] = None
    original_name: Optional[str] = None
