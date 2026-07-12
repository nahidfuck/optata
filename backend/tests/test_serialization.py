"""Pin tech-spec §4.1: the owner must never learn an item is reserved.

These assert on KEY ABSENCE, not values — they fail loudly the moment
someone unifies ItemOwnerOut and ItemGuestOut into one schema.
"""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item, Reservation

PASSWORD = "correct-horse-battery"


async def register(client: AsyncClient, name: str):
    r = await client.post(
        "/auth/register",
        json={"email": f"{name}@example.com", "username": name, "password": PASSWORD},
    )
    assert r.status_code == 201
    body = r.json()
    return uuid.UUID(body["user"]["id"]), {"Authorization": f"Bearer {body['access_token']}"}


class TestReservationNeverLeaksToOwner:
    async def test_payload_shapes_for_owner_guest_and_anonymous(
        self, client: AsyncClient, db_session: AsyncSession, unique: str
    ):
        owner_id, owner_auth = await register(client, f"owner_{unique}")
        guest_id, guest_auth = await register(client, f"guest_{unique}")

        # No item endpoints until Stage 2 — seed directly
        item = Item(
            user_id=owner_id,
            title="Film camera",
            image_url="https://example.com/cam.webp",
            image_path=f"{owner_id}/cam.webp",
            order_index=0,
        )
        db_session.add(item)
        await db_session.commit()
        db_session.add(Reservation(item_id=item.id, reserver_id=guest_id))
        await db_session.commit()

        profile_url = f"/users/owner_{unique}"

        # guest (the reserver): sees reservation state, never view_count
        r = await client.get(profile_url, headers=guest_auth)
        assert r.status_code == 200
        guest_item = r.json()["items"][0]
        assert "view_count" not in guest_item
        assert guest_item["is_reserved"] is True
        assert guest_item["reserved_by_me"] is True

        # anonymous: same shape, reserved_by_me is false
        r = await client.get(profile_url)
        anon_item = r.json()["items"][0]
        assert "view_count" not in anon_item
        assert anon_item["is_reserved"] is True
        assert anon_item["reserved_by_me"] is False

        # OWNER of a RESERVED item: no reservation key exists at all
        r = await client.get(profile_url, headers=owner_auth)
        assert r.status_code == 200
        body = r.json()
        assert body["is_owner"] is True
        owner_item = body["items"][0]
        assert "is_reserved" not in owner_item
        assert "reserved_by_me" not in owner_item
        assert owner_item["view_count"] == 0
