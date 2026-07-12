from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient

OLD_PASSWORD = "old-password-123"
NEW_PASSWORD = "new-password-456"


class TestPasswordResetEndToEnd:
    async def test_full_reset_flow(
        self, client: AsyncClient, unique: str, monkeypatch: pytest.MonkeyPatch
    ):
        captured_urls: list[str] = []

        async def capture_instead_of_sending(to_email: str, reset_url: str) -> None:
            captured_urls.append(reset_url)

        # The router resolves the name from its own module at call time
        monkeypatch.setattr("app.routers.auth.send_password_reset_email", capture_instead_of_sending)

        email = f"reset_{unique}@example.com"
        r = await client.post(
            "/auth/register",
            json={"email": email, "username": f"reset_{unique}", "password": OLD_PASSWORD},
        )
        assert r.status_code == 201
        pre_reset_refresh = r.cookies["refresh_token"]

        # request → token issued and mailed
        r = await client.post("/auth/forgot-password", json={"email": email})
        assert r.status_code == 200
        assert len(captured_urls) == 1
        token = parse_qs(urlparse(captured_urls[0]).query)["token"][0]

        # reset succeeds
        r = await client.post(
            "/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
        )
        assert r.status_code == 204

        # the SAME token a second time fails — single-use
        r = await client.post(
            "/auth/reset-password", json={"token": token, "new_password": "attacker-pw-789"}
        )
        assert r.status_code == 400
        assert "already used" in r.json()["detail"]

        # every refresh token issued before the reset is revoked
        client.cookies.clear()
        r = await client.post(
            "/auth/refresh", headers={"Cookie": f"refresh_token={pre_reset_refresh}"}
        )
        assert r.status_code == 401

        # the old password no longer authenticates; the new one does
        r = await client.post("/auth/login", json={"email": email, "password": OLD_PASSWORD})
        assert r.status_code == 401
        r = await client.post("/auth/login", json={"email": email, "password": NEW_PASSWORD})
        assert r.status_code == 200
