from __future__ import annotations

import email_validator

_real_validate_email = email_validator.validate_email


def _patched_validate_email(email, *args, **kwargs):
    """Allow any syntactically valid email in dev / test environments.

    Production deployments should rely on SMTP probe instead. This monkey-patch
    keeps Python-shaped validation but skips the 'reserved TLD' / 'globally
    deliverable DNS' checks that Pydantic's EmailStr enforces by default.
    """
    kwargs.setdefault("check_deliverability", False)
    kwargs.setdefault("test_environment", True)
    return _real_validate_email(email, *args, **kwargs)


if not getattr(email_validator, "_patched_by_sts", False):
    email_validator.validate_email = _patched_validate_email
    email_validator._patched_by_sts = True
