import time
import os
from pathlib import Path

# Sliding window of recent response times in seconds
api_response_times: list[float] = []

def get_api_response_stats() -> dict[str, float]:
    if not api_response_times:
        return {
            "avg_ms": 0.0,
            "min_ms": 0.0,
            "max_ms": 0.0,
            "count": 0
        }
    
    count = len(api_response_times)
    total_sec = sum(api_response_times)
    avg_sec = total_sec / count
    min_sec = min(api_response_times)
    max_sec = max(api_response_times)
    
    return {
        "avg_ms": round(avg_sec * 1000, 2),
        "min_ms": round(min_sec * 1000, 2),
        "max_ms": round(max_sec * 1000, 2),
        "count": count
    }

def get_recent_errors_from_log(limit: int = 20) -> list[dict]:
    log_path = Path("logs/app.log")
    if not log_path.exists():
        return []
    
    errors = []
    try:
        file_size = log_path.stat().st_size
        # Read last 32KB
        seek_pos = max(0, file_size - 32768)
        
        with open(log_path, "r", encoding="utf-8") as f:
            f.seek(seek_pos)
            content = f.read()
            lines = content.splitlines()
            
            # If we seeked in the middle of a line, ignore the first element
            if seek_pos > 0 and lines:
                lines.pop(0)
                
            for line in reversed(lines):
                # Check for ERROR or CRITICAL severity in loguru log lines
                if " | ERROR " in line or " | CRITICAL " in line:
                    parts = line.split(" | ", 2)
                    if len(parts) == 3:
                        errors.append({
                            "timestamp": parts[0].strip(),
                            "level": parts[1].strip(),
                            "message": parts[2].strip()
                        })
                    else:
                        errors.append({
                            "timestamp": "",
                            "level": "ERROR",
                            "message": line
                        })
                    if len(errors) >= limit:
                        break
    except Exception as e:
        errors.append({
            "timestamp": "",
            "level": "ERROR",
            "message": f"Не удалось прочитать логи: {str(e)}"
        })
    return errors
