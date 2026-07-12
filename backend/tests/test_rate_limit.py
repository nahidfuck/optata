"""Rate limiting behind a reverse proxy, pinned from every direction.

Two independent dimensions per sensitive endpoint: resolved client IP and
submitted email. Each test rotates the OTHER dimension so a 429 can only be
explained by the dimension under test.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.main import app
from app.rate_limit import limiter

FORGOT = "/auth/forgot-password"  # 3/hour — the cheapest limited endpoint to hit


def enable_limiter() -> None:
    limiter.reset()
    limiter.enabled = True


class TestPerIpDimension:
    async def test_limited_per_forwarded_address_not_socket_peer(
        self, client: AsyncClient, unique: str
    ):
        enable_limiter()

        # Socket peer is 127.0.0.1 (trusted) throughout; emails rotate so
        # only the forwarded address can trip anything.
        first_user = {"X-Forwarded-For": "198.51.100.1"}
        for i in range(3):
            r = await client.post(
                FORGOT, json={"email": f"ip_{i}_{unique}@example.com"}, headers=first_user
            )
            assert r.status_code == 200

        r = await client.post(
            FORGOT, json={"email": f"ip_3_{unique}@example.com"}, headers=first_user
        )
        assert r.status_code == 429, "4th request from the same forwarded address must trip 3/hour"

        # A different real client behind the same proxy is NOT locked out
        r = await client.post(
            FORGOT,
            json={"email": f"ip_4_{unique}@example.com"},
            headers={"X-Forwarded-For": "198.51.100.2"},
        )
        assert r.status_code == 200

    async def test_untrusted_peer_cannot_escape_its_bucket_by_rotating_the_header(
        self, client: AsyncClient, unique: str
    ):
        enable_limiter()

        # Direct (untrusted) peer: X-Forwarded-For must be ignored entirely.
        # Emails rotate too, so only the socket peer explains the 429.
        # `client` is a dependency only so get_db stays overridden.
        transport = ASGITransport(app=app, client=("203.0.113.9", 40000))
        async with AsyncClient(transport=transport, base_url="http://test") as spoofer:
            for i in range(3):
                r = await spoofer.post(
                    FORGOT,
                    json={"email": f"sp_{i}_{unique}@example.com"},
                    headers={"X-Forwarded-For": f"10.0.0.{i}"},
                )
                assert r.status_code == 200

            r = await spoofer.post(
                FORGOT,
                json={"email": f"sp_3_{unique}@example.com"},
                headers={"X-Forwarded-For": "10.0.0.99"},
            )
            assert r.status_code == 429, "rotating XFF from an untrusted peer must not reset the bucket"


class TestPerEmailDimension:
    """IP limiting fails behind CGNAT / a misconfigured proxy — the email
    dimension must throttle independently."""

    async def test_forgot_password_limited_per_email_across_ips(
        self, client: AsyncClient, unique: str
    ):
        enable_limiter()

        email = {"email": f"victim_{unique}@example.com"}
        for i in range(3):
            r = await client.post(
                FORGOT, json=email, headers={"X-Forwarded-For": f"198.51.100.{10 + i}"}
            )
            assert r.status_code == 200

        # 4th request for the SAME email from yet another IP → email bucket trips
        r = await client.post(FORGOT, json=email, headers={"X-Forwarded-For": "198.51.100.99"})
        assert r.status_code == 429

        # a different email from a barely-used IP sails through — it really
        # was the email bucket, not an IP one
        r = await client.post(
            FORGOT,
            json={"email": f"other_{unique}@example.com"},
            headers={"X-Forwarded-For": "198.51.100.99"},
        )
        assert r.status_code == 200

    async def test_login_limited_per_email_across_ips(self, client: AsyncClient, unique: str):
        enable_limiter()

        payload = {"email": f"stuffed_{unique}@example.com", "password": "guess-attempt-1"}
        for i in range(10):
            r = await client.post(
                "/auth/login", json=payload, headers={"X-Forwarded-For": f"198.51.100.{100 + i}"}
            )
            assert r.status_code == 401  # unknown email, but each attempt counts

        r = await client.post(
            "/auth/login", json=payload, headers={"X-Forwarded-For": "198.51.100.200"}
        )
        assert r.status_code == 429, "11th attempt on one account must trip even from a fresh IP"


class TestWhoami:
    async def test_disabled_by_default(self, client: AsyncClient):
        r = await client.get("/debug/whoami")
        assert r.status_code == 404

    async def test_xff_resolution_takes_rightmost_untrusted_entry(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
    ):
        # A proxy APPENDS the real client to the right; the leftmost entry is
        # attacker-controlled. Pin the direction so a middleware swap or an
        # uvicorn regression fails loudly.
        monkeypatch.setattr(get_settings(), "debug_whoami", True)

        r = await client.get(
            "/debug/whoami", headers={"X-Forwarded-For": "1.2.3.4, 5.6.7.8"}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["resolved_client_host"] == "5.6.7.8", (
            "must resolve to the RIGHTMOST untrusted entry, never the attacker-controlled leftmost"
        )
        assert body["resolved_client_host"] != "1.2.3.4"
        assert body["rate_limit_key"] == "5.6.7.8"
        assert body["x_forwarded_for"] == "1.2.3.4, 5.6.7.8"
