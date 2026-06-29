from __future__ import annotations

import io
import json
import uuid
import pytest
from PIL import Image
from sqlalchemy import select, desc

from app.db.models import AuditLog, UserAvatarImage, AuthSession, AppBrandingSettings, BrandingAsset
from app.db.session import SessionLocal
from app.core.security import decode_token

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> dict:
    # If the user is admin, use Passw0rd!Admin by default
    if identifier == "admin" and password == "Passw0rd!Test":
        password = "Passw0rd!Admin"
    r = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def create_test_image(fmt="PNG", size=(200, 200)) -> bytes:
    img = Image.new("RGB", size, color="red")
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


async def get_latest_audit(session, action: str) -> AuditLog | None:
    res = await session.execute(
        select(AuditLog).where(AuditLog.action == action).order_by(desc(AuditLog.created_at)).limit(1)
    )
    return res.scalar_one_or_none()


async def test_public_branding_endpoints(client):
    # Public branding should be readable without auth
    r = await client.get("/api/v2/profile-branding/public/branding")
    assert r.status_code == 200
    data = r.json()
    assert data["app_name"] == "Верифика"
    assert data["institution_logo_display_size_px"] == 56


async def test_avatar_upload_and_management(client):
    auth_data = await login(client, "ivanov")
    token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload valid avatar (PNG)
    img_bytes = create_test_image("PNG")
    r = await client.post(
        "/api/v2/profile-branding/avatars",
        files={"file": ("avatar.png", img_bytes, "image/png")},
        data={"crop_json": '{"x": 0, "y": 0, "width": 100, "height": 100}'},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    avatar_data = r.json()
    assert avatar_data["is_active"] is True
    avatar_id = avatar_data["avatar_id"]

    # Verify we can fetch it
    r_get = await client.get(f"/api/v2/profile-branding/avatars/{avatar_id}", headers=headers)
    assert r_get.status_code == 200

    # Reject invalid format (e.g. SVG)
    r_bad = await client.post(
        "/api/v2/profile-branding/avatars",
        files={"file": ("avatar.svg", b"<svg></svg>", "image/svg+xml")},
        headers=headers,
    )
    assert r_bad.status_code == 400

    # Upload another avatar
    r2 = await client.post(
        "/api/v2/profile-branding/avatars",
        files={"file": ("avatar2.png", img_bytes, "image/png")},
        headers=headers,
    )
    assert r2.status_code == 200
    avatar2_id = r2.json()["avatar_id"]

    # First avatar should be inactive now
    r_list = await client.get("/api/v2/profile-branding/avatars", headers=headers)
    assert r_list.status_code == 200
    items = r_list.json()["items"]
    assert len(items) >= 2
    
    # Switch back to the first avatar
    r_act = await client.post(f"/api/v2/profile-branding/avatars/{avatar_id}/activate", headers=headers)
    assert r_act.status_code == 200
    assert r_act.json()["is_active"] is True

    # Delete the second avatar
    r_del = await client.delete(f"/api/v2/profile-branding/avatars/{avatar2_id}", headers=headers)
    assert r_del.status_code == 204


async def test_avatar_history_limit(client):
    auth_data = await login(client, "petrova")
    token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    img_bytes = create_test_image("PNG")
    # Upload 13 avatars
    for i in range(13):
        r = await client.post(
            "/api/v2/profile-branding/avatars",
            files={"file": (f"avatar_{i}.png", img_bytes, "image/png")},
            headers=headers,
        )
        assert r.status_code == 200

    # History should be limited to 12
    r_list = await client.get("/api/v2/profile-branding/avatars", headers=headers)
    assert r_list.status_code == 200
    items = r_list.json()["items"]
    assert len(items) <= 12


async def test_sessions_creation_and_jwt_claims(client):
    auth_data = await login(client, "ivanov")
    token = auth_data["access_token"]
    sid = auth_data["auth_session_id"]
    assert sid is not None

    # Decode JWT to check jti and sid claims
    claims = decode_token(token)
    assert claims["jti"] is not None
    assert claims["sid"] == sid


async def test_session_revocation_and_auth_block(client):
    auth_data = await login(client, "ivanov")
    token = auth_data["access_token"]
    sid = auth_data["auth_session_id"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify session is listed
    r_list = await client.get("/api/v2/profile-branding/sessions", headers=headers)
    assert r_list.status_code == 200
    sessions = r_list.json()["items"]
    current_session = next((s for s in sessions if s["is_current"]), None)
    assert current_session is not None
    assert current_session["auth_session_id"] == sid

    # Revoke the session
    r_rev = await client.delete(f"/api/v2/profile-branding/sessions/{sid}", headers=headers)
    assert r_rev.status_code == 204

    # Subsequent request using the token should be rejected (401)
    r_blocked = await client.get("/api/v2/profile-branding/sessions", headers=headers)
    assert r_blocked.status_code == 401


async def test_revoke_all_other_sessions(client):
    # Log in twice to get 2 active sessions
    auth1 = await login(client, "petrova")
    auth2 = await login(client, "petrova")
    
    t1, sid1 = auth1["access_token"], auth1["auth_session_id"]
    t2, sid2 = auth2["access_token"], auth2["auth_session_id"]
    
    h2 = {"Authorization": f"Bearer {t2}"}

    # From session 2, revoke all other sessions
    r_rev = await client.delete("/api/v2/profile-branding/sessions?include_current=false", headers=h2)
    assert r_rev.status_code == 200
    assert r_rev.json()["revoked_count"] >= 1

    # Session 1 should be blocked now
    r_blocked = await client.get("/api/v2/profile-branding/sessions", headers={"Authorization": f"Bearer {t1}"})
    assert r_blocked.status_code == 401

    # Session 2 should still be authorized
    r_ok = await client.get("/api/v2/profile-branding/sessions", headers=h2)
    assert r_ok.status_code == 200


async def test_admin_branding_management(client):
    admin_auth = await login(client, "admin")
    admin_headers = {"Authorization": f"Bearer {admin_auth['access_token']}"}

    student_auth = await login(client, "ivanov")
    student_headers = {"Authorization": f"Bearer {student_auth['access_token']}"}

    # 1. Non-admin should be forbidden from changing branding
    r_patch_fail = await client.patch(
        "/api/v2/profile-branding/admin/branding",
        json={"app_name": "HackName"},
        headers=student_headers,
    )
    assert r_patch_fail.status_code == 403

    # 2. Admin uploads branding assets
    img_bytes = create_test_image("PNG")
    r_topbar = await client.post(
        "/api/v2/profile-branding/admin/branding/assets/topbar_logo",
        files={"file": ("topbar.png", img_bytes, "image/png")},
        headers=admin_headers,
    )
    assert r_topbar.status_code == 200
    topbar_asset_id = r_topbar.json()["asset_id"]

    r_inst = await client.post(
        "/api/v2/profile-branding/admin/branding/assets/institution_logo",
        files={"file": ("logo.png", img_bytes, "image/png")},
        headers=admin_headers,
    )
    assert r_inst.status_code == 200
    inst_asset_id = r_inst.json()["asset_id"]

    # 3. Apply settings
    r_apply = await client.patch(
        "/api/v2/profile-branding/admin/branding",
        json={
            "app_name": "Новая Верифика",
            "topbar_logo_asset_id": topbar_asset_id,
            "institution_logo_asset_id": inst_asset_id,
            "institution_logo_display_size_px": 64,
        },
        headers=admin_headers,
    )
    assert r_apply.status_code == 200
    assert r_apply.json()["app_name"] == "Новая Верифика"

    # 4. Check public branding matches updated settings
    r_pub = await client.get("/api/v2/profile-branding/public/branding")
    assert r_pub.status_code == 200
    pub_data = r_pub.json()
    assert pub_data["app_name"] == "Новая Верифика"
    assert pub_data["institution_logo_display_size_px"] == 64
    assert f"public/branding-assets/{topbar_asset_id}" in pub_data["topbar_logo_url"]
