import time
from collections import defaultdict
from fastapi import Request, HTTPException, status

class RateLimiter:
    def __init__(self, limit: int, period_seconds: int, name: str):
        self.limit = limit
        self.period = period_seconds
        self.name = name
        # map from ip to list of timestamps
        self.history = defaultdict(list)

    def __call__(self, request: Request):
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        
        # Keep only timestamps within the rolling window
        self.history[ip] = [t for t in self.history[ip] if now - t < self.period]
        
        if len(self.history[ip]) >= self.limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Превышен лимит запросов для {self.name}. Разрешено {self.limit} запросов в час.",
            )
        
        self.history[ip].append(now)

# 5 per hour for password changes
change_password_limiter = RateLimiter(limit=5, period_seconds=3600, name="смены пароля")

# 30 per hour for bulk archiving
bulk_archive_limiter = RateLimiter(limit=30, period_seconds=3600, name="bulk-архивации")
