"""Designer registration, real HTTP modules and the admin websocket boundary."""

import json
from copy import deepcopy
from pathlib import Path

import pytest
from homeassistant.components.frontend import DATA_PANELS
from homeassistant.helpers import device_registry as dr

pytestmark = pytest.mark.asyncio
ROOT = Path(__file__).resolve().parents[2]


async def test_admin_panel_and_versioned_modules(hass, setup, hass_ws_client, hass_client):
    store, device, _ = setup
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "get_panels"})
    result = await client.receive_json()
    panel = result["result"]["lunactl"]
    assert panel["require_admin"]
    config = panel["config"]["_panel_custom"]
    assert config["name"] == "lunactl-designer"
    version = json.loads((ROOT / "custom_components/lunactl/manifest.json").read_text())["version"]
    prefix = f"/lunactl/frontend/{version}"
    assert config["module_url"] == f"{prefix}/panel.js"
    http = await hass_client()
    for path in (ROOT / "custom_components/lunactl/frontend").rglob("*.js"):
        relative = path.relative_to(ROOT / "custom_components/lunactl/frontend")
        response = await http.get(f"{prefix}/{relative}")
        assert response.status == 200
        assert response.content_type in ("text/javascript", "application/javascript")
        assert await response.read() == path.read_bytes()
    assert not store.records  # Opening the Designer never creates a Manifest.
    assert store.read(device.id)["manifest"] == {}
    entry = hass.config_entries.async_entries("lunactl")[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert "lunactl" not in hass.data[DATA_PANELS]
    assert await hass.config_entries.async_setup(entry.entry_id)
    assert "lunactl" in hass.data[DATA_PANELS]
    assert (await http.get(f"{prefix}/panel.js")).status == 200


async def test_nonadmin_cannot_see_panel_or_use_manifest_api(hass, setup, hass_ws_client, hass_admin_user):
    _, device, _ = setup
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "get_panels"})
    assert "lunactl" not in (await client.receive_json())["result"]
    commands = [
        {"type": "lunactl/devices"},
        {"type": "lunactl/manifest/get", "device_id": device.id},
        {"type": "lunactl/manifest/save", "device_id": device.id, "revision": 0,
         "manifest": {"schema": 1, "pages": [{"type": "pie", "quarters": [None] * 4}]}},
    ]
    for number, command in enumerate(commands, 2):
        await client.send_json({"id": number, **command})
        result = await client.receive_json()
        assert not result["success"]
        assert result["error"]["code"] == "unauthorized"


async def test_device_list_uses_ha_names_and_project_identity(hass, setup, hass_ws_client):
    _, device, _ = setup
    registry = dr.async_get(hass)
    registry.async_update_device(device.id, name_by_user="Kinderzimmer")
    # ESPHome maps the project to manufacturer/model; unrelated devices stay out.
    registry.async_get_or_create(
        config_entry_id=next(iter(device.config_entries)),
        identifiers={("esphome", "unrelated")},
        manufacturer="other", model="lunactl", name="Anderes Gerät",
    )
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "lunactl/devices"})
    result = (await client.receive_json())["result"]
    assert len(result) == 1
    assert result[0]["name"] == "Kinderzimmer"
    assert result[0]["device_id"] == device.id
    assert result[0]["firmware_version"] == "1.0 (ESPHome 2026.10.2)"
    assert result[0]["schema_version"] == 1
    assert result[0]["online"] is False


@pytest.mark.parametrize(
    ("item_changes", "firmware", "error_code"),
    [
        ({"icon": "mdi:not-in-lunactl"}, "1.0 (ESPHome 2026.10.2)", "invalid_manifest"),
        ({"color": "red"}, "1.0 (ESPHome 2026.10.2)", "invalid_manifest"),
        ({"action": None}, "1.0 (ESPHome 2026.10.2)", "invalid_manifest"),
        ({}, "unknown", "unknown_firmware"),
    ],
)
async def test_designer_validation_errors_preserve_saved_manifest(
    hass, setup, manifest, hass_ws_client, item_changes, firmware, error_code
):
    store, device, _ = setup
    await store.async_save(device.id, manifest, 0)
    pending_reload = store.pending[device.id]
    dr.async_get(hass).async_update_device(device.id, sw_version=firmware)
    candidate = deepcopy(manifest)
    candidate["pages"][0]["item"].update(item_changes)
    client = await hass_ws_client(hass)
    await client.send_json(
        {"id": 1, "type": "lunactl/manifest/get", "device_id": device.id,
         "manifest": candidate}
    )
    result = await client.receive_json()
    assert not result["success"]
    assert result["error"]["code"] == error_code
    assert result["error"]["message"]
    assert store.read(device.id)["manifest"] == manifest
    assert store.read(device.id)["revision"] == 1
    assert (await store.storage.async_load())[device.id] == {
        "manifest": manifest, "revision": 1,
    }
    assert store.pending[device.id] is pending_reload
