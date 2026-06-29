from types import SimpleNamespace

from app.services.question_quality import _question_issues


def _option(number, text, correct=False, position=None):
    return SimpleNamespace(
        option_number=number,
        text=text,
        is_correct=correct,
        correct_position=position,
    )


def _question(**kwargs):
    defaults = {
        "question_id": 1,
        "text": "Что такое HTTP?",
        "qtype": "single",
        "options": [
            _option(1, "Протокол", True),
            _option(2, "Язык"),
            _option(3, "База данных"),
            _option(4, "Операционная система"),
        ],
        "acceptable_answers": [],
        "cloze_blanks": [],
        "match_pairs": None,
        "numeric_tolerance": None,
        "text_mode": "string",
        "correct_bool": None,
        "short_pattern": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _codes(question):
    return [issue.code for issue in _question_issues(question)]


def test_single_question_without_correct_answer_is_reported():
    question = _question(options=[
        _option(1, "A"),
        _option(2, "B"),
        _option(3, "C"),
        _option(4, "D"),
    ])

    assert "missing_correct_answer" in _codes(question)


def test_short_text_and_duplicate_options_are_reported():
    question = _question(text="2+2?", options=[
        _option(1, "4", True),
        _option(2, "4"),
        _option(3, "3"),
        _option(4, "5"),
    ])

    codes = _codes(question)

    assert "short_text" in codes
    assert "invalid_options" in codes


def test_bool_question_without_correct_value_is_reported():
    question = _question(qtype="bool", options=[], correct_bool=None)

    assert "missing_correct_answer" in _codes(question)


def test_valid_order_question_has_no_issues():
    question = _question(
        qtype="order",
        options=[
            _option(1, "Первый", position=1),
            _option(2, "Второй", position=2),
            _option(3, "Третий", position=3),
            _option(4, "Четвертый", position=4),
        ],
    )

    assert _question_issues(question) == []

