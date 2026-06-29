from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict

class ProctorEventIn(BaseModel):
    event_type: str
    metadata: Optional[Any] = None

class ProctorEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: int
    session_id: int
    event_type: str
    metadata: Optional[Any] = None
    created_at: datetime

class ProctorLogOut(BaseModel):
    session_id: int
    proctor_level: int
    events: list[ProctorEventOut]
