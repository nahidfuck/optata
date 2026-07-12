import io
import uuid

from httpx import AsyncClient
from PIL import Image

PASSWORD = "correct-horse-battery"


async def register(client: AsyncClient, name: str) -> tuple[uuid.UUID, dict[str, str]]:
    r = await client.post(
        "/auth/register",
        json={"email": f"{name}@example.com", "username": name, "password": PASSWORD},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return uuid.UUID(body["user"]["id"]), {"Authorization": f"Bearer {body['access_token']}"}


def image_bytes(fmt: str = "PNG", size: tuple[int, int] = (48, 48), color: str = "#AA3355") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, fmt)
    return buf.getvalue()


async def create_item(
    client: AsyncClient,
    auth: dict[str, str],
    title: str = "Film camera",
    **form: str,
) -> dict:
    r = await client.post(
        "/items",
        headers=auth,
        files={"image": ("photo.png", image_bytes(), "image/png")},
        data={"title": title, **form},
    )
    assert r.status_code == 201, r.text
    return r.json()
