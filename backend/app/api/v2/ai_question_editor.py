from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from loguru import logger

from app.core.deps import CurrentUser, require_teacher
from app.services.ai_client import AiClient
from app.core.config import get_settings

router = APIRouter(prefix="/ai/editor", tags=["v2.ai_editor"])


AI_EDITOR_SYSTEM_PROMPT = (
    "Ты — методист и эксперт по составлению тестовых вопросов. "
    "Отвечай строго в запрошенном JSON-формате, без markdown и пояснений вне JSON."
)

class GenerateOptionsReq(BaseModel):
    text: str = Field(..., description="Текст вопроса")
    qtype: str = Field(..., description="Тип вопроса (single, multi, etc.)")
    count: int = Field(4, description="Количество вариантов")

class GenerateOptionsResOption(BaseModel):
    text: str
    is_correct: bool

class GenerateOptionsRes(BaseModel):
    options: List[GenerateOptionsResOption]

class RephraseReq(BaseModel):
    text: str = Field(..., description="Исходный текст вопроса")

class RephraseRes(BaseModel):
    text: str

class ExplainReq(BaseModel):
    text: str = Field(..., description="Текст вопроса")
    correct_answer_context: str = Field(..., description="Правильные ответы или их контекст")

class ExplainRes(BaseModel):
    explanation: str

class CheckComplexityReq(BaseModel):
    text: str = Field(..., description="Текст вопроса")

class CheckComplexityRes(BaseModel):
    complexity: int = Field(..., description="Оценка сложности от 1 до 5")
    reason: str = Field(..., description="Краткое пояснение")


async def _generate_editor_structured(
    ai_client: AiClient,
    *,
    prompt: str,
    schema: dict,
    model: str,
    max_tokens: int = 700,
) -> dict:
    return await ai_client.generate_structured(
        messages=[
            {"role": "system", "content": AI_EDITOR_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        model=model,
        json_schema=schema,
        temperature=0.35,
        max_tokens=max_tokens,
    )

@router.post("/generate-options", response_model=GenerateOptionsRes)
async def generate_options(
    req: GenerateOptionsReq,
    teacher: CurrentUser = Depends(require_teacher)
):
    settings = get_settings()
    if not settings.ai_api_key:
        raise HTTPException(status_code=503, detail="AI не настроен")
    
    ai_client = AiClient(settings)
    
    schema = {
        "type": "object",
        "properties": {
            "options": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "is_correct": {"type": "boolean"}
                    },
                    "required": ["text", "is_correct"],
                    "additionalProperties": False
                }
            }
        },
        "required": ["options"],
        "additionalProperties": False
    }

    prompt = f"Сгенерируй {req.count} вариантов ответа для вопроса: \"{req.text}\"\nТип вопроса: {req.qtype}.\nОбязательно включи хотя бы один правильный ответ. Располагай правильный вариант на случайной позиции."
    try:
        result = await _generate_editor_structured(
            ai_client,
            prompt=prompt,
            schema=schema,
            model=settings.ai_generation_model,
            max_tokens=900,
        )
        import random
        options_list = result.get("options", [])
        random.shuffle(options_list)
        result["options"] = options_list
        return GenerateOptionsRes(**result)
    except Exception as e:
        logger.error(f"Generate options error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка генерации вариантов")

@router.post("/rephrase", response_model=RephraseRes)
async def rephrase_question(
    req: RephraseReq,
    teacher: CurrentUser = Depends(require_teacher)
):
    settings = get_settings()
    if not settings.ai_api_key:
        raise HTTPException(status_code=503, detail="AI не настроен")
    
    ai_client = AiClient(settings)
    
    schema = {
        "type": "object",
        "properties": {
            "text": {"type": "string"}
        },
        "required": ["text"],
        "additionalProperties": False
    }

    prompt = f"Переформулируй следующий вопрос так, чтобы он звучал более понятно, академично и профессионально, но сохранял тот же смысл:\n\n\"{req.text}\""
    try:
        result = await _generate_editor_structured(
            ai_client,
            prompt=prompt,
            schema=schema,
            model=settings.ai_generation_model,
            max_tokens=500,
        )
        return RephraseRes(**result)
    except Exception as e:
        logger.error(f"Rephrase error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка переформулировки")

@router.post("/explain", response_model=ExplainRes)
async def explain_question(
    req: ExplainReq,
    teacher: CurrentUser = Depends(require_teacher)
):
    settings = get_settings()
    if not settings.ai_api_key:
        raise HTTPException(status_code=503, detail="AI не настроен")
    
    ai_client = AiClient(settings)
    
    schema = {
        "type": "object",
        "properties": {
            "explanation": {"type": "string"}
        },
        "required": ["explanation"],
        "additionalProperties": False
    }

    prompt = f"Напиши понятное и лаконичное пояснение правильного ответа для студента.\nВопрос: \"{req.text}\"\nПравильный ответ/контекст: \"{req.correct_answer_context}\"\nОбъясни, почему это правильно."
    try:
        result = await _generate_editor_structured(
            ai_client,
            prompt=prompt,
            schema=schema,
            model=settings.ai_generation_model,
            max_tokens=700,
        )
        return ExplainRes(**result)
    except Exception as e:
        logger.error(f"Explain error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка генерации пояснения")

@router.post("/check-complexity", response_model=CheckComplexityRes)
async def check_complexity(
    req: CheckComplexityReq,
    teacher: CurrentUser = Depends(require_teacher)
):
    settings = get_settings()
    if not settings.ai_api_key:
        raise HTTPException(status_code=503, detail="AI не настроен")
    
    ai_client = AiClient(settings)
    
    schema = {
        "type": "object",
        "properties": {
            "complexity": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5
            },
            "reason": {"type": "string"}
        },
        "required": ["complexity", "reason"],
        "additionalProperties": False
    }

    prompt = f"Оцени сложность следующего вопроса от 1 до 5 (1 - самый простой, 5 - очень сложный). Кратко обоснуй.\n\nВопрос: \"{req.text}\""
    try:
        result = await _generate_editor_structured(
            ai_client,
            prompt=prompt,
            schema=schema,
            model=settings.ai_generation_model,
            max_tokens=500,
        )
        if isinstance(result.get("complexity"), str) and result["complexity"].isdigit():
            result["complexity"] = int(result["complexity"])
        return CheckComplexityRes(**result)
    except Exception as e:
        logger.error(f"Complexity error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка проверки сложности")


class WriteCorrectAnswerReq(BaseModel):
    text: str = Field(..., description="Текст вопроса")
    qtype: str = Field(..., description="Тип вопроса")
    options: Optional[List[str]] = Field(default=None, description="Существующие варианты ответа")

class WriteCorrectAnswerRes(BaseModel):
    correct_answer: str = Field(..., description="Правильный ответ")
    explanation: Optional[str] = Field(None, description="Краткое пояснение")


@router.post("/write-correct-answer", response_model=WriteCorrectAnswerRes)
async def write_correct_answer(
    req: WriteCorrectAnswerReq,
    teacher: CurrentUser = Depends(require_teacher)
):
    settings = get_settings()
    if not settings.ai_api_key:
        raise HTTPException(status_code=503, detail="AI не настроен")

    ai_client = AiClient(settings)

    schema = {
        "type": "object",
        "properties": {
            "correct_answer": {"type": "string"},
            "explanation": {"type": "string"}
        },
        "required": ["correct_answer", "explanation"],
        "additionalProperties": False
    }

    prompt = f"""Для следующего тестового вопроса определи правильный ответ.
Вопрос: "{req.text}"
Тип вопроса: {req.qtype}
{f"Существующие варианты ответа: {', '.join(req.options)}" if req.options else ""}

Верни правильный ответ. Если тип вопроса:
- short или numeric: верни точный краткий текстовый или числовой ответ (например, "42" или "фотосинтез").
- text: верни наиболее точный эталонный текстовый ответ.
- bool: верни "true" или "false".
- single или multi: верни текст правильного варианта (или варианты через запятую).
"""
    try:
        result = await _generate_editor_structured(
            ai_client,
            prompt=prompt,
            schema=schema,
            model=settings.ai_generation_model,
            max_tokens=500,
        )
        return WriteCorrectAnswerRes(**result)
    except Exception as e:
        logger.error(f"Write correct answer error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка генерации правильного ответа")

