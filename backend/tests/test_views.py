import uuid

from httpx import AsyncClient

from tests.helpers import create_item, register


async def owner_view_count(client: AsyncClient, username: str, auth: dict, item_id: str) -> int:
    r = await client.get(f"/users/{username}", headers=auth)
    return next(i["view_count"] for i in r.json()["items"] if i["id"] == item_id)


class TestViews:
    async def test_same_batch_twice_counts_once(self, client: AsyncClient, unique: str):
        owner_name = f"vowner_{unique}"
        _, owner_auth = await register(client, owner_name)
        item = await create_item(client, owner_auth)

        # anonymous viewer: first call sets the anon cookie
        r = await client.post("/items/views", json={"item_ids": [item["id"]]})
        assert r.status_code == 204
        assert "anon_id" in r.cookies

        # same session repeats the batch — idempotent
        r = await client.post("/items/views", json={"item_ids": [item["id"], item["id"]]})
        assert r.status_code == 204

        assert await owner_view_count(client, owner_name, owner_auth, item["id"]) == 1

    async def test_distinct_identities_count_separately(self, client: AsyncClient, unique: str):
        owner_name = f"downer_{unique}"
        _, owner_auth = await register(client, owner_name)
        item = await create_item(client, owner_auth)

        # anonymous session
        await client.post("/items/views", json={"item_ids": [item["id"]]})
        # authenticated viewer = a different identity
        _, guest_auth = await register(client, f"dguest_{unique}")
        await client.post("/items/views", json={"item_ids": [item["id"]]}, headers=guest_auth)

        assert await owner_view_count(client, owner_name, owner_auth, item["id"]) == 2

    async def test_owners_own_views_never_count(self, client: AsyncClient, unique: str):
        # The server knows who owns the item — this rule can't be left to
        # whatever client happens to call the API.
        owner_name = f"self_{unique}"
        _, owner_auth = await register(client, owner_name)
        item = await create_item(client, owner_auth)

        r = await client.post("/items/views", json={"item_ids": [item["id"]]}, headers=owner_auth)
        assert r.status_code == 204
        assert await owner_view_count(client, owner_name, owner_auth, item["id"]) == 0

        # an anonymous viewer still counts
        await client.post("/items/views", json={"item_ids": [item["id"]]})
        assert await owner_view_count(client, owner_name, owner_auth, item["id"]) == 1

    async def test_unknown_ids_never_error(self, client: AsyncClient, unique: str):
        owner_name = f"uowner2_{unique}"
        _, owner_auth = await register(client, owner_name)
        item = await create_item(client, owner_auth)

        r = await client.post(
            "/items/views",
            json={"item_ids": [str(uuid.uuid4()), item["id"], str(uuid.uuid4())]},
        )
        assert r.status_code == 204
        assert await owner_view_count(client, owner_name, owner_auth, item["id"]) == 1

    async def test_empty_batch_is_a_quiet_204(self, client: AsyncClient):
        r = await client.post("/items/views", json={"item_ids": []})
        assert r.status_code == 204
