from fastapi import APIRouter

from app.api.v2 import (
    analytics as analytics_api,
    grading as grading_api,
    notifications as notifications_api,
    policy as policy_api,
    questions as questions_api,
    question_images as question_images_api,
    reference as reference_api,
    reports as reports_api,
    reset as reset_api,
    structure as structure_api,
    tags as tags_api,
    topics as topics_api,
    proctoring as proctoring_api,
    ai_assistant as ai_assistant_api,
    ai_generation as ai_generation_api,
    ai_question_editor as ai_question_editor_api,
    profile_branding as profile_branding_api,
)

router = APIRouter(prefix="/api/v2", tags=["v2"])
for mod in (
    tags_api,
    questions_api,
    question_images_api,
    topics_api,
    policy_api,
    grading_api,
    reference_api,
    structure_api,
    reports_api,
    analytics_api,
    reset_api,
    notifications_api,
    proctoring_api,
    ai_assistant_api,
    ai_generation_api,
    ai_question_editor_api,
    profile_branding_api,
):
    router.include_router(mod.router)


__all__ = ["router"]

