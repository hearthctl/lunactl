"""Designer registration, real HTTP modules and the admin websocket boundary."""

import json
import re
import shutil
import threading
from copy import deepcopy
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from homeassistant.components.frontend import DATA_PANELS
from homeassistant.helpers import device_registry as dr

from custom_components.lunactl import designer

pytestmark = pytest.mark.asyncio
ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "custom_components/lunactl/frontend"


@pytest.mark.parametrize("relative", sorted(
    path.relative_to(FRONTEND).as_posix()
    for path in FRONTEND.rglob("*") if path.is_file() and not path.name.endswith(".gz")
))
async def test_frontend_hash_tracks_every_file(hass, tmp_path, relative):
    root = tmp_path / "frontend"
    shutil.copytree(FRONTEND, root)
    original = await hass.async_add_executor_job(designer._frontend_hash, root)
    path = root / relative
    content = path.read_bytes()
    path.write_bytes(content + b"\0changed")
    assert await hass.async_add_executor_job(designer._frontend_hash, root) != original
    path.write_bytes(content)
    assert await hass.async_add_executor_job(designer._frontend_hash, root) == original
    path.rename(path.with_name(path.name + ".renamed"))
    assert await hass.async_add_executor_job(designer._frontend_hash, root) != original


async def test_frontend_hash_is_sorted_and_ignores_gzip(hass, tmp_path):
    files = {"panel.js": b"import './vendor/module.js';", "vendor/module.js": b"module"}
    roots = [tmp_path / "first", tmp_path / "second"]
    for root, paths in zip(roots, (files, reversed(files))):
        for name in paths:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(files[name])
    original = await hass.async_add_executor_job(designer._frontend_hash, roots[0])
    assert await hass.async_add_executor_job(designer._frontend_hash, roots[1]) == original
    for name in ("panel.js.gz", "vendor/module.js.gz", "vendor/orphan.gz", ".gz"):
        compressed = roots[0] / name
        compressed.write_bytes(b"compressed copy")
        assert await hass.async_add_executor_job(designer._frontend_hash, roots[0]) == original
        compressed.write_bytes(b"updated compressed copy")
        assert await hass.async_add_executor_job(designer._frontend_hash, roots[0]) == original
        compressed.unlink()
        assert await hass.async_add_executor_job(designer._frontend_hash, roots[0]) == original
    added = roots[0] / "extra.txt"
    added.write_bytes(b"")
    assert await hass.async_add_executor_job(designer._frontend_hash, roots[0]) != original
    added.unlink()
    assert await hass.async_add_executor_job(designer._frontend_hash, roots[0]) == original
    (roots[0] / "vendor/module.js").unlink()
    assert await hass.async_add_executor_job(designer._frontend_hash, roots[0]) != original


async def test_registration_hashes_once_in_executor_and_reuses_static_path(hass, setup, monkeypatch):
    entry = hass.config_entries.async_entries("lunactl")[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    loop_thread = threading.get_ident()
    original_hash = designer._frontend_hash
    hash_calls = []

    def checked_hash(path):
        assert threading.get_ident() != loop_thread
        hash_calls.append(path)
        return original_hash(path)

    static_spy = AsyncMock(wraps=hass.http.async_register_static_paths)
    monkeypatch.setattr(designer, "_frontend_hash", checked_hash)
    monkeypatch.setattr(hass.http, "async_register_static_paths", static_spy)
    assert await hass.config_entries.async_setup(entry.entry_id)
    assert hash_calls == [FRONTEND]
    static_spy.assert_not_awaited()


async def test_admin_panel_and_hashed_modules(hass, setup, hass_ws_client, hass_client):
    store, device, _ = setup
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "get_panels"})
    result = await client.receive_json()
    panel = result["result"]["lunactl"]
    assert panel["require_admin"]
    config = panel["config"]["_panel_custom"]
    assert config["name"] == "lunactl-designer"
    version = json.loads((ROOT / "custom_components/lunactl/manifest.json").read_text())["version"]
    prefix = config["module_url"].removesuffix("/panel.js")
    assert re.fullmatch(r"/lunactl/frontend/[0-9a-f]{12}", prefix)
    assert config["module_url"] == f"{prefix}/panel.js"
    http = await hass_client()
    legacy = await http.get(f"/lunactl/frontend/{version}/panel.js")
    # HA's Designer catch-all falls back to HTML; it must not serve the module.
    assert legacy.content_type == "text/html"
    assert await legacy.read() != (FRONTEND / "panel.js").read_bytes()
    for path in (ROOT / "custom_components/lunactl/frontend").rglob("*.js"):
        relative = path.relative_to(ROOT / "custom_components/lunactl/frontend")
        response = await http.get(f"{prefix}/{relative}")
        assert response.status == 200
        assert "max-age=" in response.headers["Cache-Control"]
        assert response.content_type in ("text/javascript", "application/javascript")
        assert await response.read() == path.read_bytes()
    for filename in ("nunito-800.ttf", "materialdesignicons-webfont.woff2"):
        path = ROOT / "custom_components/lunactl/frontend/vendor" / filename
        response = await http.get(f"{prefix}/vendor/{filename}")
        assert response.status == 200
        assert response.content_type in ("font/ttf", "font/woff2", "application/font-woff", "application/octet-stream", "application/x-font-ttf")
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


@pytest.mark.parametrize("slot", ["single", "quarter", "center"])
async def test_actionless_item_drafts_never_replace_saved_manifest(
    hass, setup, manifest, hass_ws_client, slot
):
    store, device, _ = setup
    await store.async_save(device.id, manifest, 0)
    pending_reload = store.pending[device.id]
    item = {"label": "Neues Item", "color": "#4378AA"}
    page = {"type": "single", "item": item} if slot == "single" else {
        "type": "pie", "quarters": [item if slot == "quarter" else None, None, None, None],
    }
    if slot == "center":
        page["center"] = item
    draft = {"schema": 1, "pages": [page]}
    client = await hass_ws_client(hass)
    for number, command in enumerate(("get", "save"), 1):
        request = {"id": number, "type": f"lunactl/manifest/{command}",
                   "device_id": device.id, "manifest": draft}
        if command == "save":
            request["revision"] = 1
        await client.send_json(request)
        result = await client.receive_json()
        assert not result["success"]
        assert result["error"]["code"] == "invalid_manifest"
        assert store.read(device.id)["manifest"] == manifest
        assert store.read(device.id)["revision"] == 1
        assert store.pending[device.id] is pending_reload


async def test_soft_hints_never_reject_valid_manifest(hass, setup, hass_ws_client):
    """Missing references/actions, unavailable states, contrast and wide text save."""
    store, device, _ = setup
    hass.states.async_set("sensor.unavailable", "unavailable")
    candidate = {
        "schema": 1,
        "pages": [{
            "type": "single",
            "item": {
                "label": "Breiter Text " * 20,
                "color": "#FFFFFF",
                "action": {
                    "action": "script.does_not_exist",
                    "target": {"entity_id": ["light.missing", "sensor.unavailable"]},
                    "data": {"arbitrary": "not checked against action fields"},
                },
                "value": {"format": "{0} {1}", "refs": [
                    {"entity": "sensor.missing"}, {"entity": "sensor.unavailable"},
                ]},
                "countdown": "timer.missing",
            },
        }],
        "buttons": {"a_short": {"action": "script.also_missing"}},
        "display": {"brightness": "sensor.brightness_missing"},
    }
    client = await hass_ws_client(hass)
    for number, command in enumerate(("get", "save"), 1):
        request = {"id": number, "type": f"lunactl/manifest/{command}",
                   "device_id": device.id, "manifest": candidate}
        if command == "save":
            request["revision"] = 0
        await client.send_json(request)
        result = await client.receive_json()
        assert result["success"], result
    assert result["result"]["revision"] == 1
    assert store.read(device.id)["manifest"] == candidate
    assert (await store.storage.async_load())[device.id]["manifest"] == candidate
