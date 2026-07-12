from httpx import AsyncClient

from tests.helpers import create_item, register


class TestReserve:
    async def test_guest_reserves_then_second_guest_gets_409(
        self, client: AsyncClient, unique: str
    ):
        _, owner_auth = await register(client, f"rowner_{unique}")
        item = await create_item(client, owner_auth)
        _, guest_auth = await register(client, f"rguest_{unique}")
        _, late_auth = await register(client, f"rlate_{unique}")

        r = await client.post(f"/items/{item['id']}/reserve", headers=guest_auth)
        assert r.status_code == 201
        assert r.json()["item_id"] == item["id"]

        r = await client.post(f"/items/{item['id']}/reserve", headers=late_auth)
        assert r.status_code == 409

        # reserving twice yourself is also a 409, not a silent success
        r = await client.post(f"/items/{item['id']}/reserve", headers=guest_auth)
        assert r.status_code == 409

    async def test_own_item_is_403(self, client: AsyncClient, unique: str):
        _, owner_auth = await register(client, f"selfres_{unique}")
        item = await create_item(client, owner_auth)
        r = await client.post(f"/items/{item['id']}/reserve", headers=owner_auth)
        assert r.status_code == 403

    async def test_unauthenticated_is_401(self, client: AsyncClient, unique: str):
        _, owner_auth = await register(client, f"anonres_{unique}")
        item = await create_item(client, owner_auth)
        r = await client.post(f"/items/{item['id']}/reserve")
        assert r.status_code == 401


class TestUnreserve:
    async def test_own_reservation_released_others_kept_out(
        self, client: AsyncClient, unique: str
    ):
        _, owner_auth = await register(client, f"uowner_{unique}")
        item = await create_item(client, owner_auth)
        _, guest_auth = await register(client, f"uguest_{unique}")
        _, other_auth = await register(client, f"uother_{unique}")

        await client.post(f"/items/{item['id']}/reserve", headers=guest_auth)

        # someone else can't release my reservation
        r = await client.delete(f"/items/{item['id']}/reserve", headers=other_auth)
        assert r.status_code == 404

        r = await client.delete(f"/items/{item['id']}/reserve", headers=guest_auth)
        assert r.status_code == 204

        # item is free again
        r = await client.post(f"/items/{item['id']}/reserve", headers=other_auth)
        assert r.status_code == 201


class TestMyReservations:
    async def test_list_shows_item_and_owner(self, client: AsyncClient, unique: str):
        _, owner_auth = await register(client, f"lowner_{unique}")
        item = await create_item(client, owner_auth, title="Vinyl player")
        _, guest_auth = await register(client, f"lguest_{unique}")

        await client.post(f"/items/{item['id']}/reserve", headers=guest_auth)

        r = await client.get("/reservations", headers=guest_auth)
        assert r.status_code == 200
        entries = r.json()
        assert len(entries) == 1
        assert entries[0]["item"]["title"] == "Vinyl player"
        assert entries[0]["item"]["owner_username"] == f"lowner_{unique}"
        assert entries[0]["tombstone"] is None
        assert "id" in entries[0]
        assert "view_count" not in entries[0]["item"]

    async def test_deleted_item_surfaces_as_rich_tombstone_and_can_be_dismissed(
        self, client: AsyncClient, unique: str
    ):
        # A tombstone must answer "what did I promise, and to whom" —
        # a bare `item: null` pins the mechanism while the feature is useless.
        owner_name = f"towner_{unique}"
        _, owner_auth = await register(client, owner_name)
        item = await create_item(client, owner_auth, title="Soon gone")
        _, guest_auth = await register(client, f"tguest_{unique}")
        _, other_auth = await register(client, f"tother_{unique}")

        await client.post(f"/items/{item['id']}/reserve", headers=guest_auth)

        r = await client.delete(f"/items/{item['id']}", headers=owner_auth)
        assert r.status_code == 204

        r = await client.get("/reservations", headers=guest_auth)
        entries = r.json()
        assert len(entries) == 1, "the reservation must NOT vanish silently"
        entry = entries[0]
        assert entry["item"] is None
        assert entry["tombstone"]["title"] == "Soon gone"
        assert entry["tombstone"]["owner_username"] == owner_name

        # nobody else can dismiss it
        r = await client.delete(f"/reservations/{entry['id']}", headers=other_auth)
        assert r.status_code == 404

        # the reserver can — a tombstone has an exit
        r = await client.delete(f"/reservations/{entry['id']}", headers=guest_auth)
        assert r.status_code == 204
        r = await client.get("/reservations", headers=guest_auth)
        assert r.json() == []
