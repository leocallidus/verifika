from __future__ import annotations

import random
from dataclasses import dataclass
from typing import List


@dataclass
class OptionDTO:
    option_id: int
    option_number: int
    text: str
    is_correct: bool


@dataclass
class QuestionDTO:
    question_id: int
    text: str
    options: List[OptionDTO]


def shuffle_questions(questions: List[QuestionDTO], seed: int | None = None) -> List[QuestionDTO]:
    rng = random.Random(seed)
    return rng.sample(questions, k=len(questions))


def shuffle_options(q: QuestionDTO, seed: int | None = None) -> QuestionDTO:
    rng = random.Random((seed or 0) * 31 + q.question_id)
    opts = list(q.options)
    rng.shuffle(opts)
    return QuestionDTO(question_id=q.question_id, text=q.text, options=opts)


def public_options(q: QuestionDTO) -> List[dict]:
    return [
        {"option_id": o.option_id, "option_number": o.option_number, "option_text": o.text}
        for o in q.options
    ]
