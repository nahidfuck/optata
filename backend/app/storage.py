"""Supabase Storage over plain REST with the service key.

The service key lives only in backend settings and these requests —
never in a response body, never anywhere near the frontend.
"""

import httpx
import structlog

from app.config import get_settings

log = structlog.get_logger()

BUCKET = "items"


class StorageError(Exception):
    """Upload failed — the caller decides what the client sees."""


class Storage:
    def _object_url(self, path: str) -> str:
        return f"{get_settings().supabase_url}/storage/v1/object/{BUCKET}/{path}"

    def _auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {get_settings().supabase_service_key}"}

    def public_url(self, path: str) -> str:
        return f"{get_settings().supabase_url}/storage/v1/object/public/{BUCKET}/{path}"

    async def upload_item_image(self, path: str, content: bytes) -> None:
        """Create the object. Keys carry a random component, so uploads never
        overwrite — every stored object is immutable. Raises StorageError."""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    self._object_url(path),
                    headers={**self._auth_headers(), "Content-Type": "image/webp"},
                    content=content,
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            log.exception("storage_upload_failed", path=path)
            raise StorageError from exc

    async def delete_item_image(self, path: str) -> None:
        """Best effort: an orphaned file is harmless, an orphaned row is not —
        so failures are logged and swallowed, never propagated."""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.delete(self._object_url(path), headers=self._auth_headers())
                if response.status_code not in (200, 404):
                    log.warning(
                        "storage_delete_failed", path=path, status=response.status_code
                    )
        except httpx.HTTPError:
            log.exception("storage_delete_failed", path=path)


storage = Storage()
