from fastapi import Request
from slowapi import Limiter


def client_ip(request: Request) -> str:
    """Rate-limit key: the real client IP.

    Behind the reverse proxy the socket peer is the proxy, so keying on it
    would put every user in one bucket. ProxyHeadersMiddleware (main.py) has
    already resolved the X-Forwarded-For chain into request.client — and only
    for peers listed in FORWARDED_ALLOW_IPS, so an untrusted client cannot
    escape its bucket by rotating the header.
    """
    return request.client.host if request.client else "127.0.0.1"


def identifier_key(request: Request) -> str:
    """Second, IP-independent rate-limit dimension: the submitted identifier.

    IP limiting is fragile behind proxies and useless behind CGNAT — if the
    IP resolution is ever wrong in production, credential stuffing must still
    be throttled per account. A stash dependency on the endpoint puts the
    normalized email into request.state before this runs.
    """
    return getattr(request.state, "rate_limit_identifier", "missing-identifier")


# In-memory storage is enough: Render runs a single instance.
limiter = Limiter(key_func=client_ip)
