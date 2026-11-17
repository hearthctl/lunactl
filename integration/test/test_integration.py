"""Acceptance tests against Home Assistant 2026.9.3, without device hardware."""

import json
import re
from copy import deepcopy
from datetime import timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.helpers import (
    area_registry as ar,
)
from homeassistant.helpers import (
    device_registry as dr,
)
from homeassistant.helpers import (
    entity_registry as er,
)
from homeassistant.helpers import (
    floor_registry as fr,
)
from homeassistant.helpers import (
    issue_registry as ir,
)
from homeassistant.helpers import (
    label_registry as lr,
)
from homeassistant.util import dt as dt_util
from jsonschema import Draft202012Validator
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.lunactl.manifest import ManifestError, load_schemas

pytestmark = pytest.mark.asyncio


async def test_save_validate_revision_and_persistence(hass, setup, manifest):
    store, device, _ = setup
    assert store.read(device.id)["revision"] == 0
    result = await store.async_save(device.id, manifest, 0)
    assert result["revision"] == 1
    assert result["manifest"] == manifest
    for invalid in (
        {},
        {**manifest, "unexpected": True},
        {**manifest, "pages": []},
        {**manifest, "display": {"timeout": 0}},
        {**manifest, "buttons": {"a_short": None}},
        {
            **manifest,
            "buttons": {
                "a_short": {"action": "script.x", "data": {"text": "a" * 32768}}
            },
        },
    ):
        with pytest.raises(ManifestError, match="."):
            await store.async_save(device.id, invalid, 1)
        assert store.read(device.id)["manifest"] == manifest
        assert store.read(device.id)["revision"] == 1
    with pytest.raises(ManifestError, match="Manifest wurde inzwischen geändert"):
        await store.async_save(device.id, manifest, 0)
    assert (await store.storage.async_load())[device.id]["revision"] == 1
    with (
        patch.object(store.storage, "async_save", side_effect=OSError("disk full")),
        pytest.raises(OSError),
    ):
        await store.async_save(device.id, manifest, 1)
    assert store.read(device.id)["revision"] == 1
    response = await hass.services.async_call(
        "lunactl",
        "manifest",
        {"mac": "AA:BB:CC:DD:EE:FF"},
        blocking=True,
        return_response=True,
    )
    assert response == manifest
    response["pages"].clear()
    assert store.read(device.id)["manifest"] == manifest
    assert (
        await hass.services.async_call(
            "lunactl",
            "manifest",
            {"mac": "00:00:00:00:00:00"},
            blocking=True,
            return_response=True,
        )
        == {}
    )


async def test_debounce_and_offline(hass, setup, manifest, freezer):
    store, device, entity = setup
    hass.states.async_set(entity.entity_id, "2026-01-01T00:00:00Z")
    pressed = AsyncMock()
    hass.services.async_register("button", "press", pressed)

    async def advance(seconds):
        freezer.tick(timedelta(seconds=seconds))
        async_fire_time_changed(hass, dt_util.utcnow())
        await hass.async_block_till_done()

    await store.async_save(device.id, manifest, 0)
    await advance(9)
    pressed.assert_not_called()
    await store.async_save(device.id, manifest, 1)
    await advance(9)
    pressed.assert_not_called()
    await store.async_save(device.id, manifest, 2)
    await advance(9)
    pressed.assert_not_called()
    await advance(1)
    pressed.assert_awaited_once()
    assert pressed.call_args.args[0].data == {"entity_id": entity.entity_id}
    await advance(20)
    pressed.assert_awaited_once()
    await store.async_save(device.id, manifest, 3)
    hass.states.async_set(entity.entity_id, "unavailable")
    await advance(10)
    pressed.assert_awaited_once()
    hass.states.async_set(entity.entity_id, "2026-01-01T00:00:01Z")
    await advance(20)
    pressed.assert_awaited_once()


async def test_delete_device(hass, setup, manifest):
    store, device, _ = setup
    await store.async_save(device.id, manifest, 0)
    assert ir.async_get(hass).async_get_issue("lunactl", device.id)
    dr.async_get(hass).async_remove_device(device.id)
    await hass.async_block_till_done()
    assert device.id not in store.records
    assert device.id not in store.pending
    assert not ir.async_get(hass).async_get_issue("lunactl", device.id)
    assert store.fetch("AA:BB:CC:DD:EE:FF") == {}
    assert device.id not in await store.storage.async_load()


@pytest.mark.parametrize(
    "old,new",
    [
        ("sensor.old", "sensor.new"),
        ("timer.old", "timer.new"),
        ("script.old", "script.new"),
    ],
)
async def test_rename_all_fields(hass, setup, manifest, old, new):
    store, device, _ = setup
    registry = er.async_get(hass)
    entity = registry.async_get_or_create(
        old.split(".")[0], "test", old, suggested_object_id="old"
    )
    assert entity.entity_id == old
    item = manifest["pages"][0]["item"]
    item["value"] = {"format": "{0}", "refs": [{"entity": old}]}
    if old.startswith("timer."):
        item["countdown"] = old
    item["action"] = {
        "action": old if old.startswith("script.") else "light.turn_on",
        "target": {"entity_id": [old, "light.keep"]},
        "data": {"entity_id": old, "nested": [old]},
    }
    manifest["buttons"] = {
        "a_short": {
            "action": item["action"]["action"],
            "target": {"entity_id": old},
            "data": {"text": old},
        }
    }
    manifest["display"] = {"brightness": old}
    manifest["pages"].append(
        {
            "type": "pie",
            "quarters": [deepcopy(item), None, None, None],
            "center": deepcopy(item),
        }
    )
    await store.async_save(device.id, manifest, 0)
    # Same reference is followed in every stored Manifest, even offline devices.
    second = dr.async_get(hass).async_get_or_create(
        config_entry_id=next(iter(device.config_entries)),
        identifiers={("esphome", "second")},
        manufacturer="hearthctl",
        model="lunactl",
        sw_version=device.sw_version,
    )
    await store.async_save(second.id, manifest, 0)
    registry.async_update_entity(old, new_entity_id=new)
    await hass.async_block_till_done()
    for device_id in (device.id, second.id):
        result = store.read(device_id)
        assert result["revision"] == 2
        updated = result["manifest"]
        assert updated["display"]["brightness"] == new
        for current in (
            updated["pages"][0]["item"],
            updated["pages"][1]["quarters"][0],
            updated["pages"][1]["center"],
        ):
            assert current["value"]["refs"][0]["entity"] == new
            assert current["action"]["target"]["entity_id"] == [new, "light.keep"]
            assert current["action"]["data"] == {"entity_id": old, "nested": [old]}
            if old.startswith("timer."):
                assert current["countdown"] == new
            if old.startswith("script."):
                assert current["action"]["action"] == new
        assert updated["buttons"]["a_short"]["target"]["entity_id"] == new
        assert updated["buttons"]["a_short"]["data"] == {"text": old}
        assert device_id in store.pending


async def test_repairs_all_registries_and_startup(hass, setup, manifest):
    store, device, _ = setup
    devices, areas, floors, labels, entities = (
        dr.async_get(hass),
        ar.async_get(hass),
        fr.async_get(hass),
        lr.async_get(hass),
        er.async_get(hass),
    )
    area = areas.async_create("Room")
    floor = floors.async_create("Floor")
    label = labels.async_create("Label")
    other = devices.async_get_or_create(
        config_entry_id=next(iter(device.config_entries)),
        identifiers={("test", "other")},
    )
    entity = entities.async_get_or_create("sensor", "test", "existing")
    target = {
        "device_id": other.id,
        "area_id": area.id,
        "floor_id": floor.floor_id,
        "label_id": label.label_id,
        "entity_id": entity.entity_id,
    }
    manifest["pages"][0]["item"]["action"]["target"] = target
    await store.async_save(device.id, manifest, 0)
    issues = ir.async_get(hass)
    assert not issues.async_get_issue("lunactl", device.id)
    for remove, key, value in (
        (entities.async_remove, "entity_id", entity.entity_id),
        (devices.async_remove_device, "device_id", other.id),
        (areas.async_delete, "area_id", area.id),
        (floors.async_delete, "floor_id", floor.floor_id),
        (labels.async_delete, "label_id", label.label_id),
    ):
        remove(value)
        await hass.async_block_till_done()
        issue = issues.async_get_issue("lunactl", device.id)
        assert f"{key}: {value}" in issue.translation_placeholders["references"]
    # Re-evaluation at startup restores the issue from persistent storage.
    store.close()
    issues.async_delete("lunactl", device.id)
    await store.async_load()
    assert issues.async_get_issue("lunactl", device.id)
    await store.async_save(
        device.id,
        {
            "schema": 1,
            "pages": [
                {
                    "type": "single",
                    "item": {
                        "label": "Resolved",
                        "color": "#123456",
                        "action": {"action": "light.turn_on"},
                    },
                }
            ],
        },
        1,
    )
    assert not issues.async_get_issue("lunactl", device.id)
    manifest["pages"][0]["item"]["action"]["target"] = {"entity_id": "sensor.restored"}
    await store.async_save(device.id, manifest, 2)
    assert issues.async_get_issue("lunactl", device.id)
    hass.states.async_set("sensor.restored", "1")
    await hass.async_block_till_done()
    assert not issues.async_get_issue("lunactl", device.id)


async def test_firmware_matrix_and_lowest_schema(hass, setup, manifest):
    store, device, _ = setup
    # A future additive schema fixture proves the algorithm without shipping v2.
    schema2 = deepcopy(load_schemas()[1].schema)
    schema2["properties"]["schema"]["const"] = 2
    schema2["properties"]["future"] = {"type": "boolean"}
    store.schemas[2] = Draft202012Validator(schema2)
    for version, maximum in (
        ("1.0 (ESPHome 2026.10.2)", 1),
        ("2.0 (ESPHome 2026.10.2)", 2),
        ("3.1 (ESPHome 2026.10.2)", 3),
    ):
        dr.async_get(hass).async_update_device(device.id, sw_version=version)
        revision = store.read(device.id)["revision"]
        result = await store.async_save(device.id, {**manifest, "schema": 2}, revision)
        assert result["manifest"]["schema"] == 1
        assert result["schema_version"] == maximum
        if maximum == 1:
            with pytest.raises(ManifestError):
                await store.async_save(
                    device.id, {**manifest, "future": True}, result["revision"]
                )
        else:
            saved = await store.async_save(
                device.id, {**manifest, "future": True}, result["revision"]
            )
            assert saved["manifest"]["schema"] == 2
            assert saved["required_firmware"] == "2.0"
    before = store.read(device.id)
    dr.async_get(hass).async_update_device(
        device.id, sw_version="1.0 (ESPHome 2026.10.2)"
    )
    assert store.fetch("aa:bb:cc:dd:ee:ff") == before["manifest"]
    assert store.read(device.id)["required_firmware"] == "2.0"
    for invalid in (
        None,
        "",
        "ESPHome 2026.10.2",
        "bad",
        "1.0garbage",
        "0.1 (ESPHome 2026.10.2)",
    ):
        dr.async_get(hass).async_update_device(device.id, sw_version=invalid)
        with pytest.raises(ManifestError, match="Firmware-Version unbekannt"):
            await store.async_save(device.id, manifest, before["revision"])
        assert store.read(device.id)["manifest"] == before["manifest"]


async def test_device_status_and_restart_prediction(hass, setup, manifest):
    store, device, entity = setup
    assert not store.read(device.id)["online"]
    # An available button has unknown state until its first press.
    hass.states.async_set(entity.entity_id, "unknown")
    assert store.read(device.id)["online"]
    hass.states.async_set(entity.entity_id, "2026-01-01T00:00:00Z")
    assert store.read(device.id)["online"]
    assert not (await store.async_save(device.id, manifest, 0))["will_restart"]
    store.fetch("aa:bb:cc:dd:ee:ff")
    manifest["display"] = {"brightness": "sensor.brightness"}
    assert (await store.async_save(device.id, manifest, 1))["will_restart"]
    store.fetch("aa:bb:cc:dd:ee:ff")
    assert not (await store.async_save(device.id, manifest, 2))["will_restart"]
    manifest["pages"][0]["item"]["value"] = {
        "format": "{0}",
        "refs": [{"entity": "sensor.brightness", "attribute": "level"}],
    }
    assert (await store.async_save(device.id, manifest, 3))["will_restart"]
    hass.states.async_set(entity.entity_id, "unavailable")
    assert not store.read(device.id)["online"]


async def test_websocket_and_config_flow(hass, setup, manifest, hass_ws_client):
    _store, device, _ = setup
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "lunactl/devices"})
    result = await client.receive_json()
    assert result["success"]
    assert result["result"][0]["device_id"] == device.id
    for number, revision, success in ((2, 0, True), (3, 0, False)):
        await client.send_json(
            {
                "id": number,
                "type": "lunactl/manifest/save",
                "device_id": device.id,
                "revision": revision,
                "manifest": manifest,
            }
        )
        result = await client.receive_json()
        assert result["success"] == success
        if not success:
            assert result["error"]["code"] == "stale_revision"
    await client.send_json(
        {"id": 4, "type": "lunactl/manifest/get", "device_id": device.id}
    )
    result = await client.receive_json()
    assert result["result"]["revision"] == 1
    flow = await hass.config_entries.flow.async_init(
        "lunactl", context={"source": "user"}
    )
    assert flow["type"] == "abort"
    assert flow["reason"] == "single_instance_allowed"


async def test_schema_packaging_and_firmware_version():
    root = Path(__file__).resolve().parents[2]
    for path in (root / "schema").glob("manifest.v*.schema.json"):
        assert (
            path.read_bytes()
            == (root / "custom_components/lunactl/schema" / path.name).read_bytes()
        )
    yaml = (root / "esphome/lunactl.yaml").read_text()
    assert "name: hearthctl.lunactl" in yaml
    major = int(
        re.search(r'project:\s+name: hearthctl.lunactl\s+version: "(\d+)\.\d+"', yaml)[
            1
        ]
    )
    core = (root / "esphome/lunactl/core.h").read_text()
    assert major == int(re.search(r"MAX_SCHEMA_VERSION = (\d+)", core)[1])
    assert major == max(load_schemas())
    assert "action: lunactl.manifest" in yaml and "action: lunactl.run" in yaml
    assert "script.lunactl_" not in yaml


async def test_concurrent_saves_have_one_winner(hass, setup, manifest):
    import asyncio

    store, device, _ = setup
    results = await asyncio.gather(
        store.async_save(device.id, manifest, 0),
        store.async_save(device.id, manifest, 0),
        return_exceptions=True,
    )
    assert (
        sum(
            isinstance(value, ManifestError) and value.code == "stale_revision"
            for value in results
        )
        == 1
    )
    assert store.read(device.id)["revision"] == 1


async def test_rename_restarts_debounce(hass, setup, manifest, freezer):
    store, device, button = setup
    entity = er.async_get(hass).async_get_or_create("sensor", "test", "rename")
    manifest["display"] = {"brightness": entity.entity_id}
    pressed = AsyncMock()
    hass.services.async_register("button", "press", pressed)
    hass.states.async_set(button.entity_id, "2026-01-01T00:00:00Z")
    await store.async_save(device.id, manifest, 0)
    freezer.tick(timedelta(seconds=9))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    er.async_get(hass).async_update_entity(
        entity.entity_id, new_entity_id="sensor.renamed"
    )
    await hass.async_block_till_done()
    freezer.tick(timedelta(seconds=9))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    pressed.assert_not_called()
    freezer.tick(timedelta(seconds=1))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    pressed.assert_awaited_once()
    assert store.read(device.id)["revision"] == 2


async def test_fresh_config_flow(hass, enable_custom_integrations):
    result = await hass.config_entries.flow.async_init(
        "lunactl", context={"source": "user"}
    )
    assert result["type"] == "form"
    assert result["step_id"] == "user"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == "create_entry"
    await hass.async_block_till_done()
    assert hass.services.has_service("lunactl", "manifest")
    await hass.config_entries.async_unload(result["result"].entry_id)


async def test_run_preserves_opaque_json_and_context(hass, setup):
    from homeassistant.core import Context

    handler = AsyncMock()
    hass.services.async_register("contract", "echo", handler)
    context = Context()
    data = {"text": "{{ 1 + 1 }}", "payload": {"nested": [True, None, 2.5, "Grüße"]}}
    await hass.services.async_call(
        "lunactl",
        "run",
        {
            "action": "contract.echo",
            "data": json.dumps(
                {"data": data, "target": {"entity_id": ["light.a", "light.b"]}}
            ),
        },
        blocking=True,
        context=context,
    )
    call = handler.call_args.args[0]
    assert call.data == {**data, "entity_id": ["light.a", "light.b"]}
    assert call.context is context


async def test_preview_validates_without_saving(hass, setup, manifest, hass_ws_client):
    store, device, _ = setup
    client = await hass_ws_client(hass)
    manifest["display"] = {"brightness": "sensor.new"}
    await client.send_json(
        {
            "id": 1,
            "type": "lunactl/manifest/get",
            "device_id": device.id,
            "manifest": manifest,
        }
    )
    result = await client.receive_json()
    assert result["success"]
    assert result["result"]["will_restart"]
    assert result["result"]["revision"] == 0
    assert not store.records


async def test_english_and_german_texts(hass, setup):
    from homeassistant.helpers.translation import async_get_translations

    for language, expected in (("en", "Run action"), ("de", "Aktion ausführen")):
        services = await async_get_translations(hass, language, "services", {"lunactl"})
        assert services["component.lunactl.services.run.name"] == expected
        issues = await async_get_translations(hass, language, "issues", {"lunactl"})
        text = issues["component.lunactl.issues.missing_references.description"]
        assert "{device}" in text and "{references}" in text
    root = Path(__file__).resolve().parents[2] / "custom_components/lunactl"
    assert json.loads((root / "strings.json").read_text()) == json.loads(
        (root / "translations/en.json").read_text()
    )


async def test_restart_resets_retained_subscriptions(hass, setup, manifest):
    store, device, _ = setup
    manifest["display"] = {"brightness": "sensor.old"}
    await store.async_save(device.id, manifest, 0)
    store.fetch("aa:bb:cc:dd:ee:ff")
    del manifest["display"]
    await store.async_save(device.id, manifest, 1)
    store.fetch("aa:bb:cc:dd:ee:ff")
    manifest["display"] = {"brightness": "sensor.old"}
    assert not store.read(device.id, manifest)["will_restart"]
    manifest["display"] = {"brightness": "sensor.new"}
    assert (await store.async_save(device.id, manifest, 2))["will_restart"]
    store.fetch("aa:bb:cc:dd:ee:ff")
    manifest["display"] = {"brightness": "sensor.old"}
    assert store.read(device.id, manifest)["will_restart"]
