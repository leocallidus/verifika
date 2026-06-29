from app.services.versioning import score_snapshot_answer


def test_snapshot_scoring_uses_saved_answer_key_not_current_question_state():
    old_snapshot = {
        "question_id": 10,
        "qtype": "single",
        "options": [
            {"option_id": 100, "option_number": 1, "text": "Old correct", "is_correct": True},
            {"option_id": 101, "option_number": 2, "text": "Old wrong", "is_correct": False},
        ],
    }
    changed_current_state = {
        "question_id": 10,
        "qtype": "single",
        "options": [
            {"option_id": 100, "option_number": 1, "text": "Old correct", "is_correct": False},
            {"option_id": 101, "option_number": 2, "text": "Old wrong", "is_correct": True},
        ],
    }

    assert score_snapshot_answer(
        snapshot=old_snapshot,
        selected_option_id=100,
        short_answer_raw=None,
        match_pairs=None,
    ) == (True, 1.0)
    assert score_snapshot_answer(
        snapshot=changed_current_state,
        selected_option_id=100,
        short_answer_raw=None,
        match_pairs=None,
    ) == (False, 0.0)
