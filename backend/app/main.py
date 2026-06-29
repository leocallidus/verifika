from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.api import auth as auth_api
from app.api import admin as admin_api
from app.api import admin_more  # noqa: F401  -- side-effect: register more routes
from app.api import admin_stream  # noqa: F401  -- side-effect: register SSE stream
from app.api import student as student_api
from app.api import teacher as teacher_api
from app.api import teacher_features as teacher_features_api  # TZ tz-teacher-production-ready.md
from app.api.v2 import router as v2_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Верифика",
    description="API для кроссплатформенной системы тестирования студентов Верифика",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResponseTimeMetricsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        # Track HTTP /api calls, but exclude streaming/SSE endpoints to avoid inflating average latency
        if not path.startswith("/api") or path.endswith("/stream") or "/notifications/stream" in path:
            await self.app(scope, receive, send)
            return

        import time
        from app.core.metrics import api_response_times
        start_time = time.perf_counter()

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                duration = time.perf_counter() - start_time
                api_response_times.append(duration)
                if len(api_response_times) > 100:
                    api_response_times.pop(0)
            await send(message)

        await self.app(scope, receive, send_wrapper)


app.add_middleware(ResponseTimeMetricsMiddleware)

logger.remove()
logger.add(lambda msg: print(msg, end=""), level=settings.log_level)
Path("logs").mkdir(exist_ok=True)
logger.add("logs/app.log", rotation="10 MB", retention="14 days", level=settings.log_level)


from fastapi import Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    status_code = exc.status_code
    
    code = None
    message = None
    reason = None
    action_hint = None
    
    if isinstance(detail, dict):
        code = detail.get("code")
        message = detail.get("message")
        reason = detail.get("reason")
        action_hint = detail.get("action_hint")
    else:
        # Infer based on status code and detail string
        message = str(detail)
        
    if not code:
        if status_code == 401:
            code = "UNAUTHORIZED"
            message = message if message != "Not authenticated" else "Необходима авторизация"
            reason = reason or "Неверный или отсутствующий токен авторизации."
            action_hint = action_hint or "Пожалуйста, войдите в систему заново."
        elif status_code == 403:
            code = "FORBIDDEN"
            message = message or "Доступ запрещён"
            reason = reason or "У вашей роли нет прав для доступа к этому ресурсу."
            action_hint = action_hint or "Обратитесь к администратору, если вам необходим доступ."
        elif status_code == 404:
            code = "NOT_FOUND"
            message = message or "Ресурс не найден"
            reason = reason or "Запрошенный объект не существует или был удалён."
            action_hint = action_hint or "Проверьте корректность ссылки или параметров запроса."
        elif status_code == 429:
            code = "TOO_MANY_REQUESTS"
            message = message or "Слишком много запросов"
            reason = reason or "Превышен лимит запросов в единицу времени."
            action_hint = action_hint or "Пожалуйста, подождите некоторое время перед следующей попыткой."
        else:
            code = "BAD_REQUEST" if status_code < 500 else "INTERNAL_ERROR"
            reason = reason or "Ошибка при обработке запроса."
            action_hint = action_hint or "Проверьте параметры запроса."

    return JSONResponse(
        status_code=status_code,
        content={
            "code": code,
            "message": message or "Произошла ошибка",
            "reason": reason or message or "Детали ошибки отсутствуют.",
            "action_hint": action_hint or "Попробуйте повторить действие позже."
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    error_details = []
    for err in errors:
        loc = " -> ".join(str(x) for x in err.get("loc", []))
        msg = err.get("msg", "Неверный формат")
        error_details.append(f"Поле '{loc}': {msg}")
    
    reason = "; ".join(error_details)
    
    return JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "message": "Ошибка валидации данных",
            "reason": reason,
            "action_hint": "Пожалуйста, проверьте корректность заполнения всех полей формы и попробуйте снова."
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_SERVER_ERROR",
            "message": "Внутренняя ошибка сервера",
            "reason": str(exc),
            "action_hint": "Пожалуйста, обновите страницу, попробуйте позже или обратитесь в поддержку."
        }
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=404,
        content={
            "code": "NOT_FOUND",
            "message": "Ресурс не найден",
            "reason": "Запрошенный путь или страница не существуют на сервере.",
            "action_hint": "Проверьте правильность ввода адреса (URL) запроса."
        }
    )


@app.exception_handler(405)
async def method_not_allowed_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=405,
        content={
            "code": "METHOD_NOT_ALLOWED",
            "message": "Метод не поддерживается",
            "reason": "Данный HTTP метод не разрешен для запрошенного пути.",
            "action_hint": "Проверьте используемый HTTP метод (GET, POST, PUT, DELETE)."
        }
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_api.router)
app.include_router(student_api.router)
app.include_router(teacher_api.router)
app.include_router(teacher_features_api.router)
app.include_router(admin_api.router)
app.include_router(v2_router)
# reload

