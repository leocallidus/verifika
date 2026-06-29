from __future__ import annotations

from functools import lru_cache
from typing import Annotated, List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _split_csv(v):
    if isinstance(v, str):
        return [o.strip() for o in v.split(",") if o.strip()]
    if v is None:
        return []
    return v


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(alias="DATABASE_URL")
    jwt_secret: str = Field(alias="JWT_SECRET", min_length=16)
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(default=480, alias="JWT_EXPIRE_MINUTES", ge=1)
    cors_origins: Annotated[List[str], NoDecode] = Field(default_factory=list, alias="CORS_ORIGINS")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    bcrypt_rounds: int = Field(default=12, alias="BCRYPT_ROUNDS", ge=4, le=15)
    smtp_host: str = Field(default="", alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_user: str = Field(default="", alias="SMTP_USER")
    smtp_pass: str = Field(default="", alias="SMTP_PASS")
    reset_link_ttl: int = Field(default=1800, alias="RESET_LINK_TTL", ge=60)
    public_base_url: str = Field(default="http://localhost:5173", alias="PUBLIC_BASE_URL")
    upload_dir: str = Field(default="uploads", alias="UPLOAD_DIR")
    question_image_max_bytes: int = Field(default=5 * 1024 * 1024, alias="QUESTION_IMAGE_MAX_BYTES", ge=1)

    # ===== AI MODULE =====
    ai_enabled: bool = Field(default=False, alias="AI_ENABLED")
    ai_student_enabled: bool = Field(
        default=True,
        alias="AI_STUDENT_ENABLED",
        description="Разрешить ИИ-Ассистента для роли student. Игнорируется если ai_enabled=False."
    )
    ai_api_key: str = Field(default="", alias="AI_API_KEY")
    ai_base_url: str = Field(
        default="https://polza.ai/api/v1", alias="AI_BASE_URL"
    )
    ai_chat_model: str = Field(
        default="anthropic/claude-sonnet-4-5-20250929", alias="AI_CHAT_MODEL"
    )
    ai_generation_model: str = Field(
        default="openai/gpt-4o", alias="AI_GENERATION_MODEL"
    )
    ai_chat_temperature: float = Field(
        default=0.7, alias="AI_CHAT_TEMPERATURE", ge=0.0, le=2.0
    )
    ai_chat_max_tokens: int = Field(
        default=4096, alias="AI_CHAT_MAX_TOKENS", ge=256
    )
    ai_gen_temperature: float = Field(
        default=0.3, alias="AI_GEN_TEMPERATURE", ge=0.0, le=2.0
    )
    ai_gen_max_tokens: int = Field(
        default=8192, alias="AI_GEN_MAX_TOKENS", ge=256
    )
    ai_system_prompt: str = Field(
        default="Ты — педагогический ИИ-ассистент платформы Верифика.",
        alias="AI_SYSTEM_PROMPT",
    )
    ai_context_window: int = Field(
        default=20, alias="AI_CONTEXT_WINDOW", ge=5, le=100
    )
    ai_request_timeout: int = Field(
        default=60, alias="AI_REQUEST_TIMEOUT", ge=10, le=300
    )
    ai_max_questions_per_request: int = Field(
        default=50, alias="AI_MAX_QUESTIONS_PER_REQUEST", ge=1, le=50
    )
    ai_daily_token_limit_student: int = Field(default=0, alias="AI_DAILY_TOKEN_LIMIT_STUDENT", ge=0)
    ai_daily_message_limit_student: int = Field(default=50, alias="AI_DAILY_MESSAGE_LIMIT_STUDENT", ge=0)
    ai_generation_models_allowed: Annotated[List[str], NoDecode] = Field(
        default_factory=lambda: ["openai/gpt-4o", "anthropic/claude-sonnet-4-5-20250929"],
        alias="AI_GENERATION_MODELS_ALLOWED"
    )
    ai_chat_models_allowed: Annotated[List[str], NoDecode] = Field(
        default_factory=lambda: ["openai/gpt-4o", "anthropic/claude-sonnet-4-5-20250929"],
        alias="AI_CHAT_MODELS_ALLOWED"
    )
    ai_gen_material_max_chars: int = Field(default=12000, alias="AI_GEN_MATERIAL_MAX_CHARS", ge=0)

    @field_validator("cors_origins", "ai_generation_models_allowed", "ai_chat_models_allowed", mode="before")
    @classmethod
    def _coerce(cls, v):
        return _split_csv(v)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
