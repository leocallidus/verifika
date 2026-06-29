"""Idempotent seed script. Run via: python -m scripts.seed"""
from __future__ import annotations

import asyncio
import os
import secrets
import datetime
from datetime import timezone, timedelta
import json
from loguru import logger
import asyncpg
import bcrypt

from app.core.config import get_settings


def _dsn_sync(async_dsn: str) -> str:
    return async_dsn.replace("postgresql+asyncpg://", "postgresql://")


def _hash_password(plain: str) -> str:
    settings = get_settings()
    salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
    return bcrypt.hashpw(plain.encode("utf-8")[:72], salt).decode("utf-8")


async def ensure_teacher_disciplines_seed(conn: asyncpg.Connection) -> None:
    # Inserts teacher_disciplines record if teacher_id=1 and discipline_id=1 exist
    # First check if they exist
    teacher_exists = await conn.fetchval("SELECT 1 FROM teachers WHERE teacher_id = 1")
    discipline_exists = await conn.fetchval("SELECT 1 FROM disciplines WHERE discipline_id = 1")
    
    if teacher_exists and discipline_exists:
        await conn.execute(
            """
            INSERT INTO teacher_disciplines (teacher_id, discipline_id, time_limit_minutes, question_count)
            VALUES (1, 1, 20, 2)
            ON CONFLICT (teacher_id, discipline_id) DO UPDATE
              SET time_limit_minutes = EXCLUDED.time_limit_minutes,
                  question_count = EXCLUDED.question_count
            """
        )
        logger.info("Seed: teacher_disciplines ensured (teacher=1, discipline=1, 20min, 2q)")
    else:
        logger.warning("Seed: teacher=1 or discipline=1 not found, skipping teacher_disciplines seed")


async def ensure_student_discipline_assignments_seed(conn: asyncpg.Connection) -> None:
    table_exists = await conn.fetchval(
        "SELECT to_regclass('public.group_disciplines') IS NOT NULL"
    )
    if not table_exists:
        logger.warning("Seed: group_disciplines not found, skipping discipline assignment seed")
        return

    inserted = await conn.execute(
        """
        INSERT INTO group_disciplines (group_id, discipline_id)
        SELECT DISTINCT s.group_id, td.discipline_id
          FROM students s
          JOIN teacher_disciplines td ON TRUE
          JOIN disciplines d ON d.discipline_id = td.discipline_id
         WHERE s.archived_at IS NULL
           AND d.archived_at IS NULL
        ON CONFLICT DO NOTHING
        """
    )
    logger.info("Seed: student discipline assignments ensured: %s", inserted)


async def ensure_admin_seed(conn: asyncpg.Connection) -> None:
    """Idempotent: bootstrap one admin if none exists."""
    is_demo = os.environ.get("SEED_DEMO", "").lower() in ("1", "true", "yes")
    
    admin = await conn.fetchrow(
        "SELECT admin_id, login, email FROM admins ORDER BY admin_id LIMIT 1"
    )
    if admin is not None:
        if is_demo:
            # Force password to Passw0rd!Admin for demo
            h = _hash_password("Passw0rd!Admin")
            await conn.execute(
                """
                INSERT INTO user_credentials (role, user_id, password_hash, requires_totp)
                VALUES ('admin', $1, $2, FALSE)
                ON CONFLICT (role, user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
                """,
                admin["admin_id"], h
            )
            logger.info("Seed: admin password set to Passw0rd!Admin for demo")
            return

        bootstrap_password = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD")
        if bootstrap_password:
            h = _hash_password(bootstrap_password)
            await conn.execute(
                """
                INSERT INTO user_credentials (role, user_id, password_hash, requires_totp)
                VALUES ('admin', $1, $2, FALSE)
                ON CONFLICT (role, user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
                """,
                admin["admin_id"], h
            )
            logger.info("Seed: admin %s password updated from ADMIN_BOOTSTRAP_PASSWORD", admin["login"])
            return

        cred_exists = await conn.fetchval(
            "SELECT 1 FROM user_credentials WHERE role='admin' AND user_id=$1",
            admin["admin_id"],
        )
        if cred_exists:
            logger.info("Seed: admin %s already has credentials -- skip", admin["login"])
            return
        password = secrets.token_urlsafe(18)
        await conn.execute(
            """
            INSERT INTO user_credentials (role, user_id, password_hash, requires_totp)
            VALUES ('admin', $1, $2, FALSE)
            """,
            admin["admin_id"], _hash_password(password),
        )
        logger.info("Seed: backfilled admin credentials")
        return

    login = os.environ.get("ADMIN_BOOTSTRAP_LOGIN") or "admin"
    email = os.environ.get("ADMIN_BOOTSTRAP_EMAIL") or "admin@example.test"
    password = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD") or ("Passw0rd!Admin" if is_demo else secrets.token_urlsafe(18))

    admin_id = await conn.fetchval(
        """
        INSERT INTO admins (login, email, first_name, last_name, department)
        VALUES ($1, $2, 'System', 'Administrator', 'Operations')
        RETURNING admin_id
        """,
        login, email,
    )
    await conn.execute(
        """
        INSERT INTO user_credentials (role, user_id, password_hash, requires_totp)
        VALUES ('admin', $1, $2, FALSE)
        """,
        admin_id, _hash_password(password),
    )
    logger.info("Seed: bootstrap admin created: login=%s email=%s", login, email)


async def seed_default_tags(conn: asyncpg.Connection) -> None:
    """Добавить базовые теги и пометить существующие вопросы тегом 'legacy'."""
    defaults = ["legacy", "sql", "theory", "practice"]
    for tag in defaults:
        await conn.execute(
            "INSERT INTO question_tags (name) VALUES ($1) ON CONFLICT (name) WHERE archived_at IS NULL DO NOTHING",
            tag,
        )
    legacy_id = await conn.fetchval(
        "SELECT tag_id FROM question_tags WHERE name = 'legacy'"
    )
    if legacy_id:
        await conn.execute(
            """
            INSERT INTO question_tag_map (question_id, tag_id)
            SELECT q.question_id, $1 FROM questions q
             ON CONFLICT DO NOTHING
            """,
            legacy_id,
        )
    logger.info("Seed: default tags ensured: %s", defaults)


async def seed_credentials(conn: asyncpg.Connection) -> None:
    """Idempotent seed for teachers and students credentials."""
    DEFAULT_PASSWORD = "Passw0rd!Test"
    h = _hash_password(DEFAULT_PASSWORD)
    
    teachers = await conn.fetch("SELECT teacher_id, email FROM teachers")
    for t in teachers:
        await conn.execute(
            """
            INSERT INTO user_credentials (role, user_id, password_hash)
            VALUES ('teacher', $1, $2)
            ON CONFLICT (role, user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
            """,
            t["teacher_id"], h
        )
        logger.info("Seeded teacher credential: %s" % t["email"])
            
    students = await conn.fetch("SELECT student_id, email FROM students")
    for s in students:
        await conn.execute(
            """
            INSERT INTO user_credentials (role, user_id, password_hash)
            VALUES ('student', $1, $2)
            ON CONFLICT (role, user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
            """,
            s["student_id"], h
        )
        logger.info("Seeded student credential: %s" % s["email"])


async def seed_demo_data(conn: asyncpg.Connection) -> None:
    """Prepare rich, stable demo dataset for showcasting and UI testing."""
    logger.info("Seed: starting demo data seed...")
    now = datetime.datetime.now(timezone.utc)

    # 1. Ensure Groups
    await conn.execute(
        """
        INSERT INTO groups (group_id, name, admission_year)
        VALUES 
          (1, 'ИВТ-21', 2021),
          (2, 'ПИ-22', 2022),
          (6, 'ИСП-21', 2024)
        ON CONFLICT (group_id) DO UPDATE 
        SET name = EXCLUDED.name, admission_year = EXCLUDED.admission_year;
        """
    )
    logger.info("Seed: Groups ensured (ИВТ-21, ПИ-22, ИСП-21)")

    # 2. Ensure Teacher
    await conn.execute(
        """
        INSERT INTO teachers (teacher_id, login, email, first_name, last_name, department)
        VALUES (1, 'sidorov', 'sidorov@univ.ru', 'Алексей', 'Сидоров', 'Информатика')
        ON CONFLICT (teacher_id) DO UPDATE 
        SET login = EXCLUDED.login, email = EXCLUDED.email, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, department = EXCLUDED.department;
        """
    )
    logger.info("Seed: Teacher sidorov ensured")

    # 3. Ensure Students
    await conn.execute(
        """
        INSERT INTO students (student_id, login, email, first_name, last_name, group_id)
        VALUES 
          (1, 'ivanov', 'ivanov@univ.ru', 'Иван', 'Иванов', 1),
          (2, 'petrova', 'petrova@univ.ru', 'Мария', 'Петрова', 1),
          (3, 'sidorova', 'sidorova@univ.ru', 'Анна', 'Сидорова', 2),
          (4, 'kuznetsov', 'kuznetsov@univ.ru', 'Дмитрий', 'Кузнецов', 6)
        ON CONFLICT (student_id) DO UPDATE 
        SET login = EXCLUDED.login, email = EXCLUDED.email, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, group_id = EXCLUDED.group_id;
        """
    )
    logger.info("Seed: Students ensured (ivanov, petrova, sidorova, kuznetsov)")

    # 4. Ensure Credentials
    DEFAULT_PASSWORD = "Passw0rd!Test"
    h = _hash_password(DEFAULT_PASSWORD)
    for role, uid in [('teacher', 1), ('student', 1), ('student', 2), ('student', 3), ('student', 4)]:
        await conn.execute(
            """
            INSERT INTO user_credentials (role, user_id, password_hash) 
            VALUES ($1, $2, $3)
            ON CONFLICT (role, user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
            """,
            role, uid, h
        )
    logger.info("Seed: Credentials ensured")

    # 5. Ensure Disciplines
    await conn.execute(
        """
        INSERT INTO disciplines (discipline_id, name, description, credits, total_hours, created_by)
        VALUES 
          (1, 'Базы данных', 'Основы реляционных СУБД', 4, 144, 1),
          (9, 'МДК 01.01 Разработка программных модулей', 'Разработка модулей на Java и паттерны проектирования', 5, 180, 1)
        ON CONFLICT (discipline_id) DO UPDATE 
        SET name = EXCLUDED.name, description = EXCLUDED.description, credits = EXCLUDED.credits, total_hours = EXCLUDED.total_hours, created_by = EXCLUDED.created_by;
        """
    )
    logger.info("Seed: Disciplines ensured")

    # 6. Ensure Assignments
    await conn.execute(
        """
        INSERT INTO teacher_disciplines (teacher_id, discipline_id, time_limit_minutes, question_count)
        VALUES 
          (1, 1, 30, 5),
          (1, 9, 45, 5)
        ON CONFLICT (teacher_id, discipline_id) DO UPDATE 
        SET time_limit_minutes = EXCLUDED.time_limit_minutes, question_count = EXCLUDED.question_count;
        """
    )
    await conn.execute(
        """
        INSERT INTO group_disciplines (group_id, discipline_id)
        VALUES 
          (1, 1),
          (1, 9),
          (2, 1),
          (6, 9)
        ON CONFLICT (group_id, discipline_id) DO NOTHING;
        """
    )
    await conn.execute(
        """
        INSERT INTO teacher_groups (teacher_id, group_id)
        VALUES 
          (1, 1),
          (1, 2),
          (1, 6)
        ON CONFLICT (teacher_id, group_id) DO NOTHING;
        """
    )
    logger.info("Seed: Teacher and group assignments ensured")

    # 7. Ensure Topics
    await conn.execute(
        """
        INSERT INTO discipline_topics (topic_id, discipline_id, name, description, sort_order, created_by)
        VALUES 
          (1001, 1, 'Введение в реляционные БД', 'История, реляционная модель, ключи', 10, 1),
          (1002, 1, 'Язык запросов SQL', 'SELECT, JOIN, агрегатные функции, подзапросы', 20, 1),
          (1003, 1, 'Проектирование и нормализация БД', '1NF, 2NF, 3NF, ER-диаграммы', 30, 1),
          (1004, 9, 'Основы ООП на Java', 'Классы, объекты, наследование, полиморфизм', 10, 1),
          (1005, 9, 'Паттерны проектирования', 'Порождающие, структурные и поведенческие паттерны', 20, 1)
        ON CONFLICT (topic_id) DO UPDATE 
        SET discipline_id = EXCLUDED.discipline_id, name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, created_by = EXCLUDED.created_by;
        """
    )
    logger.info("Seed: Topics ensured")

    # 8. Ensure Topic Tests
    await conn.execute(
        """
        INSERT INTO teacher_topic_tests (teacher_id, topic_id, time_limit_minutes, question_count, attempts_allowed, is_enabled, passing_score_percent)
        VALUES 
          (1, 1001, 15, 3, 2, TRUE, 60),
          (1, 1002, 20, 4, 3, TRUE, 70),
          (1, 1003, 15, 3, 2, TRUE, 60),
          (1, 1004, 20, 4, 2, TRUE, 60),
          (1, 1005, 25, 3, 2, TRUE, 70)
        ON CONFLICT (teacher_id, topic_id) DO UPDATE 
        SET time_limit_minutes = EXCLUDED.time_limit_minutes, question_count = EXCLUDED.question_count, attempts_allowed = EXCLUDED.attempts_allowed, is_enabled = EXCLUDED.is_enabled, passing_score_percent = EXCLUDED.passing_score_percent;
        """
    )
    logger.info("Seed: Topic tests enabled and configured")

    # 8.5 Delete existing demo sessions and questions first to cascade delete child options/snapshots and avoid Unique/Raise errors on retry
    await conn.execute("DELETE FROM test_session_questions WHERE question_id >= 10000 AND question_id <= 10050 OR session_id IN (10001, 10002, 10003, 10004, 10005)")
    await conn.execute("DELETE FROM student_answers WHERE question_id >= 10000 AND question_id <= 10050 OR session_id IN (10001, 10002, 10003, 10004, 10005)")
    await conn.execute("DELETE FROM test_sessions WHERE session_id IN (10001, 10002, 10003, 10004, 10005)")
    await conn.execute("DELETE FROM questions WHERE question_id >= 10000 AND question_id <= 10050")
    logger.info("Seed: Cleaned up existing demo questions and sessions")

    # 9. Ensure Questions, Options, Acceptable Answers
    questions_data = [
        # Topic 1001
        {
            "question_id": 10001, "discipline_id": 1, "topic_id": 1001, "qtype": "single", "points": 1.0,
            "text": "Кто разработал реляционную модель данных?",
            "options": [
                {"option_id": 50001, "option_number": 1, "text": "Эдгар Кодд", "is_correct": True},
                {"option_id": 50002, "option_number": 2, "text": "Дональд Кнут", "is_correct": False},
                {"option_id": 50003, "option_number": 3, "text": "Алан Тьюринг", "is_correct": False},
                {"option_id": 50004, "option_number": 4, "text": "Линус Торвальдс", "is_correct": False},
            ]
        },
        {
            "question_id": 10002, "discipline_id": 1, "topic_id": 1001, "qtype": "bool", "points": 1.0,
            "text": "Может ли первичный ключ (Primary Key) принимать значение NULL?",
            "correct_bool": False,
            "options": []
        },
        {
            "question_id": 10003, "discipline_id": 1, "topic_id": 1001, "qtype": "single", "points": 1.0,
            "text": "Какое свойство транзакции гарантирует, что она будет либо выполнена полностью, либо не выполнена совсем?",
            "options": [
                {"option_id": 50005, "option_number": 1, "text": "Atomicity (Атомарность)", "is_correct": True},
                {"option_id": 50006, "option_number": 2, "text": "Consistency (Согласованность)", "is_correct": False},
                {"option_id": 50007, "option_number": 3, "text": "Isolation (Изоляция)", "is_correct": False},
                {"option_id": 50008, "option_number": 4, "text": "Durability (Стойкость)", "is_correct": False},
            ]
        },
        {
            "question_id": 10004, "discipline_id": 1, "topic_id": 1001, "qtype": "multi", "points": 1.0,
            "text": "Какие из следующих типов связей существуют в реляционных базах данных? (Выберите все подходящие)",
            "options": [
                {"option_id": 50009, "option_number": 1, "text": "Один-к-одному", "is_correct": True},
                {"option_id": 50010, "option_number": 2, "text": "Один-ко-многим", "is_correct": True},
                {"option_id": 50011, "option_number": 3, "text": "Многие-ко-многим", "is_correct": True},
                {"option_id": 50012, "option_number": 4, "text": "Один-к-бесконечности", "is_correct": False},
            ]
        },
        {
            "question_id": 10005, "discipline_id": 1, "topic_id": 1001, "qtype": "text", "points": 1.0,
            "text": "Как называется уникальный идентификатор строки в таблице?",
            "acceptable_answers": ["первичный ключ", "primary key"],
            "options": []
        },
        # Topic 1002
        {
            "question_id": 10011, "discipline_id": 1, "topic_id": 1002, "qtype": "single", "points": 1.0,
            "text": "Какой оператор используется для фильтрации строк в SQL-запросе?",
            "options": [
                {"option_id": 50013, "option_number": 1, "text": "WHERE", "is_correct": True},
                {"option_id": 50014, "option_number": 2, "text": "HAVING", "is_correct": False},
                {"option_id": 50015, "option_number": 3, "text": "SELECT", "is_correct": False},
                {"option_id": 50016, "option_number": 4, "text": "GROUP BY", "is_correct": False},
            ]
        },
        {
            "question_id": 10012, "discipline_id": 1, "topic_id": 1002, "qtype": "single", "points": 1.0,
            "text": "Какое соединение возвращает только те строки, для которых есть соответствие в обеих таблицах?",
            "options": [
                {"option_id": 50017, "option_number": 1, "text": "INNER JOIN", "is_correct": True},
                {"option_id": 50018, "option_number": 2, "text": "LEFT JOIN", "is_correct": False},
                {"option_id": 50019, "option_number": 3, "text": "RIGHT JOIN", "is_correct": False},
                {"option_id": 50020, "option_number": 4, "text": "FULL OUTER JOIN", "is_correct": False},
            ]
        },
        {
            "question_id": 10013, "discipline_id": 1, "topic_id": 1002, "qtype": "multi", "points": 1.0,
            "text": "Какие из следующих функций являются агрегатными функциями SQL? (Выберите все варианты)",
            "options": [
                {"option_id": 50021, "option_number": 1, "text": "SUM", "is_correct": True},
                {"option_id": 50022, "option_number": 2, "text": "AVG", "is_correct": True},
                {"option_id": 50023, "option_number": 3, "text": "COUNT", "is_correct": True},
                {"option_id": 50024, "option_number": 4, "text": "UPPER", "is_correct": False},
            ]
        },
        {
            "question_id": 10014, "discipline_id": 1, "topic_id": 1002, "qtype": "text", "points": 1.0,
            "text": "Чему равен результат выражения SELECT COUNT(*) для таблицы из 5 строк, где в одном из столбцов 2 значения NULL?",
            "text_mode": "number", "numeric_tolerance": 0.0,
            "acceptable_answers": ["5"],
            "options": []
        },
        {
            "question_id": 10015, "discipline_id": 1, "topic_id": 1002, "qtype": "text", "points": 1.0,
            "text": "Какой оператор используется для удаления дубликатов в SELECT?",
            "acceptable_answers": ["distinct"],
            "options": []
        },
        # Topic 1003
        {
            "question_id": 10021, "discipline_id": 1, "topic_id": 1003, "qtype": "single", "points": 1.0,
            "text": "На каком уровне нормализации удаляются транзитивные зависимости?",
            "options": [
                {"option_id": 50025, "option_number": 1, "text": "1NF", "is_correct": False},
                {"option_id": 50026, "option_number": 2, "text": "2NF", "is_correct": False},
                {"option_id": 50027, "option_number": 3, "text": "3NF", "is_correct": True},
                {"option_id": 50028, "option_number": 4, "text": "BCNF", "is_correct": False},
            ]
        },
        {
            "question_id": 10022, "discipline_id": 1, "topic_id": 1003, "qtype": "bool", "points": 1.0,
            "text": "Правда ли, что для приведения таблицы ко второй нормальной форме (2NF) она должна находиться в первой нормальной форме (1NF)?",
            "correct_bool": True,
            "options": []
        },
        {
            "question_id": 10023, "discipline_id": 1, "topic_id": 1003, "qtype": "single", "points": 1.0,
            "text": "Что означает аббревиатура ER в терминологии ER-диаграмм?",
            "options": [
                {"option_id": 50029, "option_number": 1, "text": "Entity-Relationship (Сущность-Связь)", "is_correct": True},
                {"option_id": 50030, "option_number": 2, "text": "Entity-Record", "is_correct": False},
                {"option_id": 50031, "option_number": 3, "text": "Error-Report", "is_correct": False},
                {"option_id": 50032, "option_number": 4, "text": "Extended-Relational", "is_correct": False},
            ]
        },
        {
            "question_id": 10024, "discipline_id": 1, "topic_id": 1003, "qtype": "multi", "points": 1.0,
            "text": "Какие аномалии могут возникать в ненормализованных базах данных? (Выберите несколько)",
            "options": [
                {"option_id": 50033, "option_number": 1, "text": "Аномалия вставки", "is_correct": True},
                {"option_id": 50034, "option_number": 2, "text": "Аномалия удаления", "is_correct": True},
                {"option_id": 50035, "option_number": 3, "text": "Аномалия обновления", "is_correct": True},
                {"option_id": 50036, "option_number": 4, "text": "Аномалия сортировки", "is_correct": False},
            ]
        },
        {
            "question_id": 10025, "discipline_id": 1, "topic_id": 1003, "qtype": "text", "points": 1.0,
            "text": "Как называется ключ в таблице, который ссылается на первичный ключ другой таблицы?",
            "acceptable_answers": ["внешний ключ", "foreign key"],
            "options": []
        },
        # Topic 1004
        {
            "question_id": 10031, "discipline_id": 9, "topic_id": 1004, "qtype": "single", "points": 1.0,
            "text": "Какой принцип ООП заключается в сокрытии внутренней реализации объекта и предоставлении доступа через интерфейс?",
            "options": [
                {"option_id": 50037, "option_number": 1, "text": "Инкапсуляция", "is_correct": True},
                {"option_id": 50038, "option_number": 2, "text": "Наследование", "is_correct": False},
                {"option_id": 50039, "option_number": 3, "text": "Полиморфизм", "is_correct": False},
                {"option_id": 50040, "option_number": 4, "text": "Абстракция", "is_correct": False},
            ]
        },
        {
            "question_id": 10032, "discipline_id": 9, "topic_id": 1004, "qtype": "single", "points": 1.0,
            "text": "Какое ключевое слово используется в Java для наследования класса?",
            "options": [
                {"option_id": 50041, "option_number": 1, "text": "extends", "is_correct": True},
                {"option_id": 50042, "option_number": 2, "text": "implements", "is_correct": False},
                {"option_id": 50043, "option_number": 3, "text": "inherits", "is_correct": False},
                {"option_id": 50044, "option_number": 4, "text": "super", "is_correct": False},
            ]
        },
        {
            "question_id": 10033, "discipline_id": 9, "topic_id": 1004, "qtype": "bool", "points": 1.0,
            "text": "Правда ли, что в Java поддерживается множественное наследование классов?",
            "correct_bool": False,
            "options": []
        },
        {
            "question_id": 10034, "discipline_id": 9, "topic_id": 1004, "qtype": "multi", "points": 1.0,
            "text": "Какие модификаторы доступа существуют в языке Java? (Выберите несколько)",
            "options": [
                {"option_id": 50045, "option_number": 1, "text": "public", "is_correct": True},
                {"option_id": 50046, "option_number": 2, "text": "private", "is_correct": True},
                {"option_id": 50047, "option_number": 3, "text": "protected", "is_correct": True},
                {"option_id": 50048, "option_number": 4, "text": "internal", "is_correct": False},
            ]
        },
        {
            "question_id": 10035, "discipline_id": 9, "topic_id": 1004, "qtype": "text", "points": 1.0,
            "text": "Какой метод класса вызывается при создании его экземпляра?",
            "acceptable_answers": ["конструктор", "constructor"],
            "options": []
        },
        # Topic 1005
        {
            "question_id": 10041, "discipline_id": 9, "topic_id": 1005, "qtype": "single", "points": 1.0,
            "text": "Какой паттерн проектирования гарантирует, что у класса есть только один экземпляр, и предоставляет к нему глобальную точку доступа?",
            "options": [
                {"option_id": 50049, "option_number": 1, "text": "Singleton (Одиночка)", "is_correct": True},
                {"option_id": 50050, "option_number": 2, "text": "Factory Method", "is_correct": False},
                {"option_id": 50051, "option_number": 3, "text": "Observer", "is_correct": False},
                {"option_id": 50052, "option_number": 4, "text": "Strategy", "is_correct": False},
            ]
        },
        {
            "question_id": 10042, "discipline_id": 9, "topic_id": 1005, "qtype": "single", "points": 1.0,
            "text": "К какой группе относится паттерн проектирования 'Адаптер'?",
            "options": [
                {"option_id": 50053, "option_number": 1, "text": "Порождающие", "is_correct": False},
                {"option_id": 50054, "option_number": 2, "text": "Структурные", "is_correct": True},
                {"option_id": 50055, "option_number": 3, "text": "Поведенческие", "is_correct": False},
                {"option_id": 50056, "option_number": 4, "text": "Архитектурные", "is_correct": False},
            ]
        },
        {
            "question_id": 10043, "discipline_id": 9, "topic_id": 1005, "qtype": "single", "points": 1.0,
            "text": "Какой поведенческий паттерн позволяет объекту изменять свое поведение в зависимости от его внутреннего состояния?",
            "options": [
                {"option_id": 50057, "option_number": 1, "text": "State (Состояние)", "is_correct": True},
                {"option_id": 50058, "option_number": 2, "text": "Command", "is_correct": False},
                {"option_id": 50059, "option_number": 3, "text": "Iterator", "is_correct": False},
                {"option_id": 50060, "option_number": 4, "text": "Memento", "is_correct": False},
            ]
        },
        {
            "question_id": 10044, "discipline_id": 9, "topic_id": 1005, "qtype": "multi", "points": 1.0,
            "text": "Какие из следующих паттернов являются порождающими (Creational)? (Выберите несколько)",
            "options": [
                {"option_id": 50061, "option_number": 1, "text": "Builder (Строитель)", "is_correct": True},
                {"option_id": 50062, "option_number": 2, "text": "Prototype (Прототип)", "is_correct": True},
                {"option_id": 50063, "option_number": 3, "text": "Singleton (Одиночка)", "is_correct": True},
                {"option_id": 50064, "option_number": 4, "text": "Composite (Компоновщик)", "is_correct": False},
            ]
        },
        {
            "question_id": 10045, "discipline_id": 9, "topic_id": 1005, "qtype": "text", "points": 1.0,
            "text": "Как называется паттерн, определяющий зависимость типа 'один-ко-многим' между объектами, при которой изменение состояния одного объекта приводит к оповещению остальных?",
            "acceptable_answers": ["наблюдатель", "observer"],
            "options": []
        }
    ]

    for q in questions_data:
        await conn.execute(
            """
            INSERT INTO questions (question_id, discipline_id, topic_id, text, qtype, points, correct_bool, numeric_tolerance, text_mode)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (question_id) DO UPDATE 
            SET discipline_id = EXCLUDED.discipline_id, 
                topic_id = EXCLUDED.topic_id, 
                text = EXCLUDED.text, 
                qtype = EXCLUDED.qtype, 
                points = EXCLUDED.points, 
                correct_bool = EXCLUDED.correct_bool, 
                numeric_tolerance = EXCLUDED.numeric_tolerance, 
                text_mode = EXCLUDED.text_mode;
            """,
            q["question_id"], q["discipline_id"], q["topic_id"], q["text"], q["qtype"], q["points"],
            q.get("correct_bool"), q.get("numeric_tolerance"), q.get("text_mode", "string")
        )

        # options
        for opt in q["options"]:
            await conn.execute(
                """
                INSERT INTO answer_options (option_id, question_id, option_number, text, is_correct)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (option_id) DO UPDATE 
                SET question_id = EXCLUDED.question_id, 
                    option_number = EXCLUDED.option_number, 
                    text = EXCLUDED.text, 
                    is_correct = EXCLUDED.is_correct;
                """,
                opt["option_id"], q["question_id"], opt["option_number"], opt["text"], opt["is_correct"]
            )
        
        # acceptable answers
        if q.get("acceptable_answers"):
            for ord_idx, ans in enumerate(q["acceptable_answers"], start=1):
                await conn.execute(
                    """
                    INSERT INTO question_acceptable_answers (question_id, ord, answer)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (question_id, ord) DO UPDATE SET answer = EXCLUDED.answer;
                    """,
                    q["question_id"], ord_idx, ans
                )

    logger.info("Seed: Questions and options ensured")

    # 10. Ensure Question Versions (pre-seeded with snapshot JSON for historical grading correctness)
    for q in questions_data:
        snapshot = {
            "schema_version": 1,
            "question_id": q["question_id"],
            "discipline_id": q["discipline_id"],
            "topic_id": q["topic_id"],
            "text": q["text"],
            "difficulty": 1,
            "qtype": q["qtype"],
            "short_pattern": None,
            "numeric_tolerance": q.get("numeric_tolerance"),
            "match_pairs": [],
            "correct_bool": q.get("correct_bool"),
            "explanation": None,
            "case_sensitive": False,
            "trim_whitespace": True,
            "normalize_universal": True,
            "text_mode": q.get("text_mode", "string"),
            "allow_partial": False,
            "points": float(q["points"]),
            "archived_at": None,
            "image_id": None,
            "options": [
                {
                    "option_id": opt["option_id"],
                    "option_number": opt["option_number"],
                    "text": opt["text"],
                    "is_correct": opt["is_correct"],
                    "match_left": None,
                    "match_right": None,
                    "correct_position": None
                }
                for opt in q["options"]
            ],
            "acceptable_answers": q.get("acceptable_answers", []),
            "cloze_blanks": []
        }
        await conn.execute(
            """
            INSERT INTO question_versions (question_version_id, question_id, version_no, snapshot, created_by_teacher_id)
            VALUES ($1, $2, 1, $3, 1)
            ON CONFLICT (question_id, version_no) DO UPDATE SET snapshot = EXCLUDED.snapshot
            """,
            100100 + q["question_id"], q["question_id"], json.dumps(snapshot)
        )
    logger.info("Seed: Question snapshots created")

    # 11. Ensure Test Policy Versions
    topic_policies = [
        {"policy_version_id": 1001, "topic_id": 1001, "discipline_id": 1, "question_count": 3, "time_limit_minutes": 15, "attempts_allowed": 2, "passing_score_percent": 60},
        {"policy_version_id": 1002, "topic_id": 1002, "discipline_id": 1, "question_count": 4, "time_limit_minutes": 20, "attempts_allowed": 3, "passing_score_percent": 70},
        {"policy_version_id": 1003, "topic_id": 1003, "discipline_id": 1, "question_count": 3, "time_limit_minutes": 15, "attempts_allowed": 2, "passing_score_percent": 60},
        {"policy_version_id": 1004, "topic_id": 1004, "discipline_id": 9, "question_count": 4, "time_limit_minutes": 20, "attempts_allowed": 2, "passing_score_percent": 60},
        {"policy_version_id": 1005, "topic_id": 1005, "discipline_id": 9, "question_count": 3, "time_limit_minutes": 25, "attempts_allowed": 2, "passing_score_percent": 70},
    ]
    for p in topic_policies:
        snapshot = {
            "schema_version": 1,
            "scope": "topic",
            "teacher_id": 1,
            "discipline_id": p["discipline_id"],
            "topic_id": p["topic_id"],
            "is_enabled": True,
            "question_count": p["question_count"],
            "time_limit_minutes": p["time_limit_minutes"],
            "attempts_allowed": p["attempts_allowed"],
            "available_from": None,
            "available_until": None,
            "shuffle_seed": True,
            "show_correct_after_finish": True,
            "passing_score_percent": p["passing_score_percent"],
            "grading_method": "best",
            "show_question_points": True,
            "attempt_delay_minutes": None,
            "grade_scale": "5_point"
        }
        await conn.execute(
            """
            INSERT INTO test_policy_versions (policy_version_id, scope, teacher_id, discipline_id, topic_id, version_no, snapshot, created_by_teacher_id)
            VALUES ($1, 'topic', 1, $2, $3, 1, $4, 1)
            ON CONFLICT (policy_version_id) DO UPDATE SET snapshot = EXCLUDED.snapshot
            """,
            p["policy_version_id"], p["discipline_id"], p["topic_id"], json.dumps(snapshot)
        )
    logger.info("Seed: Topic policies created")

    # 12. Ensure Test Sessions, Attempts, Answers and Extra Data
    await conn.execute("DELETE FROM test_sessions WHERE session_id IN (10001, 10002, 10003, 10004, 10005)")

    sessions = [
        # Session 10001: Petrova Topic 1001 completed (Passed: 3/3)
        (10001, 2, 1, 1001, 1, now - timedelta(hours=2), now - timedelta(minutes=105), 3, 3, 1, 'completed', 1001),
        # Session 10002: Petrova Topic 1002 completed (Passed: 3/4)
        (10002, 2, 1, 1002, 1, now - timedelta(hours=1), now - timedelta(minutes=45), 3, 4, 1, 'completed', 1002),
        # Session 10003: Petrova Topic 1003 in_progress
        (10003, 2, 1, 1003, 1, now - timedelta(minutes=5), None, 0, 3, 1, 'in_progress', 1003),
        # Session 10004: Ivanov Topic 1001 completed (Failed: 1/3)
        (10004, 1, 1, 1001, 1, now - timedelta(hours=3), now - timedelta(minutes=160), 1, 3, 1, 'completed', 1001),
        # Session 10005: Ivanov Topic 1001 completed (Failed: 1/3)
        (10005, 1, 1, 1001, 1, now - timedelta(hours=2, minutes=30), now - timedelta(hours=2, minutes=10), 1, 3, 2, 'completed', 1001),
    ]

    for s in sessions:
        await conn.execute(
            """
            INSERT INTO test_sessions (session_id, student_id, discipline_id, topic_id, teacher_id, started_at, completed_at, score, max_score, attempt_no, status, policy_version_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            """,
            *s
        )

    # Insert test_session_questions (tracks exact question ordering/versions for the session)
    session_questions = [
        # Session 10001
        (10001, 10001, 100100 + 10001, 1),
        (10001, 10002, 100100 + 10002, 2),
        (10001, 10003, 100100 + 10003, 3),
        # Session 10002
        (10002, 10011, 100100 + 10011, 1),
        (10002, 10012, 100100 + 10012, 2),
        (10002, 10013, 100100 + 10013, 3),
        (10002, 10014, 100100 + 10014, 4),
        # Session 10003
        (10003, 10021, 100100 + 10021, 1),
        (10003, 10022, 100100 + 10022, 2),
        (10003, 10023, 100100 + 10023, 3),
        # Session 10004
        (10004, 10001, 100100 + 10001, 1),
        (10004, 10002, 100100 + 10002, 2),
        (10004, 10003, 100100 + 10003, 3),
        # Session 10005
        (10005, 10001, 100100 + 10001, 1),
        (10005, 10002, 100100 + 10002, 2),
        (10005, 10003, 100100 + 10003, 3),
    ]
    for sq in session_questions:
        await conn.execute(
            """
            INSERT INTO test_session_questions (session_id, question_id, question_version_id, position)
            VALUES ($1, $2, $3, $4)
            """,
            sq[0], sq[1], sq[2], sq[3]
        )

    # Insert student answers & answer extras
    ans_id = 100001

    async def add_ans(sess_id, q_id, opt_id=None, raw=None, ok=None, pairs=None):
        nonlocal ans_id
        await conn.execute(
            """
            INSERT INTO student_answers (answer_id, session_id, question_id, selected_option_id, answered_at)
            VALUES ($1, $2, $3, $4, $5)
            """,
            ans_id, sess_id, q_id, opt_id, now - timedelta(minutes=15)
        )
        if raw is not None or ok is not None or pairs is not None:
            await conn.execute(
                """
                INSERT INTO answer_extra (answer_id, short_answer_raw, short_answer_ok, match_pairs)
                VALUES ($1, $2, $3, $4)
                """,
                ans_id, raw, ok, json.dumps(pairs) if pairs is not None else None
            )
        ans_id += 1

    # Session 10001 (Petrova Topic 1001 - 3/3 correct)
    await add_ans(10001, 10001, opt_id=50001)  # Codd (Correct)
    await add_ans(10001, 10002, raw='false', ok=True)  # PK can't be NULL (Correct)
    await add_ans(10001, 10003, opt_id=50005)  # Atomicity (Correct)

    # Session 10002 (Petrova Topic 1002 - 3/4 correct)
    await add_ans(10002, 10011, opt_id=50013)  # WHERE (Correct)
    await add_ans(10002, 10012, opt_id=50017)  # INNER JOIN (Correct)
    await add_ans(10002, 10013, pairs=[50021, 50022, 50023])  # SUM, AVG, COUNT (Correct)
    await add_ans(10002, 10014, raw='4', ok=False)  # NULLs count (Incorrect, expected 5)

    # Session 10003 (Petrova Topic 1003 - in_progress, unsaved/draft)
    await add_ans(10003, 10021, opt_id=50025)  # 1NF (Incorrect draft)

    # Session 10004 (Ivanov Topic 1001 - 1/3 correct)
    await add_ans(10004, 10001, opt_id=50002)  # Knuth (Incorrect)
    await add_ans(10004, 10002, raw='true', ok=False)  # PK can be NULL (Incorrect)
    await add_ans(10004, 10003, opt_id=50005)  # Atomicity (Correct)

    # Session 10005 (Ivanov Topic 1001 - 1/3 correct)
    await add_ans(10005, 10001, opt_id=50003)  # Turing (Incorrect)
    await add_ans(10005, 10002, raw='false', ok=True)  # PK can't be NULL (Correct)
    await add_ans(10005, 10003, opt_id=50008)  # Durability (Incorrect)

    logger.info("Seed: Sessions and mock student answers generated")

    # 13. Ensure Notifications
    await conn.execute("DELETE FROM notifications WHERE user_role = 'student' AND user_id IN (1, 2, 3, 4)")
    await conn.execute("DELETE FROM notifications WHERE user_role = 'teacher' AND user_id = 1")

    petrova_notifications = [
        # New test available
        (100001, 'student', 2, 'test_available', json.dumps({
            "title": "Доступен тест по теме 'Паттерны проектирования'",
            "body": "Преподаватель Сидоров А. опубликовал тест по теме 'Паттерны проектирования'. Попыток разрешено: 2.",
            "link": "/student/topics/1005",
            "meta": {"topic_id": 1005}
        }), None, now - timedelta(hours=1)),
        # Test graded
        (100002, 'student', 2, 'test_graded', json.dumps({
            "title": "Оценена попытка по теме 'Язык запросов SQL'",
            "body": "Ваша попытка №1 оценена на 3 из 4 баллов.",
            "link": "/student/results/10002",
            "meta": {"session_id": 10002}
        }), None, now - timedelta(minutes=30)),
        # Deadline approaching
        (100003, 'student', 2, 'deadline_approaching', json.dumps({
            "title": "Приближается дедлайн по теме 'Проектирование и нормализация БД'",
            "body": "Тест по теме 'Проектирование и нормализация БД' необходимо пройти до завтра.",
            "link": "/student/topics/1003",
            "meta": {"topic_id": 1003}
        }), None, now - timedelta(minutes=10)),
    ]

    sidorov_notifications = [
        # Student completed test
        (100004, 'teacher', 1, 'student_attempt_finished', json.dumps({
            "title": "Студент завершил тест",
            "body": "Студент Петрова М. завершил попытку по теме 'Введение в реляционные БД' с результатом 3/3.",
            "link": "/teacher/students/2",
            "meta": {"session_id": 10001}
        }), None, now - timedelta(hours=1, minutes=40)),
        # Attempts exhausted
        (100005, 'teacher', 1, 'attempts_exhausted', json.dumps({
            "title": "Исчерпан лимит попыток",
            "body": "Студент Иванов И. исчерпал лимит попыток по теме 'Введение в реляционные БД' (все 2 попытки неудовлетворительны).",
            "link": "/teacher/students/1",
            "meta": {"student_id": 1}
        }), None, now - timedelta(hours=2)),
    ]

    for n in petrova_notifications + sidorov_notifications:
        await conn.execute(
            """
            INSERT INTO notifications (notification_id, user_role, user_id, event_type, payload, read_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            *n
        )
    logger.info("Seed: Demo notifications created")

    # 14. Sync Sequences for all serial primary keys to prevent constraint errors on subsequent UI inserts
    sequences = [
        ("groups", "group_id"),
        ("disciplines", "discipline_id"),
        ("teachers", "teacher_id"),
        ("students", "student_id"),
        ("discipline_topics", "topic_id"),
        ("questions", "question_id"),
        ("answer_options", "option_id"),
        ("test_policy_versions", "policy_version_id"),
        ("test_sessions", "session_id"),
        ("question_versions", "question_version_id"),
        ("notifications", "notification_id"),
        ("student_answers", "answer_id")
    ]
    for table, col in sequences:
        await conn.execute(
            f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), COALESCE((SELECT MAX({col}) FROM {table}), 1))"
        )
    logger.info("Seed: Database sequences successfully synchronized")


async def main() -> None:
    settings = get_settings()
    dsn = _dsn_sync(settings.database_url)
    conn = await asyncpg.connect(dsn)
    try:
        await ensure_admin_seed(conn)
        await ensure_teacher_disciplines_seed(conn)
        await ensure_student_discipline_assignments_seed(conn)
        await seed_default_tags(conn)
        
        # If running in dev/test or explicit SEED_DEMO is set, seed default teacher/student credentials
        if os.environ.get("SEED_DEMO", "").lower() in ("1", "true", "yes"):
            await seed_credentials(conn)
            logger.info("Demo credentials seed applied. Default password: Passw0rd!Test")
            await seed_demo_data(conn)
            logger.info("Demo data seeding completed successfully!")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
