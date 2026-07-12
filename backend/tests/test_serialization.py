"""Pin tech-spec §4.1: the owner must never learn an item is reserved.

The single most important test in this codebase. Everything goes through
the real endpoints — item created via POST /items, reserved via
POST /items/{id}/reserve — and every assertion is on KEY ABSENCE, not on
values, so it fails loudly the moment someone unifies ItemOwnerOut and
ItemGuestOut into one schema.
"""

from httpx import AsyncClient

from tests.helpers import create_item, register


class TestReservationNeverLeaksToOwner:
    async def test_payload_shapes_for_owner_guest_and_anonymous(
        self, client: AsyncClient, unique: str
    ):
        owner_name = f"owner_{unique}"
        _, owner_auth = await register(client, owner_name)
        item = await create_item(client, owner_auth, title="Film camera")
        _, guest_auth = await register(client, f"guest_{unique}")

        r = await client.post(f"/items/{item['id']}/reserve", headers=guest_auth)
        assert r.status_code == 201

        profile_url = f"/users/{owner_name}"

        # the reserving guest: reservation state, never view_count
        r = await client.get(profile_url, headers=guest_auth)
        assert r.status_code == 200
        guest_item = r.json()["items"][0]
        assert "view_count" not in guest_item
        assert guest_item["is_reserved"] is True
        assert guest_item["reserved_by_me"] is True

        # anonymous: same shape, reserved_by_me false
        r = await client.get(profile_url)
        anon_item = r.json()["items"][0]
        assert "view_count" not in anon_item
        assert anon_item["is_reserved"] is True
        assert anon_item["reserved_by_me"] is False

        # THE OWNER OF A RESERVED ITEM: no reservation key exists at all
        r = await client.get(profile_url, headers=owner_auth)
        assert r.status_code == 200
        body = r.json()
        assert body["is_owner"] is True
        owner_item = body["items"][0]
        assert "is_reserved" not in owner_item
        assert "reserved_by_me" not in owner_item
        assert owner_item["view_count"] == 0

    async def test_create_and_patch_responses_carry_no_reservation_keys(
        self, client: AsyncClient, unique: str
    ):
        # The owner's OTHER windows into an item — create and edit responses —
        # must be equally blind, even while the item is reserved.
        _, owner_auth = await register(client, f"owner2_{unique}")
        created = await create_item(client, owner_auth)
        assert "is_reserved" not in created and "reserved_by_me" not in created

        _, guest_auth = await register(client, f"guest2_{unique}")
        await client.post(f"/items/{created['id']}/reserve", headers=guest_auth)

        r = await client.patch(
            f"/items/{created['id']}", headers=owner_auth, data={"title": "Still blind"}
        )
        patched = r.json()
        assert "is_reserved" not in patched
        assert "reserved_by_me" not in patched
        assert "view_count" in patched
