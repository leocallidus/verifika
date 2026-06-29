import json
import httpx
from typing import AsyncGenerator
from httpx_sse import aconnect_sse
from loguru import logger

class AiClient:
    """Клиент для запросов к Polza.ai (OpenAI-совместимый API)."""

    def __init__(self, settings):
        self.base_url = settings.ai_base_url      # https://polza.ai/api/v1
        self.api_key  = settings.ai_api_key
        self.timeout  = settings.ai_request_timeout

    async def chat_stream(
        self,
        messages: list[dict],
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> AsyncGenerator[dict, None]:
        """
        Потоковый запрос. Yields SSE-строки в формате dict:
        {"type": "delta", "content": "..."} или {"type": "done", ...}
        """
        headers = {
            "Authorization": f"Bearer {self.api_key or 'mock-key'}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream_options": {"include_usage": True}
        }
        
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        logger.info(f"AI chat_stream request to {url} with model={model}")
        
        done_yielded = False
        total_content = ""
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with aconnect_sse(client, "POST", url, json=payload, headers=headers) as event_source:
                    async for event in event_source.aiter_sse():
                        if event.data == "[DONE]":
                            break
                        try:
                            data = json.loads(event.data)
                            choices = data.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    total_content += content
                                    yield {"type": "delta", "content": content}
                            
                            usage = data.get("usage")
                            if usage:
                                yield {
                                    "type": "done",
                                    "tokens_used": usage.get("total_tokens", 0),
                                    "model": data.get("model", model)
                                }
                                done_yielded = True
                        except Exception as parse_err:
                            logger.debug(f"Non-critical SSE parse error: {parse_err}")
        except Exception as e:
            logger.error(f"AI chat_stream connection/request error: {e}")
            yield {"type": "error", "message": f"Connection/Request error: {str(e)}"}
            return

        if not done_yielded:
            estimated_tokens = max(1, len(total_content) // 4)
            yield {
                "type": "done",
                "tokens_used": estimated_tokens,
                "model": model
            }

    async def generate_structured(
        self,
        messages: list[dict],
        model: str,
        json_schema: dict,
        temperature: float,
        max_tokens: int,
    ) -> dict:
        """Запрос с structured output. Возвращает распарсенный dict."""
        headers = {
            "Authorization": f"Bearer {self.api_key or 'mock-key'}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "plugins": [{"id": "response-healing"}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "questions_batch",
                    "strict": True,
                    "schema": json_schema
                }
            }
        }
        
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        logger.info(f"AI generate_structured request to {url} with model={model}")
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            result = resp.json()
            content = result["choices"][0]["message"]["content"]
            return json.loads(content)

    async def generate_title(self, first_message: str, model: str) -> str:
        """Генерация заголовка чата. Возвращает строку."""
        headers = {
            "Authorization": f"Bearer {self.api_key or 'mock-key'}",
            "Content-Type": "application/json",
        }
        system_prompt = "Ты — полезный ассистент. Придумай краткое название на русском языке (3-6 слов) для чата, начатого с сообщения пользователя. Ответь только названием без кавычек и лишних слов."
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Сообщение пользователя: {first_message}"}
            ],
            "temperature": 0.5,
            "max_tokens": 60,
        }
        
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        logger.info(f"AI generate_title request to {url} with model={model}")
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                result = resp.json()
                title = result["choices"][0]["message"]["content"].strip().strip('"').strip("'")
                return title
        except Exception as e:
            logger.error(f"Error generating chat title: {e}")
            fallback = first_message[:40] + "..." if len(first_message) > 40 else first_message
            return fallback
