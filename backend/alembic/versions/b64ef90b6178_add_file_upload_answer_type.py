"""add_file_upload_answer_type

Revision ID: b64ef90b6178
Revises: e1dae12cad4b
Create Date: 2026-06-27 17:45:19.123343
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = 'b64ef90b6178'
down_revision: Union[str, None] = 'e1dae12cad4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns to questions table
    op.add_column('questions', sa.Column('file_allowed_types', sa.Text(), nullable=True))
    op.add_column('questions', sa.Column('file_max_size_bytes', sa.BigInteger(), server_default='10485760', nullable=True))
    op.add_column('questions', sa.Column('file_max_count', sa.Integer(), server_default='1', nullable=True))

    # 2. Update CHECK constraint for questions.qtype
    # Try dropping both possible constraint names just in case
    op.execute("ALTER TABLE questions DROP CONSTRAINT IF EXISTS ck_questions_questions_qtype_check")
    op.execute("ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_qtype_check")
    op.execute(
        "ALTER TABLE questions ADD CONSTRAINT ck_questions_questions_qtype_check "
        "CHECK (qtype IN ('single','multi','short','numeric','match','text','order','bool','cloze','file_upload'))"
    )

    # 3. Update CHECK constraint for test_sessions.status
    op.execute("ALTER TABLE test_sessions DROP CONSTRAINT IF EXISTS ck_test_sessions_test_sessions_status_check")
    op.execute("ALTER TABLE test_sessions DROP CONSTRAINT IF EXISTS test_sessions_status_check")
    op.execute(
        "ALTER TABLE test_sessions ADD CONSTRAINT ck_test_sessions_test_sessions_status_check "
        "CHECK (status IN ('in_progress','completed','abandoned','force_finished','pending_file_grading'))"
    )

    # 4. Create answer_file_uploads table
    op.create_table('answer_file_uploads',
    sa.Column('upload_id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('answer_id', sa.Integer(), nullable=False),
    sa.Column('storage_key', sa.Text(), nullable=False),
    sa.Column('original_name', sa.Text(), nullable=False),
    sa.Column('content_type', sa.String(length=128), nullable=False),
    sa.Column('size_bytes', sa.BigInteger(), nullable=False),
    sa.Column('sha256_hex', sa.String(length=64), nullable=False),
    sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['answer_id'], ['student_answers.answer_id'], name=op.f('fk_answer_file_uploads_answer_id_student_answers'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('upload_id', name=op.f('pk_answer_file_uploads')),
    sa.UniqueConstraint('storage_key', name=op.f('uq_answer_file_uploads_storage_key'))
    )
    op.create_index('idx_answer_file_uploads_answer', 'answer_file_uploads', ['answer_id'], unique=False)

    # 5. Create file_upload_grades table
    op.create_table('file_upload_grades',
    sa.Column('grade_id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('answer_id', sa.Integer(), nullable=False),
    sa.Column('teacher_id', sa.Integer(), nullable=False),
    sa.Column('points_earned', sa.Numeric(), nullable=False),
    sa.Column('comment', sa.Text(), nullable=True),
    sa.Column('graded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('points_earned >= 0', name=op.f('ck_file_upload_grades_chk_file_upload_grade_positive')),
    sa.ForeignKeyConstraint(['answer_id'], ['student_answers.answer_id'], name=op.f('fk_file_upload_grades_answer_id_student_answers'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['teacher_id'], ['teachers.teacher_id'], name=op.f('fk_file_upload_grades_teacher_id_teachers')),
    sa.PrimaryKeyConstraint('grade_id', name=op.f('pk_file_upload_grades')),
    sa.UniqueConstraint('answer_id', name=op.f('uq_file_upload_grades_answer_id'))
    )
    op.create_index('idx_file_upload_grades_answer', 'file_upload_grades', ['answer_id'], unique=False)
    op.create_index('idx_file_upload_grades_teacher', 'file_upload_grades', ['teacher_id', sa.text('graded_at DESC')], unique=False)


def downgrade() -> None:
    # 1. Drop indexes and tables
    op.drop_index('idx_file_upload_grades_teacher', table_name='file_upload_grades')
    op.drop_index('idx_file_upload_grades_answer', table_name='file_upload_grades')
    op.drop_table('file_upload_grades')
    op.drop_index('idx_answer_file_uploads_answer', table_name='answer_file_uploads')
    op.drop_table('answer_file_uploads')

    # 2. Revert CHECK constraint on test_sessions
    op.execute("ALTER TABLE test_sessions DROP CONSTRAINT IF EXISTS ck_test_sessions_test_sessions_status_check")
    op.execute("ALTER TABLE test_sessions DROP CONSTRAINT IF EXISTS test_sessions_status_check")
    op.execute(
        "ALTER TABLE test_sessions ADD CONSTRAINT ck_test_sessions_test_sessions_status_check "
        "CHECK (status IN ('in_progress','completed','abandoned','force_finished'))"
    )

    # 3. Revert CHECK constraint on questions
    op.execute("ALTER TABLE questions DROP CONSTRAINT IF EXISTS ck_questions_questions_qtype_check")
    op.execute("ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_qtype_check")
    op.execute(
        "ALTER TABLE questions ADD CONSTRAINT ck_questions_questions_qtype_check "
        "CHECK (qtype IN ('single','multi','short','numeric','match','text','order','bool','cloze'))"
    )

    # 4. Remove columns from questions table
    op.drop_column('questions', 'file_max_count')
    op.drop_column('questions', 'file_max_size_bytes')
    op.drop_column('questions', 'file_allowed_types')

