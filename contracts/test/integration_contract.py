"""Real websocket saves, validation, revision checks and device deletion."""

import asyncio
import os

from aiohttp import ClientSession


async def main():
    url, token = os.environ["HA_URL"], os.environ["HA_TOKEN"]
    async with (
        ClientSession(headers={"Authorization": f"Bearer {token}"}) as session,
        session.ws_connect(url.replace("http:", "ws:") + "/api/websocket") as ws,
    ):
        assert (await ws.receive_json())["type"] == "auth_required"
        await ws.send_json({"type": "auth", "access_token": token})
        assert (await ws.receive_json())["type"] == "auth_ok"
        number = 0

        async def command(kind, **fields):
            nonlocal number
            number += 1
            await ws.send_json({"id": number, "type": kind, **fields})
            result = await ws.receive_json()
            assert result["id"] == number, result
            return result

        result = await command("lunactl/devices")
        assert result["success"], result
        device = result["result"][0]
        device_id = device["device_id"]
        manifest = device["manifest"]
        result = await command(
            "lunactl/manifest/save",
            device_id=device_id,
            manifest={**manifest, "pages": []},
            revision=1,
        )
        assert (
            not result["success"] and result["error"]["code"] == "invalid_manifest"
        ), result
        result = await command(
            "lunactl/manifest/save",
            device_id=device_id,
            manifest=manifest,
            revision=1,
        )
        assert result["success"] and result["result"]["revision"] == 2, result
        result = await command(
            "lunactl/manifest/save",
            device_id=device_id,
            manifest=manifest,
            revision=1,
        )
        assert not result["success"] and result["error"]["code"] == "stale_revision", (
            result
        )
        result = await command("lunactl/manifest/get", device_id=device_id)
        assert (
            result["result"]["manifest"] == manifest
            and result["result"]["revision"] == 2
        ), result
        async with session.post(
            url + "/api/services/lunactl_contract/remove_device?return_response",
            json={},
        ) as response:
            assert response.status == 200, await response.text()
        # Registry event callbacks run asynchronously after removing the device.
        for _ in range(50):
            async with session.post(
                url + "/api/services/lunactl/manifest?return_response",
                json={"mac": "aa:bb:cc:dd:ee:ff"},
            ) as response:
                result = await response.json()
            if result["service_response"] == {}:
                break
            await asyncio.sleep(0.1)
        assert result["service_response"] == {}, result
        result = await command("lunactl/devices")
        assert result["result"] == [], result
    print("PASS: disposable HA config entry, read/save/validate/stale revision/delete")


asyncio.run(main())
