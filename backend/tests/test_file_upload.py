import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from pathlib import Path

from app.services.file_storage import save_student_file, FileValidationError, _storage_path
from app.services.grading_v2 import grade_session
from app.db.models import TestSession as DBTestSession, StudentAnswer, FileUploadGrade


def test_magic_byte_detection():
    # PDF magic bytes
    pdf_data = b"%PDF-1.4\n%..."
    stored = save_student_file(
        session_id=1,
        question_id=2,
        data=pdf_data,
        original_name="test.pdf",
        declared_content_type="application/pdf",
        allowed_types=["application/pdf"],
        max_size=1000
    )
    assert stored.content_type == "application/pdf"
    assert stored.original_name == "test.pdf"

    # Blocked extensions
    with pytest.raises(FileValidationError) as excinfo:
        save_student_file(
            session_id=1,
            question_id=2,
            data=b"hello",
            original_name="script.exe",
            declared_content_type="application/octet-stream",
            allowed_types=None
        )
    assert "тип файла запрещён" in str(excinfo.value)


def test_extended_default_upload_extensions_are_allowed():
    samples = [
        ("archive.zip", b"PK\x03\x04zip-data", "application/zip"),
        ("report.docx", b"PK\x03\x04docx-data", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("sheet.xlsx", b"PK\x03\x04xlsx-data", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("slides.pptx", b"PK\x03\x04pptx-data", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        ("legacy.ppt", b"ppt-data", "application/vnd.ms-powerpoint"),
        ("formula.odf", b"odf-data", "application/vnd.oasis.opendocument.formula"),
        ("database.db", b"SQLite format 3\x00", "application/octet-stream"),
        ("solution.py", b"print('ok')\n", "text/x-python"),
        ("component.ts", b"const ok: boolean = true;\n", "text/x-typescript"),
        ("main.cpp", b"int main() { return 0; }\n", "text/plain"),
        ("header.hpp", b"#pragma once\n", "text/plain"),
        ("boot.asm", b"mov ax, bx\n", "text/plain"),
        ("sources.tar.gz", b"\x1f\x8b\x08tar-data", "application/gzip"),
        ("archive.tar.xz", b"\xfd7zXZ\x00tar-data", "application/x-xz"),
        ("packed.rar", b"Rar!\x1a\x07\x00rar-data", "application/vnd.rar"),
    ]

    for original_name, data, content_type in samples:
        stored = save_student_file(
            session_id=1,
            question_id=2,
            data=data,
            original_name=original_name,
            declared_content_type=content_type,
            allowed_types=None,
        )
        assert stored.original_name == original_name


def test_unknown_default_upload_extension_is_rejected():
    with pytest.raises(FileValidationError) as excinfo:
        save_student_file(
            session_id=1,
            question_id=2,
            data=b"unknown",
            original_name="payload.unknownext",
            declared_content_type="application/octet-stream",
            allowed_types=None,
        )
    assert "неподдерживаемый тип файла" in str(excinfo.value)


def test_compound_extension_allow_rule():
    stored = save_student_file(
        session_id=1,
        question_id=2,
        data=b"\x1f\x8b\x08tar-data",
        original_name="sources.tar.gz",
        declared_content_type="application/gzip",
        allowed_types=[".tar.gz"],
    )
    assert stored.original_name == "sources.tar.gz"


@pytest.mark.asyncio
async def test_grading_with_file_upload():
    # Prepare Mock Session
    session = AsyncMock()

    # Mock snapshots query
    mock_snapshot = MagicMock()
    mock_snapshot.question_id = 10
    mock_snapshot.snapshot = {
        "question_id": 10,
        "qtype": "file_upload",
        "points": 5.0,
        "text": "Upload homework"
    }

    # Mock student answer
    mock_answer = MagicMock()
    mock_answer.question_id = 10
    mock_answer.answer_id = 100

    # Mock FileUploadGrade query
    mock_grade = MagicMock()
    mock_grade.points_earned = 4.6

    # Mock execution result
    session.execute = AsyncMock()
    
    # Let's set up the return values for session_question_snapshots and student answers
    with patch("app.services.grading_v2.session_question_snapshots", AsyncMock(return_value=[mock_snapshot])):
        with patch("app.services.grading_v2.select", MagicMock()):
            # Mock executing StudentAnswer select
            mock_ans_execute = MagicMock()
            mock_ans_execute.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_answer])))
            
            # Mock executing FileUploadGrade select
            mock_grade_execute = MagicMock()
            mock_grade_execute.scalars = MagicMock(return_value=MagicMock(first=MagicMock(return_value=mock_grade)))
            
            session.execute.side_effect = [
                mock_ans_execute,  # student answers
                MagicMock(scalars=MagicMock(all=MagicMock(return_value=[]))), # extras (AnswerExtra)
                mock_grade_execute, # FileUploadGrade
            ]
            
            sess = DBTestSession(
                session_id=1,
                student_id=2,
                discipline_id=3,
                teacher_id=4,
                score=0,
                max_score=0
            )
            
            breakdown = await grade_session(session, sess)
            assert breakdown.score == 5 # rounded from 4.6
            assert breakdown.max_score == 5
            assert breakdown.per_question[0]["points_earned"] == 4.6
            assert breakdown.per_question[0]["is_correct"] is True
