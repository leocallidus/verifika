# Развёртывание Верифика на Ubuntu Server 24.04

Данное руководство описывает полный процесс производственного развёртывания платформы Верифика: веб-приложения на сервере и desktop-клиента (Tauri) на машинах конечных пользователей.

---

## Содержание

- [Архитектура развёртывания](#архитектура-развёртывания)
- [Подготовка сервера](#подготовка-сервера)
- [PostgreSQL](#postgresql)
- [Backend (FastAPI)](#backend-fastapi)
- [Frontend (React SPA)](#frontend-react-spa)
- [Nginx — обратный прокси](#nginx--обратный-прокси)
- [HTTPS (Let's Encrypt)](#https-lets-encrypt)
- [Systemd-сервисы](#systemd-сервисы)
- [Первичная инициализация данных](#первичная-инициализация-данных)
- [Обновление приложения](#обновление-приложения)
- [Сборка и публикация Tauri Release](#сборка-и-публикация-tauri-release)
- [Установка Tauri-клиента на Linux](#установка-tauri-клиента-на-linux)
- [Автообновление Tauri (tauri-plugin-updater)](#автообновление-tauri-tauri-plugin-updater)
- [Мониторинг и логи](#мониторинг-и-логи)
- [Резервное копирование](#резервное-копирование)
- [Чеклист безопасности](#чеклист-безопасности)

---

## Архитектура развёртывания

```
                    Internet
                       |
                  [ Nginx + TLS ]
                  /            \
        React SPA             FastAPI (Uvicorn)
       (статика)                    |
                              PostgreSQL 15
```

Все компоненты размещаются на одном сервере Ubuntu 24.04. При необходимости масштабирования FastAPI и PostgreSQL выносятся на отдельные хосты.

Минимальные требования к серверу:

| Параметр | Минимум | Рекомендуется |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 4 GB |
| Диск | 20 GB SSD | 40 GB SSD |
| ОС | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |

---

## Подготовка сервера

### Обновление системы и базовые инструменты

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
    curl wget git unzip \
    build-essential \
    software-properties-common \
    ca-certificates \
    gnupg \
    lsb-release \
    fail2ban \
    ufw
```

### Создание системного пользователя

Все компоненты Верифика запускаются от имени отдельного непривилегированного пользователя:

```bash
sudo useradd --system --shell /bin/bash --create-home --home-dir /opt/verifika verifika
```

### Настройка файрвола

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## PostgreSQL

### Установка PostgreSQL 16

```bash
# Добавление официального репозитория PostgreSQL
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc

echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
    https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list

sudo apt update
sudo apt install -y postgresql-16
```

### Создание базы данных и пользователя

```bash
sudo -u postgres psql <<'EOF'
CREATE USER verifika WITH ENCRYPTED PASSWORD 'ЗАМЕНИТЕ_НА_НАДЁЖНЫЙ_ПАРОЛЬ';
CREATE DATABASE verifika OWNER verifika ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE verifika TO verifika;
EOF
```

> Сохраните пароль — он потребуется в `DATABASE_URL` в `.env` backend.

### Настройка подключений

По умолчанию PostgreSQL принимает соединения только с localhost. Убедитесь, что в `/etc/postgresql/16/main/pg_hba.conf` присутствует строка:

```
host    verifika    verifika    127.0.0.1/32    scram-sha-256
```

```bash
sudo systemctl enable --now postgresql
sudo systemctl status postgresql
```

---

## Backend (FastAPI)

### Установка Python 3.12 и uv

Ubuntu 24.04 поставляется с Python 3.12. Установка uv:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sudo -H -u verifika bash
echo 'export PATH="$HOME/.local/bin:$PATH"' | sudo tee -a /opt/verifika/.bashrc
```

### Развёртывание кода

```bash
# Клонирование репозитория
sudo -u verifika git clone <url-репозитория> /opt/verifika/app

# или через tmp

# Установка зависимостей Python
sudo -u verifika bash -c 'cd /opt/verifika/app/backend && ~/.local/bin/uv sync --no-dev'
```

### Конфигурация окружения

```bash
sudo -u verifika cp /opt/verifika/app/backend/.env.example /opt/verifika/app/backend/.env
sudo -u verifika nano /opt/verifika/app/backend/.env
```

Минимально необходимые значения для `.env`:

```env
DATABASE_URL=postgresql+asyncpg://verifika:ПАРОЛЬ_БД@127.0.0.1:5432/verifika
JWT_SECRET=<случайная_строка_минимум_64_символа>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480
CORS_ORIGINS=https://verifika.example.com,tauri://localhost,http://tauri.localhost
LOG_LEVEL=INFO
BCRYPT_ROUNDS=12
PUBLIC_BASE_URL=https://verifika.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=ПАРОЛЬ_SMTP
AI_ENABLED=false
```

Генерация надёжного `JWT_SECRET`:

```bash
openssl rand -base64 64 | tr -d '\n'
```

Ограничение прав доступа к файлу конфигурации:

```bash
sudo chmod 600 /opt/verifika/app/backend/.env
sudo chown verifika:verifika /opt/verifika/app/backend/.env
```

### Применение миграций

```bash
sudo -u verifika bash -c '
    cd /opt/verifika/app/backend
    ~/.local/bin/uv run alembic upgrade head
'
```

---

## Frontend (React SPA)

### Установка Bun

```bash
curl -fsSL https://bun.sh/install | sudo -H -u verifika bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' | sudo tee -a /opt/verifika/.bashrc
```

### Сборка frontend

Перед сборкой укажите публичный адрес backend API. Это значение встраивается в статические файлы React SPA:

```bash
sudo -u verifika tee /opt/verifika/app/frontend/.env > /dev/null <<'EOF'
VITE_API_URL=https://verifika.example.com
EOF
```

Если backend вынесен на отдельный домен, используйте его URL, например `https://api.verifika.example.com`, и добавьте домен frontend в `CORS_ORIGINS` backend.

```bash
sudo -u verifika bash -c '
    export PATH="$HOME/.bun/bin:$PATH"
    cd /opt/verifika/app/frontend

    # Установка зависимостей
    bun install --frozen-lockfile

    # Production-сборка
    bun run build
'
```

Готовые статические файлы появятся в `/opt/verifika/app/frontend/dist/`.

---

## Nginx — обратный прокси

### Установка

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### Конфигурация виртуального хоста

```bash
sudo nano /etc/nginx/sites-available/verifika
```

Содержимое (замените `verifika.example.com` на ваш домен):

```nginx
server {
    listen 80;
    server_name verifika.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name verifika.example.com;

    # TLS (заполняется Certbot автоматически)
    ssl_certificate     /etc/letsencrypt/live/verifika.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/verifika.example.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Заголовки безопасности
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Ограничение размера загружаемых файлов (ответы студентов)
    client_max_body_size 50M;

    # React SPA — статические файлы
    root /opt/verifika/app/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Долгосрочное кэширование ассетов с хэшами в именах
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Проксирование REST API запросов к FastAPI
    location /api/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    # SSE-эндпоинты: отключить буферизацию, длинный таймаут
    location ~* /api/.*/(stream|notifications/stream) {
        proxy_pass             http://127.0.0.1:8000;
        proxy_http_version     1.1;
        proxy_set_header       Host $host;
        proxy_set_header       X-Real-IP $remote_addr;
        proxy_set_header       X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header       X-Forwarded-Proto $scheme;
        proxy_set_header       Connection '';
        proxy_buffering        off;
        proxy_cache            off;
        proxy_read_timeout     3600s;
        chunked_transfer_encoding on;
    }

    # Swagger UI — ограничить доступ в production
    location /docs {
        allow 192.168.0.0/16;
        allow 10.0.0.0/8;
        allow 127.0.0.1;
        deny all;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    location /openapi.json {
        allow 192.168.0.0/16;
        allow 10.0.0.0/8;
        allow 127.0.0.1;
        deny all;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    # Релизы Tauri
    location /releases/ {
        alias /opt/verifika/releases/;
        autoindex off;

        location = /releases/latest.json {
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma no-cache;
            add_header Expires 0;
        }
    }

    access_log /var/log/nginx/verifika_access.log;
    error_log  /var/log/nginx/verifika_error.log;
}
```

Активация конфигурации:

```bash
sudo ln -s /etc/nginx/sites-available/verifika /etc/nginx/sites-enabled/verifika
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx

# Временно убрать ssl_* директивы из конфига Nginx перед первым получением сертификата
# (или использовать только HTTP-блок), затем:
sudo certbot --nginx -d verifika.example.com \
    --non-interactive \
    --agree-tos \
    --email admin@example.com \
    --redirect

# Проверка автообновления
sudo certbot renew --dry-run
sudo systemctl status certbot.timer
```

После получения сертификата верните полную конфигурацию Nginx (с HTTPS-блоком) и перезагрузите:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Systemd-сервисы

### Сервис backend (Uvicorn)

```bash
sudo nano /etc/systemd/system/verifika-backend.service
```

```ini
[Unit]
Description=Verifika Backend (FastAPI + Uvicorn)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=exec
User=verifika
Group=verifika
WorkingDirectory=/opt/verifika/app/backend
EnvironmentFile=/opt/verifika/app/backend/.env

ExecStart=/opt/verifika/app/backend/.venv/bin/uvicorn \
    app.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 4 \
    --proxy-headers \
    --forwarded-allow-ips="127.0.0.1"

Restart=on-failure
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=5

# Защита файловой системы
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/verifika/app/backend/logs
ReadWritePaths=/opt/verifika/app/backend/uploads
PrivateTmp=true
NoNewPrivileges=true

LimitNOFILE=65536

StandardOutput=journal
StandardError=journal
SyslogIdentifier=verifika-backend

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now verifika-backend
sudo systemctl status verifika-backend
```

### Проверка работы

```bash
# API напрямую (минуя Nginx)
curl -s http://127.0.0.1:8000/openapi.json | python3 -m json.tool | head -10

# Через Nginx с TLS
curl -s https://verifika.example.com/api/v2/structure | python3 -m json.tool
```

---

## Первичная инициализация данных

После первого запуска сервисов выполните инициализацию:

```bash
# Базовые данные (теги, первый администратор)
sudo -u verifika bash -c '
    cd /opt/verifika/app/backend
    ADMIN_BOOTSTRAP_PASSWORD="НадёжныйПарольАдминистратора" \
    ~/.local/bin/uv run python -m scripts.seed
'
```

> Пароль администратора выводится в консоль при выполнении команды. Сохраните его в защищённом месте.

Для загрузки демонстрационных данных (студенты, преподаватели, вопросы):

```bash
sudo -u verifika bash -c '
    cd /opt/verifika/app/backend
    SEED_DEMO=1 ~/.local/bin/uv run python -m scripts.seed
'
```

---

## Обновление приложения

### Процедура обновления

```bash
# 1. Получить новый код
sudo -u verifika bash -c 'cd /opt/verifika/app && git pull'

# 2. Обновить зависимости backend
sudo -u verifika bash -c '
    cd /opt/verifika/app/backend
    ~/.local/bin/uv sync --no-dev
'

# 3. Применить новые миграции БД
sudo -u verifika bash -c '
    cd /opt/verifika/app/backend
    ~/.local/bin/uv run alembic upgrade head
'

# 4. Пересобрать frontend
sudo -u verifika bash -c '
    export PATH="$HOME/.bun/bin:$PATH"
    cd /opt/verifika/app/frontend
    bun install --frozen-lockfile
    bun run build
'

# 5. Перезапустить backend
sudo systemctl restart verifika-backend

# 6. Перезагрузить Nginx (новые ассеты будут получены браузерами автоматически по хэшам)
sudo nginx -t && sudo systemctl reload nginx

# 7. Проверить статус
sudo systemctl status verifika-backend
```

### Откат

```bash
# Просмотреть историю коммитов
sudo -u verifika bash -c 'cd /opt/verifika/app && git log --oneline -10'

# Вернуться к конкретному коммиту
sudo -u verifika bash -c 'cd /opt/verifika/app && git checkout <хэш_коммита>'

# Откатить одну миграцию БД (при необходимости)
sudo -u verifika bash -c '
    cd /opt/verifika/app/backend
    ~/.local/bin/uv run alembic downgrade -1
'
```

---

## Сборка и публикация Tauri Release

Tauri-клиент собирается на машине разработчика или в CI/CD. Собранные пакеты размещаются на сервере для скачивания пользователями.

### Требования к машине сборки (Linux/Ubuntu)

```bash
# Системные зависимости Tauri 2
sudo apt install -y \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    libssl-dev \
    libdbus-1-dev \
    libglib2.0-dev \
    pkg-config

# Rust toolchain (минимум 1.77)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
rustup update stable

# Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### Установка зависимостей и сборка

```bash
cd /путь/к/репозиторию/frontend

# Установка зависимостей
bun install --frozen-lockfile

# Backend для desktop-клиента. Значение встраивается в Tauri frontend.
cat > .env <<'EOF'
VITE_API_URL=https://verifika.example.com
EOF

# Production-сборка Linux-пакетов
bun run tauri:build
```

Выходные файлы появятся в `frontend/src-tauri/target/release/bundle/`:

```
bundle/
├── deb/
│   └── Verifika_0.1.0_amd64.deb
└── rpm/
    └── Verifika-0.1.0-1.x86_64.rpm
```

Внутреннее имя пакета для `.deb` и `.rpm` — `verifika`, оно должно быть латиницей. Видимое название окна приложения остаётся «Верифика».

### Подпись релиза (обязательно для автообновления)

#### Генерация ключевой пары (один раз)

```bash
bun x tauri signer generate -w ~/.tauri/verifika.key
```

Команда выведет:

```
Your private key has been saved to ~/.tauri/verifika.key
Your public key: dW50cnVzdGVkIGNvbW1lbnQ6...
```

> Приватный ключ `~/.tauri/verifika.key` храните в секрете. Никогда не коммитьте его в репозиторий.
> Публичный ключ вставляется в `tauri.conf.json` и не является секретом.

#### Настройка tauri.conf.json

Откройте `frontend/src-tauri/tauri.conf.json` и заполните секцию `plugins.updater`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "ВСТАВЬТЕ_ПУБЛИЧНЫЙ_КЛЮЧ_СЮДА",
      "endpoints": [
        "https://verifika.example.com/releases/latest.json"
      ]
    }
  }
}
```

#### Сборка подписанного релиза

```bash
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/verifika.key) \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
VITE_API_URL=https://verifika.example.com \
bun run tauri:build
```

После сборки рядом с каждым пакетом появится файл `.sig` с цифровой подписью.

### Директория релизов на сервере

```bash
sudo mkdir -p /opt/verifika/releases
sudo chown verifika:verifika /opt/verifika/releases
```

### Загрузка пакетов на сервер

```bash
# С машины сборки
RELEASE_DIR="frontend/src-tauri/target/release/bundle"
SERVER="user@verifika.example.com"
REMOTE="/opt/verifika/releases/"

scp "$RELEASE_DIR/deb/Verifika_0.1.0_amd64.deb"            $SERVER:$REMOTE
scp "$RELEASE_DIR/rpm/Verifika-0.1.0-1.x86_64.rpm"         $SERVER:$REMOTE
```

### Манифест автообновления latest.json

Создайте `/opt/verifika/releases/latest.json` на сервере:

```bash
sudo -u verifika nano /opt/verifika/releases/latest.json
```

```json
{
  "version": "0.1.0",
  "notes": "Описание изменений в этой версии",
  "pub_date": "2024-06-28T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<содержимое .nsis.zip.sig>",
      "url": "https://verifika.example.com/releases/verifika_0.1.0_x64-setup.exe"
    },
    "darwin-x86_64": {
      "signature": "<содержимое .dmg.sig>",
      "url": "https://verifika.example.com/releases/verifika_0.1.0_x64.dmg"
    },
    "darwin-aarch64": {
      "signature": "<содержимое .dmg.sig для arm64>",
      "url": "https://verifika.example.com/releases/verifika_0.1.0_aarch64.dmg"
    }
  }
}
```

Текущая Linux-сборка выпускает `.deb` и `.rpm`. Для автообновления Linux через `tauri-plugin-updater` обычно нужен отдельный updater-артефакт, например AppImage/архив, поэтому добавляйте `linux-x86_64` в `latest.json` только после настройки соответствующего Linux updater target.

---

## Установка Tauri-клиента на Linux

### Способ 1: .deb пакет (Ubuntu / Debian)

```bash
# Скачать пакет
wget https://verifika.example.com/releases/Verifika_0.1.0_amd64.deb

# Установить
sudo apt install ./Verifika_0.1.0_amd64.deb

# Если есть неудовлетворённые зависимости
sudo apt install -f
```

После установки приложение появится в меню «Образование» под именем «Верифика».

### Способ 2: .rpm пакет (Fedora / RHEL / openSUSE)

```bash
# Скачать пакет
wget https://verifika.example.com/releases/Verifika-0.1.0-1.x86_64.rpm

# Fedora / RHEL
sudo dnf install ./Verifika-0.1.0-1.x86_64.rpm

# openSUSE
sudo zypper install ./Verifika-0.1.0-1.x86_64.rpm
```

### Системные зависимости на машине пользователя

```bash
sudo apt install -y \
    libwebkit2gtk-4.1-0 \
    libgtk-3-0 \
    libayatana-appindicator3-1 \
    libssl3 \
    libdbus-1-3
```

При установке через `.deb` эти зависимости устанавливаются автоматически.

### Настройка Secret Service (Stronghold)

`tauri-plugin-stronghold` использует Linux Secret Service (D-Bus) для безопасного хранения JWT-токена. Убедитесь, что на машине пользователя запущен один из совместимых провайдеров:

```bash
# GNOME Keyring (рекомендуется для Ubuntu Desktop с GNOME)
sudo apt install -y gnome-keyring libsecret-1-0

# KDE Wallet (для Kubuntu / KDE Plasma)
sudo apt install -y kwalletmanager
```

На машинах без графической среды Stronghold автоматически переключается на зашифрованный файловый хранилище.

---

## Автообновление Tauri (tauri-plugin-updater)

Механизм автообновления встроен в приложение. При запуске Верифика обращается к эндпоинту `https://verifika.example.com/releases/latest.json`, сравнивает версию с текущей и при наличии обновления предлагает его установить.

### Процесс выпуска обновления

1. Обновите версию в двух местах:
   - `frontend/src-tauri/tauri.conf.json` — поле `"version"`
   - `frontend/src-tauri/Cargo.toml` — поле `version`
2. Выполните сборку подписанного релиза.
3. Загрузите новые пакеты и `.sig` файлы на сервер.
4. Обновите `latest.json` — новая версия, новые сигнатуры, актуальные URL.
5. При следующем запуске все клиенты обнаружат обновление автоматически.

---

## Мониторинг и логи

### Backend

```bash
# Журнал systemd в реальном времени
sudo journalctl -u verifika-backend -f

# Последние 200 строк
sudo journalctl -u verifika-backend -n 200 --no-pager

# Файловые логи (Loguru, ротация каждые 10 MB)
tail -f /opt/verifika/app/backend/logs/app.log
```

### Nginx

```bash
sudo tail -f /var/log/nginx/verifika_access.log
sudo tail -f /var/log/nginx/verifika_error.log
```

### Статус всех сервисов

```bash
sudo systemctl status verifika-backend nginx postgresql
```

### Проверка доступности API

```bash
curl -sf https://verifika.example.com/openapi.json > /dev/null && \
    echo "API: OK" || echo "API: FAIL"
```

---

## Резервное копирование

### Резервная копия базы данных

```bash
sudo mkdir -p /opt/verifika/backups
sudo chown verifika:verifika /opt/verifika/backups

# Ручная резервная копия
sudo -u verifika pg_dump -U verifika -h 127.0.0.1 -Fc verifika \
    > /opt/verifika/backups/verifika_$(date +%Y%m%d_%H%M%S).dump
```

Восстановление:

```bash
sudo -u postgres pg_restore -d verifika -Fc /opt/verifika/backups/verifika_TIMESTAMP.dump
```

### Автоматическое резервное копирование (cron)

```bash
sudo -u verifika tee /opt/verifika/backup.sh > /dev/null <<'SCRIPT'
#!/bin/bash
set -euo pipefail
BACKUP_DIR=/opt/verifika/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=30

pg_dump -U verifika -h 127.0.0.1 -Fc verifika \
    > "$BACKUP_DIR/db_$TIMESTAMP.dump"

find "$BACKUP_DIR" -name "db_*.dump" -mtime +$KEEP_DAYS -delete

echo "$(date -Iseconds) backup OK: db_$TIMESTAMP.dump"
SCRIPT

chmod +x /opt/verifika/backup.sh

# Ежедневно в 03:00
(sudo -u verifika crontab -l 2>/dev/null; \
 echo "0 3 * * * /opt/verifika/backup.sh >> /opt/verifika/backups/backup.log 2>&1") \
    | sudo -u verifika crontab -
```

### Резервная копия загруженных файлов

```bash
tar -czf /opt/verifika/backups/uploads_$(date +%Y%m%d).tar.gz \
    /opt/verifika/app/backend/uploads/
```

---

## Чеклист безопасности

Перед переводом в production проверьте каждый пункт:

- [ ] `JWT_SECRET` — случайная строка длиной не менее 64 символов (сгенерирована через `openssl rand`).
- [ ] `CORS_ORIGINS` содержит только конкретные домены, не `*`.
- [ ] Файл `.env` имеет права `600` и владельца `verifika`.
- [ ] PostgreSQL принимает соединения только с `127.0.0.1`, порт `5432` закрыт в UFW.
- [ ] Порт `8000` (Uvicorn) не доступен снаружи сервера.
- [ ] HTTPS включён, HTTP перенаправляется на HTTPS.
- [ ] Заголовки безопасности (`HSTS`, `X-Frame-Options`, `X-Content-Type-Options`) настроены в Nginx.
- [ ] Swagger UI (`/docs`, `/openapi.json`) ограничен по IP или закрыт.
- [ ] `fail2ban` настроен для защиты SSH и Nginx.
- [ ] Автоматическое обновление TLS-сертификата настроено и протестировано (`certbot renew --dry-run`).
- [ ] Резервное копирование базы данных настроено и протестировано восстановление.
- [ ] Пароль администратора изменён после первого входа в систему.
- [ ] Приватный ключ Tauri (`~/.tauri/verifika.key`) не хранится в репозитории.
- [ ] История shell очищена после ввода паролей (`history -c && history -w`).
- [ ] SSH-аутентификация по паролю отключена, используются только ключи.

### Отключение парольной SSH-аутентификации

```bash
sudo nano /etc/ssh/sshd_config
# Убедитесь, что следующие строки присутствуют и раскомментированы:
# PasswordAuthentication no
# PermitRootLogin no
# PubkeyAuthentication yes

sudo systemctl restart sshd
```

### Настройка fail2ban

```bash
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true
port    = http,https

[nginx-limit-req]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/verifika_error.log
maxretry = 10
EOF

sudo systemctl enable --now fail2ban
sudo fail2ban-client status
```
