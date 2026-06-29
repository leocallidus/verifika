# Верифика

Кроссплатформенная система тестирования студентов с детальной аналитикой для преподавателей. Работает как веб-приложение и как нативное desktop-приложение (Windows, macOS, Linux) на базе Tauri 2.

---

## Содержание

- [Обзор системы](#обзор-системы)
- [Стек технологий](#стек-технологий)
- [Структура репозитория](#структура-репозитория)
- [Требования](#требования)
- [Быстрый старт](#быстрый-старт)
- [Настройка backend](#настройка-backend)
- [Настройка frontend](#настройка-frontend)
- [Desktop-приложение (Tauri)](#desktop-приложение-tauri)
- [Переменные окружения](#переменные-окружения)
- [Управление схемой базы данных](#управление-схемой-базы-данных)
- [Тестирование](#тестирование)
- [Очистка артефактов](#очистка-артефактов)
- [Система оценивания](#система-оценивания)
- [Роли и права доступа](#роли-и-права-доступа)
- [Демо-данные и учётные записи](#демо-данные-и-учётные-записи)
- [API](#api)
- [Производственное развёртывание](#производственное-развёртывание)

---

## Обзор системы

Верифика предоставляет преподавателям полный цикл управления тестированием:

- Создание банка вопросов с поддержкой типов: одиночный выбор, множественный выбор, текстовый ввод, загрузка файлов.
- Настройка тестов по дисциплинам и темам с индивидуальными политиками (лимиты попыток, таймеры, перемешивание вопросов, шкала оценок).
- Проведение тестов со встроенным прокторингом (запись нарушений, блокировка перехода, контроль вкладок).
- Ручная проверка файловых ответов с комментариями к каждому вопросу.
- Аналитика: журнал успеваемости группы, тематическая аналитика, динамика результатов, сложные вопросы.
- Экспорт данных в Excel, CSV и PDF с поддержкой выбора шкалы оценивания.
- AI-ассистент для генерации вопросов и помощи студентам (опционально, через внешний OpenAI-совместимый API).
- Уведомления в реальном времени через SSE (Server-Sent Events).
- Профиль для всех ролей: аватары с историей, смена пароля и управление активными сеансами входа.
- Административное брендирование: название приложения, логотип верхнего бара, логотип учреждения и баннер экрана входа.

---

## Стек технологий

### Backend

| Компонент | Технология |
|---|---|
| Веб-фреймворк | FastAPI 0.111+ |
| ORM | SQLAlchemy 2.0 (async) |
| СУБД | PostgreSQL 15+ |
| Драйвер БД | asyncpg |
| Миграции | Alembic |
| Валидация | Pydantic 2 |
| Аутентификация | JWT (python-jose) + bcrypt |
| PDF-генерация | WeasyPrint |
| Excel-генерация | openpyxl |
| Рантайм | Python 3.11+ |
| Пакетный менеджер | uv |
| ASGI-сервер | Uvicorn |

### Frontend

| Компонент | Технология |
|---|---|
| UI-фреймворк | React 18 |
| Сборщик | Vite 5 |
| Язык | TypeScript 5 |
| Стилизация | Tailwind CSS 4 |
| Роутинг | React Router 6 |
| Запросы | Axios + TanStack Query 5 |
| Графики | Recharts |
| Анимации | Motion |
| Пакетный менеджер | Bun |

### Desktop

| Компонент | Технология |
|---|---|
| Desktop-обёртка | Tauri 2 |
| Язык Rust | Rust 1.77+ |
| Хранилище токенов | tauri-plugin-stronghold (OS Keychain) |
| OS-уведомления | tauri-plugin-notification |
| Автообновление | tauri-plugin-updater |

---

## Структура репозитория

```
verifika/
├── backend/                    # FastAPI-приложение
│   ├── app/
│   │   ├── api/                # Маршруты и обработчики
│   │   │   ├── auth.py         # Аутентификация и сброс пароля
│   │   │   ├── admin.py        # Административные операции
│   │   │   ├── student.py      # Студенческие эндпоинты
│   │   │   ├── teacher.py      # Преподавательские эндпоинты
│   │   │   └── v2/             # API v2 (модульная структура)
│   │   │       ├── analytics.py
│   │   │       ├── ai_assistant.py
│   │   │       ├── grading.py
│   │   │       ├── questions.py
│   │   │       ├── reference.py
│   │   │       ├── reports.py
│   │   │       └── topics.py
│   │   ├── core/               # Конфигурация, JWT, метрики
│   │   ├── db/                 # SQLAlchemy-модели и сессия
│   │   ├── notifications/      # SSE-шина событий
│   │   ├── schemas/            # Pydantic-схемы
│   │   └── services/           # Бизнес-логика
│   │       ├── grade_calculator.py
│   │       ├── grading_v2.py
│   │       ├── scoring.py
│   │       └── versioning.py
│   ├── alembic/                # Миграции базы данных
│   ├── scripts/
│   │   └── seed.py             # Инициализация и демо-данные
│   ├── tests/                  # Unit-тесты backend
│   ├── .env.example            # Пример переменных окружения
│   └── pyproject.toml
├── frontend/                   # React + Vite + Tauri
│   ├── src/
│   │   ├── api/                # HTTP-клиент и хуки запросов
│   │   ├── components/         # Переиспользуемые UI-компоненты
│   │   ├── pages/
│   │   │   ├── admin/          # Страницы администратора
│   │   │   ├── teacher/        # Страницы преподавателя
│   │   │   └── student/        # Страницы студента
│   │   ├── utils/
│   │   │   └── grade.ts        # Конвертация шкал оценивания
│   │   └── lib/                # Tauri-адаптеры, хранилище токенов
│   ├── src-tauri/              # Rust-код desktop-обёртки
│   └── e2e/                    # E2E-тесты (Playwright)
└── tests/
    └── backend/                # Интеграционные тесты
```

---

## Требования

### Общие

- PostgreSQL 15 или выше
- Node.js 20+ или Bun 1.1+
- Python 3.11 или выше
- uv (пакетный менеджер Python): `curl -LsSf https://astral.sh/uv/install.sh | sh`

### Для desktop-режима (Tauri) дополнительно

- Rust toolchain 1.77+: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Linux**: `libwebkit2gtk-4.1`, `libgtk-3-dev`, `libayatana-appindicator3-dev`
- **Windows**: Visual Studio Build Tools 2022 или VS 2022 с компонентом C++
- **macOS**: Xcode Command Line Tools

Установка системных зависимостей для Linux (Ubuntu/Debian):

```bash
sudo apt update && sudo apt install -y \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf
```

---

## Быстрый старт

### 1. Клонирование репозитория

```bash
git clone <url>
cd verifika
```

### 2. Создание базы данных

```sql
-- Выполните в psql от имени суперпользователя
CREATE DATABASE verifika;
CREATE USER postgres WITH ENCRYPTED PASSWORD '12345678';
GRANT ALL PRIVILEGES ON DATABASE verifika TO postgres;
```

### 3. Настройка backend

```bash
cd backend

# Копирование конфигурации
cp .env.example .env
# Отредактируйте .env по необходимости

# Установка зависимостей
uv sync

# Применение миграций
uv run alembic upgrade head

# Инициализация данных (теги, первый администратор)
uv run python -m scripts.seed

# Запуск сервера разработки
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Настройка frontend

```bash
cd frontend

# Копирование конфигурации (если нужен нестандартный прокси)
cp .env.example .env

# Установка зависимостей
bun install

# Запуск сервера разработки
bun run dev
```

Приложение будет доступно по адресу: `http://localhost:5173`

Swagger UI (документация API): `http://localhost:8000/docs`

---

## Настройка backend

### Переменные окружения

Скопируйте `.env.example` в `.env` и заполните значения:

```bash
cp backend/.env.example backend/.env
```

Обязательные параметры:

| Переменная | Описание | Пример |
|---|---|---|
| `DATABASE_URL` | DSN подключения к PostgreSQL | `postgresql+asyncpg://postgres:pass@localhost:5432/verifika` |
| `JWT_SECRET` | Секрет для подписи токенов (минимум 32 символа) | Случайная строка |
| `JWT_EXPIRE_MINUTES` | Время жизни JWT в минутах | `480` |
| `CORS_ORIGINS` | Разрешённые origins для CORS (через запятую) | `http://localhost:5173` |

### Запуск в production

```bash
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Рекомендуется разместить Uvicorn за обратным прокси (Nginx или Caddy).

---

## Настройка frontend

### Переменные окружения

Файл `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
VITE_API_PROXY=http://127.0.0.1:8000
```

`VITE_API_URL` — главный адрес backend API, который встраивается в собранный frontend. Его нужно указывать и для обычного web-сайта, и для Tauri-сборки.

`VITE_API_PROXY` используется только в dev-режиме Vite для проксирования `/api` на локальный backend. В production он не влияет на уже собранные файлы.

Типовые значения:

```env
# Dev, backend запущен локально на 8000
VITE_API_URL=http://localhost:8000
VITE_API_PROXY=http://127.0.0.1:8000

# Production web, frontend и backend доступны на одном домене через Nginx
VITE_API_URL=https://verifika.example.com

# Production Tauri, desktop-клиент ходит к публичному backend
VITE_API_URL=https://verifika.example.com
```

Если web-frontend размещён на том же домене, что и backend-прокси, оставьте `VITE_API_URL` равным публичному домену приложения. Если backend расположен отдельно, укажите отдельный URL backend, например `https://api.verifika.example.com`, и добавьте origin frontend/Tauri в `CORS_ORIGINS` backend.

### Production-сборка

```bash
cd frontend
bun run build
```

Статические файлы появятся в директории `frontend/dist`. Разместите их на любом статическом хостинге (Nginx, Caddy, Vercel, и т.д.) и настройте проксирование `/api` запросов на backend.

Пример конфигурации Nginx:

```nginx
server {
    listen 80;
    server_name verifika.example.com;

    root /var/www/verifika/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/v2/teacher/analytics/topics {
        # SSE-эндпоинт: отключаем буферизацию
        proxy_pass http://127.0.0.1:8000;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
    }
}
```

---

## Desktop-приложение (Tauri)

Таuri оборачивает фронтенд в нативное приложение с интеграцией с операционной системой.

### Разработка

```bash
cd frontend

# Запуск в режиме разработки (запускает и Vite, и Rust-обёртку)
bun run tauri:dev
```

### Production-сборка

```bash
cd frontend
bun run tauri:build
```

Перед production-сборкой Tauri укажите публичный backend в `frontend/.env`, потому что desktop-клиент не использует Vite dev proxy:

```env
VITE_API_URL=https://verifika.example.com
```

Linux-сборка по умолчанию выпускает `.deb` и `.rpm`; файлы появятся в `src-tauri/target/release/bundle/`.

### Возможности desktop-режима

| Возможность | Описание |
|---|---|
| Безопасное хранение токенов | JWT хранится в OS Keychain (Windows CredStore, macOS Keychain, Linux Secret Service) через `tauri-plugin-stronghold` |
| OS-уведомления | Нативные уведомления (Windows Toast, dbus, NSNotification) при новых оценках и дедлайнах |
| Системный трей | Иконка в трее с числовым бейджем непрочитанных уведомлений, меню «Открыть / Уведомления / Выйти» |
| Автозапуск | Регистрация в автозагрузке ОС (`.desktop`, LaunchAgent, Startup) |
| Блокировка сна | Предотвращение перехода ОС в спящий режим во время теста |
| Deep-link | Обработка ссылок вида `verifika://` |
| Автообновление | Обновление через GitHub Releases |
| Запоминание окна | Сохранение позиции и размера окна между сессиями |
| Загрузка файлов | Сохранение Excel/PDF/CSV в папку загрузок пользователя |

### Ключевые файлы desktop-режима

| Файл | Назначение |
|---|---|
| `src-tauri/src/lib.rs` | Rust: регистрация плагинов, команды, tray, single-instance |
| `src-tauri/tauri.conf.json` | Конфигурация приложения, bundling, security |
| `src-tauri/capabilities/` | Least-privileged scopes для API Tauri |
| `frontend/src/lib/tauri.ts` | Типизированный адаптер над `window.__TAURI__` с web-fallback |
| `frontend/src/lib/secure-token.ts` | Stronghold-обёртка JWT (с fallback на localStorage) |
| `frontend/src/lib/use-sleep-blocker.ts` | Хук блокировки сна для TestRunner |
| `frontend/src/lib/use-tray-count.ts` | Синхронизация бейджа трея с SSE-счётчиком |
| `frontend/src/api/downloads.ts` | `downloadBlob` — запись в `$DOWNLOADS` через Tauri FS |

---

## Переменные окружения

### Backend (`backend/.env`)

#### Основные

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `DATABASE_URL` | Да | — | PostgreSQL DSN (asyncpg) |
| `JWT_SECRET` | Да | — | Секрет JWT (32+ символа) |
| `JWT_ALGORITHM` | Нет | `HS256` | Алгоритм JWT |
| `JWT_EXPIRE_MINUTES` | Нет | `480` | Срок жизни токена (минуты) |
| `CORS_ORIGINS` | Нет | `*` | Разрешённые origins CORS |
| `LOG_LEVEL` | Нет | `INFO` | Уровень логирования (DEBUG/INFO/WARNING/ERROR) |
| `BCRYPT_ROUNDS` | Нет | `12` | Сложность хэширования паролей |

#### Email (опционально)

| Переменная | Описание |
|---|---|
| `SMTP_HOST` | Хост SMTP-сервера |
| `SMTP_PORT` | Порт SMTP (обычно 587) |
| `SMTP_USER` | Логин SMTP |
| `SMTP_PASS` | Пароль SMTP |
| `RESET_LINK_TTL` | Время жизни ссылки сброса пароля (секунды, по умолчанию `1800`) |
| `PUBLIC_BASE_URL` | Публичный URL приложения для ссылок в письмах |

#### AI-модуль (опционально)

Модуль отключён по умолчанию (`AI_ENABLED=false`). Для активации необходим ключ к OpenAI-совместимому API.

| Переменная | По умолчанию | Описание |
|---|---|---|
| `AI_ENABLED` | `false` | Включить AI-функции |
| `AI_API_KEY` | — | API-ключ (например, Polza.ai или OpenAI) |
| `AI_BASE_URL` | `https://polza.ai/api/v1` | Базовый URL API |
| `AI_STUDENT_ENABLED` | `true` | Разрешить AI студентам |
| `AI_CHAT_MODEL` | `anthropic/claude-sonnet-4-5-20250929` | Модель для чата |
| `AI_GENERATION_MODEL` | `openai/gpt-4o` | Модель для генерации вопросов |
| `AI_CHAT_TEMPERATURE` | `0.7` | Температура генерации чата |
| `AI_CHAT_MAX_TOKENS` | `4096` | Максимум токенов в ответе чата |
| `AI_CONTEXT_WINDOW` | `20` | Глубина контекста диалога (сообщений) |
| `AI_GEN_TEMPERATURE` | `0.3` | Температура генерации вопросов |
| `AI_GEN_MAX_TOKENS` | `8192` | Максимум токенов при генерации |
| `AI_MAX_QUESTIONS_PER_REQUEST` | `50` | Лимит вопросов на один запрос |
| `AI_DAILY_TOKEN_LIMIT_STUDENT` | `0` | Дневной лимит токенов для студента (0 = без лимита) |
| `AI_DAILY_MESSAGE_LIMIT_STUDENT` | `50` | Дневной лимит сообщений для студента |
| `AI_REQUEST_TIMEOUT` | `60` | Таймаут запроса к AI (секунды) |
| `AI_SYSTEM_PROMPT` | Встроенный | Системный промпт AI-ассистента |
| `AI_GENERATION_MODELS_ALLOWED` | `openai/gpt-4o,...` | Модели для выбора в UI (CSV) |
| `AI_GEN_MATERIAL_MAX_CHARS` | `12000` | Максимум символов материала для генерации |

### Frontend (`frontend/.env`)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Адрес backend API, встраивается в web/Tauri production-сборку |
| `VITE_API_PROXY` | `http://127.0.0.1:8000` | URL backend для прокси Vite, только dev-режим |

---

## Управление схемой базы данных

Схема базы данных управляется через **Alembic**. Все миграции хранятся в `backend/alembic/versions/`.

### Применение миграций

```bash
cd backend

# Обновить до последней версии
uv run alembic upgrade head

# Откатить последнюю миграцию
uv run alembic downgrade -1

# Просмотреть историю
uv run alembic history --verbose
```

### Генерация новой миграции

При изменении моделей в `app/db/models.py`:

```bash
cd backend
uv run alembic revision --autogenerate -m "краткое описание изменений"
uv run alembic upgrade head
```

### Первоначальная настройка существующей БД

Если база данных уже содержит таблицы (без истории Alembic):

```bash
cd backend
uv run alembic stamp head
```

Это пометит текущее состояние как «последняя миграция» без внесения изменений в схему.

---

## Тестирование

### Backend — unit-тесты

```bash
cd backend
uv run pytest
```

### Backend — интеграционные тесты

Интеграционные тесты используют отдельную базу данных с суффиксом `_test`:

```bash
# Автоматически использует DATABASE_URL + суффикс _test
cd backend
uv run pytest ../tests/backend

# Или указать DSN явно
TEST_DATABASE_URL=postgresql+asyncpg://postgres:12345678@localhost:5432/verifika_test \
  uv run pytest ../tests/backend

# Запуск без AI-тестов (не требует ключа API)
uv run pytest ../tests/backend -k "not ai"
```

Защита не позволяет запустить тестовый bootstrap на БД без имени `*_test` или `test_*`.

### Frontend — unit-тесты (Vitest)

```bash
cd frontend
bun run test
```

### Frontend — E2E-тесты (Playwright)

```bash
cd frontend
bun x playwright install  # первый раз
bun x playwright test
```

---

## Очистка артефактов

Скрипт `scripts/clean.sh` удаляет сгенерированные зависимости, сборки и кэши: `node_modules`, `frontend/dist`, `frontend/src-tauri/target`, `.pytest_cache`, `__pycache__`, `*.tsbuildinfo`, отчёты тестов и логи. По умолчанию работает в dry-run режиме.

```bash
# Посмотреть, что будет удалено
./scripts/clean.sh

# Удалить артефакты
./scripts/clean.sh --yes

# Дополнительно удалить Python venv
./scripts/clean.sh --yes --venv
```

Скрипт не удаляет `.env` и `backend/uploads`.

---

## Система оценивания

Верифика поддерживает три шкалы оценивания, которые можно выбрать при настройке теста и при просмотре результатов.

### Доступные шкалы

| Шкала | Обозначение | Описание |
|---|---|---|
| Пятибалльная | `5_point` | Классическая шкала 1–5 (по умолчанию) |
| Десятибалльная | `10_point` | Шкала 1–10 |
| Проценты | `percent` | Числовой процент выполнения |

### Пороги пятибалльной шкалы

| Балл | Оценка | Диапазон процентов |
|---|---|---|
| 5 | Отлично | 90–100% |
| 4 | Хорошо | 70–89% |
| 3 | Удовлетворительно | 50–69% |
| 2 | Неудовлетворительно | 20–49% |
| 1 | Кол | 0–19% |

### Где применяется выбор шкалы

- **Журнал группы** — переключатель шкалы в фильтрах; PDF-экспорт использует выбранную шкалу.
- **Справочник групп** — средний балл в списке и на странице группы.
- **Аналитика тем** — KPI-плитки, график динамики, список групп.
- **Уведомления** — при завершении теста студент получает оценку по шкале теста.

---

## Роли и права доступа

| Роль | Описание |
|---|---|
| Администратор | Управление пользователями, дисциплинами, группами, просмотр аудита |
| Преподаватель | Создание вопросов и тестов, просмотр результатов своих студентов, аналитика, ручная проверка |
| Студент | Прохождение тестов, просмотр своих результатов, AI-ассистент |

Все авторизованные роли имеют профиль с загрузкой аватара, выбором предыдущих аватаров, сменой пароля и списком активных сеансов. В сеансах отображаются устройство, тип клиента, примерное местоположение и последняя активность; лишние входы можно завершать вручную.

### Маршруты приложения

| Путь | Роль | Назначение |
|---|---|---|
| `/admin/*` | Администратор | Управление системой |
| `/admin/profile` | Администратор | Профиль, аватары и собственные сеансы администратора |
| `/admin/branding` | Администратор | Брендирование приложения и экрана входа |
| `/teacher/*` | Преподаватель | Рабочее пространство преподавателя |
| `/teacher/profile` | Преподаватель | Профиль, аватары и собственные сеансы преподавателя |
| `/student/*` | Студент | Личный кабинет студента |
| `/student/profile` | Студент | Профиль, аватары и собственные сеансы студента |
| `/auth/*` | Все | Вход, сброс пароля |
| `/settings/*` | Авторизованные | Настройки desktop-приложения |

---

## Демо-данные и учётные записи

### Инициализация демо-данных

```bash
cd backend

# Только служебные данные (теги, администратор)
uv run python -m scripts.seed

# Полные демо-данные (студенты, преподаватели, дисциплины, вопросы, сессии)
SEED_DEMO=1 uv run python -m scripts.seed
```

### Учётные записи после seed

| Роль | Email / Логин | Пароль |
|---|---|---|
| Администратор | `admin@example.test` / `admin` | Задаётся через `ADMIN_BOOTSTRAP_PASSWORD` или генерируется при seed |
| Преподаватель | `sidorov@univ.ru` / `sidorov` | `Passw0rd!Test` |
| Студент | `ivanov@univ.ru` / `ivanov` | `Passw0rd!Test` |
| Студент | `petrova@univ.ru` / `petrova` | `Passw0rd!Test` |

Пароль администратора при первом запуске seed выводится в консоль. Для задания собственного пароля:

```bash
ADMIN_BOOTSTRAP_PASSWORD=MySecurePassword123 uv run python -m scripts.seed
```

---

## API

Полная интерактивная документация API доступна в Swagger UI:

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
- **OpenAPI JSON**: `http://localhost:8000/openapi.json`

### Структура API

| Префикс | Описание |
|---|---|
| `/api/auth/*` | Аутентификация, сброс пароля |
| `/api/admin/*` | Административные операции |
| `/api/teacher/*` | Преподавательские операции |
| `/api/student/*` | Студенческие операции |
| `/api/v2/teacher/*` | API v2: справочники, аналитика, отчёты, вопросы, AI |
| `/api/v2/student/*` | API v2: студенческие операции |
| `/api/v2/profile-branding/*` | Профили, аватары, сеансы входа и брендирование |

### Аутентификация

Все защищённые эндпоинты требуют JWT в заголовке:

```
Authorization: Bearer <token>
```

Токен получается через `POST /api/auth/login`:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login": "sidorov", "password": "Passw0rd!Test"}'
```

---

## Производственное развёртывание

### Рекомендуемая архитектура

```
Internet --> Nginx/Caddy --> [React SPA (статика)]
                         --> [FastAPI (Uvicorn)]
                         --> [PostgreSQL]
```

### Чеклист перед развёртыванием

1. Задайте надёжный `JWT_SECRET` (минимум 32 случайных символа).
2. Настройте `CORS_ORIGINS` с конкретными доменами (не `*`).
3. Установите `BCRYPT_ROUNDS=12` или выше.
4. Настройте SMTP для отправки писем сброса пароля.
5. Задайте `PUBLIC_BASE_URL` — публичный URL приложения.
6. Запустите `alembic upgrade head` перед стартом сервера.
7. Настройте ротацию логов (`logs/` директория).
8. Ограничьте доступ к `8000` порту — только с Nginx.
9. Используйте HTTPS (Let's Encrypt через Certbot или Caddy).

### Запуск с несколькими воркерами

```bash
cd backend
uv run uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 4 \
  --proxy-headers \
  --forwarded-allow-ips="*"
```

> Обратите внимание: SSE-уведомления (`/notifications/stream`) используют in-process шину событий. При масштабировании на несколько процессов уведомления будут доставляться только в пределах одного процесса. Для многопроцессорного развёртывания потребуется заменить шину на Redis Pub/Sub или аналог.

### Systemd-сервис (Linux)

Пример файла `/etc/systemd/system/verifika-backend.service`:

```ini
[Unit]
Description=Verifika Backend
After=network.target postgresql.service

[Service]
Type=exec
WorkingDirectory=/opt/verifika/backend
EnvironmentFile=/opt/verifika/backend/.env
ExecStart=/opt/verifika/backend/.venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 --port 8000 --workers 4
Restart=always
RestartSec=5
User=verifika
Group=verifika

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now verifika-backend
```
