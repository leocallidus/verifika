"""
Сервис для хранения произвольных файлов студентов.
Аналог question_images.py, но без проверки размеров изображения.
"""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

ALLOWED_UPLOAD_EXTENSIONS: set[str] = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".odt",
    ".ods",
    ".odp",
    ".odf",
    ".zip",
    ".rar",
    ".tar",
    ".tar.gz",
    ".tgz",
    ".tar.xz",
    ".txz",
    ".tar.bz2",
    ".tbz2",
    ".gz",
    ".xz",
    ".7z",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".sql",
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".xml",
    ".html",
    ".css",
    ".c",
    ".cpp",
    ".cc",
    ".cxx",
    ".h",
    ".hpp",
    ".hh",
    ".hxx",
    ".asm",
    ".s",
    ".java",
    ".cs",
    ".go",
    ".rs",
    ".kt",
    ".php",
    ".rb",
    ".swift",
    ".txt",
    ".csv",
    ".md",
    ".rtf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
}

ALLOWED_UPLOAD_MIME_TYPES: set[str] = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
    "application/vnd.oasis.opendocument.formula",
    "application/zip",
    "application/x-zip-compressed",
    "application/x-rar-compressed",
    "application/vnd.rar",
    "application/x-tar",
    "application/gzip",
    "application/x-gzip",
    "application/x-xz",
    "application/x-7z-compressed",
    "application/x-sqlite3",
    "application/sql",
    "application/json",
    "application/xml",
    "application/rtf",
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/x-python",
    "text/x-typescript",
    "text/javascript",
    "application/javascript",
    "text/x-c",
    "text/x-c++src",
    "text/x-c++hdr",
    "text/x-asm",
    "text/html",
    "text/css",
    "image/jpeg",
    "image/png",
    "image/webp",
}

BLOCKED_EXTENSIONS: set[str] = {
    ".exe", ".sh", ".bat", ".cmd", ".ps1",
    ".msi", ".dll", ".so", ".app", ".dmg",
}

MAX_FILE_SIZE_ABSOLUTE = 50 * 1024 * 1024   # 50 МБ — абсолютный верхний лимит


@dataclass(frozen=True)
class StoredFile:
    storage_key: str
    original_name: str
    content_type: str
    size_bytes: int
    sha256_hex: str


class FileValidationError(ValueError):
    pass


def _detect_mime(data: bytes) -> str:
    """Magic-byte определение MIME-типа."""
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"PK\x03\x04"):
        # ZIP / Office Open XML (docx, xlsx, etc.)
        return "application/zip"
    if data.startswith(b"Rar!\x1a\x07\x00") or data.startswith(b"Rar!\x1a\x07\x01\x00"):
        return "application/vnd.rar"
    if data.startswith(b"\x1f\x8b\x08"):
        return "application/gzip"
    if data.startswith(b"\xfd7zXZ\x00"):
        return "application/x-xz"
    if data.startswith(b"7z\xbc\xaf\x27\x1c"):
        return "application/x-7z-compressed"
    if data.startswith(b"SQLite format 3\x00"):
        return "application/x-sqlite3"
    if data.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return "application/octet-stream"


def _file_extension(name: str) -> str:
    lower_name = Path(name).name.lower()
    for ext in sorted(ALLOWED_UPLOAD_EXTENSIONS | BLOCKED_EXTENSIONS, key=len, reverse=True):
        if lower_name.endswith(ext):
            return ext
    return Path(lower_name).suffix


def _allowed_by_rule(rule: str, ext: str, declared_content_type: str, detected_mime: str) -> bool:
    allowed = rule.strip().lower()
    if allowed in {"*", "any"}:
        return True
    if allowed.startswith("."):
        return allowed == ext
    return allowed in {declared_content_type.lower(), detected_mime.lower()}


def save_student_file(
    session_id: int,
    question_id: int,
    data: bytes,
    original_name: str,
    declared_content_type: str,
    allowed_types: list[str] | None = None,
    max_size: int = 10 * 1024 * 1024,
) -> StoredFile:
    """
    Сохраняет файл в uploads/student-files/{session_id}/{question_id}/{uuid}.{ext}.
    Проверяет размер и MIME-тип.
    """
    if not data:
        raise FileValidationError("пустой файл")
    if len(data) > min(max_size, MAX_FILE_SIZE_ABSOLUTE):
        raise FileValidationError(
            f"файл слишком большой (макс. {max_size // 1024 // 1024} МБ)"
        )

    # Проверка расширения
    name_path = Path(original_name)
    ext = _file_extension(original_name)
    if ext in BLOCKED_EXTENSIONS:
        raise FileValidationError(f"тип файла запрещён: {ext}")

    # Определяем MIME через magic bytes
    detected_mime = _detect_mime(data)

    # Разрешённые типы
    effective_allowed = (
        set(allowed_types) if allowed_types else ALLOWED_UPLOAD_MIME_TYPES
    )
    # Дополнительно: DOCX/XLSX — это ZIP, принимаем оба варианта
    if declared_content_type in {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/msword",
        "application/vnd.ms-excel",
    }:
        effective_allowed = effective_allowed.copy()
        effective_allowed.add("application/zip")
        effective_allowed.add(declared_content_type)

    # Если file_allowed_types передан, мы также проверяем, чтобы он подходил
    if allowed_types:
        is_allowed = False
        declared_lower = declared_content_type.lower()
        for allowed in allowed_types:
            if _allowed_by_rule(allowed, ext, declared_lower, detected_mime):
                is_allowed = True
                break
            # Если разрешен zip, а detected_mime - zip
            if allowed == "application/zip" and detected_mime == "application/zip":
                is_allowed = True
                break
            # Если разрешен docx, а detected_mime - zip, а declared_content_type - docx
            if "wordprocessingml" in allowed and detected_mime == "application/zip" and "wordprocessingml" in declared_content_type:
                is_allowed = True
                break
            if "spreadsheetml" in allowed and detected_mime == "application/zip" and "spreadsheetml" in declared_content_type:
                is_allowed = True
                break
        if not is_allowed:
            raise FileValidationError(
                f"недопустимый тип файла. Разрешены: {', '.join(allowed_types)}"
            )
    else:
        # Проверяем по стандартному списку
        if (
            ext not in ALLOWED_UPLOAD_EXTENSIONS
            and detected_mime not in effective_allowed
            and declared_content_type not in effective_allowed
        ):
            raise FileValidationError(
                f"неподдерживаемый тип файла: {detected_mime}"
            )

    # Сохранение
    safe_ext = ext if ext else ".bin"
    storage_key = f"student-files/{session_id}/{question_id}/{uuid.uuid4().hex}{safe_ext}"
    path = _storage_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

    return StoredFile(
        storage_key=storage_key,
        original_name=name_path.name[:255],
        content_type=declared_content_type or detected_mime,
        size_bytes=len(data),
        sha256_hex=hashlib.sha256(data).hexdigest(),
    )


def delete_student_file(storage_key: str | None) -> None:
    if not storage_key:
        return
    try:
        _storage_path(storage_key).unlink(missing_ok=True)
    except FileNotFoundError:
        pass


def _storage_path(storage_key: str) -> Path:
    from app.services.question_images import upload_root
    root = upload_root().resolve()
    path = (root / storage_key).resolve()
    if root not in path.parents and path != root:
        raise FileValidationError("недопустимый путь")
    return path
