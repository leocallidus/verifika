from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Optional


class Bus:
    def __init__(self) -> None:
        self._subs: dict[tuple[str, int], list[asyncio.Queue]] = defaultdict(list)
        self._role_subs: dict[str, list[asyncio.Queue]] = defaultdict(list)

    async def publish(self, role: str, user_id: int, event: dict[str, Any]) -> None:
        for q in list(self._subs.get((role, int(user_id)), [])):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def publish_broadcast(self, role: str, event: dict[str, Any]) -> None:
        for q in list(self._role_subs.get(role, [])):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def subscribe(self, role: str, user_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=128)
        self._subs[(role, int(user_id))].append(q)
        return q

    def subscribe_role(self, role: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._role_subs[role].append(q)
        return q

    def unsubscribe(self, role: str, user_id: int, q: asyncio.Queue) -> None:
        subs = self._subs.get((role, int(user_id)), [])
        if q in subs:
            subs.remove(q)

    def unsubscribe_role(self, role: str, q: asyncio.Queue) -> None:
        subs = self._role_subs.get(role, [])
        if q in subs:
            subs.remove(q)


bus = Bus()
