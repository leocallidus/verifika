"""tz-student-role-improvement.md §12.6 — расчёт итоговой оценки за тест.

Метод оценивания настраивается преподавателем (TeacherTopicTest.grading_method):
  best    — лучшая попытка (max percent)
  last    — последняя завершённая попытка (max attempt_no)
  average — средняя по всем завершённым попыткам
  first   — первая попытка (min attempt_no)
"""
from __future__ import annotations

from app.db.models import TestSession

GRADING_METHODS = ("best", "last", "average", "first")


def _percent(sess: TestSession) -> float:
    if not sess.max_score:
        return 0.0
    return round((sess.score or 0) * 100.0 / sess.max_score, 1)


def calculate_final_grade(
    sessions: list[TestSession],
    method: str,
) -> tuple[float | None, float | None]:
    """Возвращает (final_score, final_percent) по завершённым попыткам."""
    finished = [s for s in sessions if s.completed_at is not None]
    if not finished:
        return None, None

    if method == "last":
        chosen = max(finished, key=lambda s: s.attempt_no)
        return float(chosen.score or 0), _percent(chosen)
    if method == "first":
        chosen = min(finished, key=lambda s: s.attempt_no)
        return float(chosen.score or 0), _percent(chosen)
    if method == "average":
        avg_score = sum((s.score or 0) for s in finished) / len(finished)
        avg_pct = sum(_percent(s) for s in finished) / len(finished)
        return round(avg_score, 2), round(avg_pct, 1)
    # 'best' (по умолчанию)
    chosen = max(finished, key=lambda s: _percent(s))
    return float(chosen.score or 0), _percent(chosen)


def best_session_id(sessions: list[TestSession]) -> int | None:
    finished = [s for s in sessions if s.completed_at is not None]
    if not finished:
        return None
    return max(finished, key=lambda s: _percent(s)).session_id


def session_percent(sess: TestSession) -> float | None:
    if sess.completed_at is None or not sess.max_score:
        return None
    return _percent(sess)


FIVE_POINT_LABELS = {
    5: "отлично",
    4: "хорошо",
    3: "удовлетворительно",
    2: "неудовлетворительно",
    1: "кол",
}

FIVE_POINT_THRESHOLDS = [
    (90, 5),
    (70, 4),
    (50, 3),
    (20, 2),
    (0, 1),
]

TEN_POINT_THRESHOLDS = [
    (95, 10),
    (85, 9),
    (75, 8),
    (65, 7),
    (55, 6),
    (45, 5),
    (35, 4),
    (25, 3),
    (15, 2),
    (0, 1),
]

def format_grade_py(score: float, max_score: float, scale: str | None) -> str:
    if not max_score:
        return "—"
    percent = round((score * 100.0) / max_score)
    
    if scale == "5_point" or not scale:
        val = 1
        for min_pct, grade in FIVE_POINT_THRESHOLDS:
            if percent >= min_pct:
                val = grade
                break
        label = FIVE_POINT_LABELS[val]
        return f"{val} ({label})"
        
    if scale == "10_point":
        val = 1
        for min_pct, grade in TEN_POINT_THRESHOLDS:
            if percent >= min_pct:
                val = grade
                break
        return f"{val} из 10"
        
    return f"{percent}%"

