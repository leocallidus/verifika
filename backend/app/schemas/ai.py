from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

class AiChatCreateIn(BaseModel):
    first_message: Optional[str] = Field(None, max_length=10000)

class AiChatMessageIn(BaseModel):
    content: Optional[str] = Field(None, max_length=10000)
    model: Optional[str] = Field(None, description="Модель для ответа ассистента")

class AiStudentPreparationIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    model: Optional[str] = Field(None, description="Модель для ответа ассистента")

class AiStudentPreparationOut(BaseModel):
    topic_id: int
    chat_id: int
    message_id: int
    answer: str
    model_used: Optional[str] = None
    tokens_used: Optional[int] = None

class AiChatTitlePatch(BaseModel):
    title: str = Field(min_length=1, max_length=255)

class AiChatOut(BaseModel):
    chat_id: int
    title: Optional[str]
    is_pinned: bool = False
    created_at: datetime
    updated_at: datetime
    last_message_preview: Optional[str] = None  # первые 120 символов
    messages_count: int = 0

    class Config:
        from_attributes = True

class AiUsageOut(BaseModel):
    tokens_today: int
    messages_today: int
    limit_tokens: int
    limit_messages: int
    reset_at: datetime

class AiQuestionRegenerateIn(BaseModel):
    instruction: str = Field(min_length=1, max_length=2000)


class AiMessageOut(BaseModel):
    message_id: int
    chat_id: int
    role: str            # 'user' | 'assistant'
    content: str
    model_used: Optional[str]
    tokens_used: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

class AiStatusOut(BaseModel):
    enabled: bool                          # True если AI включён и доступен текущей роли
    student_access_enabled: Optional[bool] = None  # только для admin/teacher: текущее значение AI_STUDENT_ENABLED
    chat_model: Optional[str] = None
    generation_model: Optional[str] = None
    generation_models_allowed: Optional[List[str]] = None
    chat_models_allowed: Optional[List[str]] = None

class AiGenerationRequest(BaseModel):
    discipline_id:    int
    topic_id:         Optional[int]  = None      # None → генерация по дисциплине в целом
    topic_name_hint:  Optional[str]  = None      # произвольная тема если нет topic_id
    question_types:   List[str]      = ["single", "multi"]
    count:            int            = Field(default=5, ge=1, le=50)
    difficulty_min:   int            = Field(default=1, ge=1, le=5)
    difficulty_max:   int            = Field(default=3, ge=1, le=5)
    language:         str            = "ru"
    additional_context: Optional[str] = Field(None, max_length=2000)
    material:         Optional[str]  = None
    model:            Optional[str]  = None

class AiGenerationTaskOut(BaseModel):
    task_id:         str
    status:          str             # 'processing' | 'done' | 'error'
    generated_count: int
    total_requested: int = 0
    error_message:   Optional[str]
    created_at:      datetime
    completed_at:    Optional[datetime]

    class Config:
        from_attributes = True

class AiPendingQuestionOut(BaseModel):
    question_id:     int
    discipline_id:   int
    topic_id:        Optional[int] = None
    topic_name:      Optional[str] = None
    text:            str
    difficulty:      int
    qtype:           str
    explanation:     Optional[str] = None
    options:         List[dict]
    ai_model_used:   Optional[str] = None
    ai_generated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AiBatchPendingQuestionsIn(BaseModel):
    ids: List[int]
