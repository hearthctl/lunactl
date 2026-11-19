"""Managed AC pages are HA data; devices receive ordinary Dial pages."""

import asyncio
from datetime import timedelta

import pytest
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed
from custom_components.lunactl.ac import entity_ids


async def test_ac_pages_compile_and_share_latest_run(hass, setup, freezer):
    store, device, _ = setup
    hass.states.async_set(
        "climate.room",
        "off",
        {
            "temperature": 20,
            "current_temperature": 23.5,
            "min_temp": 16,
            "max_temp": 30,
            "target_temp_step": 0.5,
            "hvac_modes": ["off", "cool", "heat"],
        },
    )
    calls = []

    async def climate(call):
        calls.append((call.service, dict(call.data)))
        # Cloud temperature deliberately remains stale during repeated taps.
        if call.service == "set_hvac_mode":
            hass.states.async_set(
                "climate.room",
                call.data["hvac_mode"],
                hass.states.get("climate.room").attributes,
            )
        if call.service == "turn_off":
            hass.states.async_set(
                "climate.room", "off", hass.states.get("climate.room").attributes
            )

    for action in ["set_hvac_mode", "set_temperature", "turn_off"]:
        hass.services.async_register("climate", action, climate)
    page = {
        "type": "ac",
        "id": "room-a",
        "entity": "climate.room",
        "minutes": 30,
        "minimum": 18,
        "maximum": 26,
    }
    document = {"schema": 1, "pages": [page, {**page, "id": "room-b", "minutes": 60}]}
    saved = await store.async_save(device.id, document, 0)
    assert saved["manifest"] == document
    wire = store.fetch("aa:bb:cc:dd:ee:ff")
    assert [p["type"] for p in wire["pages"]] == ["dial", "dial"]
    assert wire["pages"][0]["countdown"] == wire["pages"][1]["countdown"]
    timer = wire["pages"][0]["countdown"]

    async def action(page_id, command):
        await hass.services.async_call(
            "lunactl",
            "ac",
            {"device_id": device.id, "page_id": page_id, "command": command},
            blocking=True,
        )

    await action("room-a", "cool")
    first_end = hass.states.get(timer).attributes["finishes_at"]
    await asyncio.gather(*(action("room-a", "plus") for _ in range(8)))
    assert [
        data["temperature"] for service, data in calls if service == "set_temperature"
    ] == [20, 21, 22, 23, 24, 25, 26, 26, 26]
    assert hass.states.get(timer).attributes["finishes_at"] == first_end
    await action("room-b", "heat")
    assert hass.states.get(timer).attributes["duration"] == "1:00:00"
    freezer.tick(timedelta(minutes=31))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    assert not any(service == "turn_off" for service, _ in calls)
    freezer.tick(timedelta(minutes=30))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    assert calls[-1][0] == "turn_off"
    assert hass.states.get(timer).state == "idle"


async def test_ac_run_survives_reload_and_page_removal(hass, setup, freezer):
    store, device, _ = setup
    hass.states.async_set(
        "climate.room",
        "heat",
        {
            "temperature": 21,
            "current_temperature": 23,
            "min_temp": 16,
            "max_temp": 30,
            "hvac_modes": ["off", "cool", "heat"],
        },
    )
    stopped = []

    async def climate(call):
        if call.service == "turn_off":
            stopped.append(call.data["entity_id"])

    hass.services.async_register("climate", "set_hvac_mode", climate)
    hass.services.async_register("climate", "set_temperature", climate)
    hass.services.async_register("climate", "turn_off", climate)
    page = {
        "type": "ac",
        "id": "restore",
        "entity": "climate.room",
        "minutes": 1,
        "minimum": 18,
        "maximum": 26,
    }
    await store.async_save(device.id, {"schema": 1, "pages": [page]}, 0)
    await hass.services.async_call(
        "lunactl",
        "ac",
        {"device_id": device.id, "page_id": "restore", "command": "heat"},
        blocking=True,
    )
    entry = hass.config_entries.async_entries("lunactl")[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    freezer.tick(timedelta(minutes=2))
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=1))
    await hass.async_block_till_done()
    assert stopped == ["climate.room"]
    store = hass.data["lunactl"]
    await hass.services.async_call(
        "lunactl",
        "ac",
        {"device_id": device.id, "page_id": "restore", "command": "heat"},
        blocking=True,
    )
    await store.async_save(
        device.id,
        {
            "schema": 1,
            "pages": [
                {
                    "type": "single",
                    "item": {
                        "label": "Other",
                        "color": "#123456",
                        "action": {"action": "script.other"},
                    },
                }
            ],
        },
        1,
    )
    timer = entity_ids("climate.room")["timer"]
    assert hass.states.get(timer).state == "active"
    freezer.tick(timedelta(minutes=2))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    assert len(stopped) == 2
    assert hass.states.get(timer) is None


@pytest.mark.parametrize(
    "change",
    [
        {"minutes": 0},
        {"minutes": float("nan")},
        {"minimum": 27},
        {"id": ""},
        {"entity": "light.room"},
        {"items": []},
    ],
)
async def test_invalid_ac_settings_do_not_replace_manifest(
    hass, setup, manifest, change
):
    from custom_components.lunactl.manifest import ManifestError

    store, device, _ = setup
    await store.async_save(device.id, manifest, 0)
    page = {
        "type": "ac",
        "id": "invalid",
        "entity": "climate.room",
        "minutes": 30,
        "minimum": 18,
        "maximum": 26,
    }
    with pytest.raises(ManifestError):
        await store.async_save(
            device.id, {"schema": 1, "pages": [{**page, **change}]}, 1
        )
    assert store.read(device.id)["manifest"] == manifest
    assert not store.ac.entities


async def test_ac_rename_keeps_deadline_and_retries_failed_shutdown(
    hass, setup, freezer
):
    from homeassistant.exceptions import HomeAssistantError
    from homeassistant.helpers import entity_registry as er

    store, device, _ = setup
    registry = er.async_get(hass)
    entity = registry.async_get_or_create("climate", "test", "room")
    hass.states.async_set(
        entity.entity_id,
        "cool",
        {
            "temperature": 29,
            "hvac_modes": ["off", "cool", "heat"],
            "min_temp": 16,
            "max_temp": 30,
        },
    )
    calls = []

    async def climate(call):
        calls.append((call.service, dict(call.data)))
        if (
            call.service == "turn_off"
            and sum(service == "turn_off" for service, _ in calls) == 1
        ):
            raise HomeAssistantError("temporarily offline")

    for service in ("turn_off", "set_hvac_mode", "set_temperature"):
        hass.services.async_register("climate", service, climate)
    page = {
        "type": "ac",
        "id": "rename",
        "entity": entity.entity_id,
        "minutes": 1,
        "minimum": 18,
        "maximum": 26,
    }
    await store.async_save(device.id, {"schema": 1, "pages": [page]}, 0)
    await hass.services.async_call(
        "lunactl",
        "ac",
        {
            "device_id": device.id,
            "page_id": "rename",
            "command": "cool",
        },
        blocking=True,
    )
    assert calls[-1] == (
        "set_temperature",
        {"entity_id": entity.entity_id, "temperature": 26},
    )
    deadline = store.ac.runs[entity.entity_id]["end"]
    registry.async_update_entity(entity.entity_id, new_entity_id="climate.renamed")
    await hass.async_block_till_done()
    assert store.read(device.id)["manifest"]["pages"][0]["entity"] == "climate.renamed"
    hass.states.async_set("climate.renamed", "cool", {"temperature": 26})
    assert store.ac.runs["climate.renamed"]["end"] == deadline
    assert entity.entity_id not in store.ac.runs
    freezer.tick(timedelta(minutes=2))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    assert "climate.renamed" in store.ac.runs
    freezer.tick(timedelta(seconds=61))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    assert not store.ac.runs
    assert [data["entity_id"] for service, data in calls if service == "turn_off"] == [
        "climate.renamed",
        "climate.renamed",
    ]


async def test_ac_rejected_temperature_and_external_setpoint(hass, setup):
    from homeassistant.exceptions import HomeAssistantError

    store, device, _ = setup
    attrs = {"temperature": 20, "hvac_modes": ["off", "cool", "heat"]}
    hass.states.async_set("climate.room", "cool", attrs)
    fail = False
    temperatures = []

    async def climate(call):
        if call.service == "set_temperature":
            temperatures.append(call.data["temperature"])
            if fail:
                raise HomeAssistantError("rejected")

    for service in ("set_hvac_mode", "set_temperature"):
        hass.services.async_register("climate", service, climate)
    page = {
        "type": "ac",
        "id": "room",
        "entity": "climate.room",
        "minutes": 30,
        "minimum": 18,
        "maximum": 26,
    }
    await store.async_save(device.id, {"schema": 1, "pages": [page]}, 0)
    data = {"device_id": device.id, "page_id": "room"}
    await hass.services.async_call(
        "lunactl", "ac", {**data, "command": "cool"}, blocking=True
    )
    deadline = store.ac.runs["climate.room"]["end"]
    fail = True
    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            "lunactl", "ac", {**data, "command": "plus"}, blocking=True
        )
    assert store.ac.runs["climate.room"]["target"] == 20
    hass.states.async_set("climate.room", "cool", {**attrs, "temperature": 24})
    await hass.async_block_till_done()
    assert hass.states.get(entity_ids("climate.room")["value"]).state == "24°"
    fail = False
    await hass.services.async_call(
        "lunactl", "ac", {**data, "command": "plus"}, blocking=True
    )
    assert temperatures == [20, 21, 25]
    assert store.ac.runs["climate.room"]["end"] == deadline


async def test_ac_rename_serializes_with_start(hass, setup):
    from homeassistant.helpers import entity_registry as er

    store, device, _ = setup
    registry = er.async_get(hass)
    entity = registry.async_get_or_create("climate", "test", "race")
    attrs = {"temperature": 20, "hvac_modes": ["off", "cool", "heat"]}
    hass.states.async_set(entity.entity_id, "cool", attrs)
    entered, release = asyncio.Event(), asyncio.Event()

    async def climate(call):
        if (
            call.service == "set_hvac_mode"
            and call.data["entity_id"] == entity.entity_id
        ):
            entered.set()
            await release.wait()

    for service in ("set_hvac_mode", "set_temperature"):
        hass.services.async_register("climate", service, climate)
    page = {
        "type": "ac",
        "id": "a",
        "entity": entity.entity_id,
        "minutes": 30,
        "minimum": 18,
        "maximum": 26,
    }
    await store.async_save(
        device.id, {"schema": 1, "pages": [page, {**page, "id": "b", "minutes": 60}]}, 0
    )
    first = asyncio.create_task(
        hass.services.async_call(
            "lunactl",
            "ac",
            {
                "device_id": device.id,
                "page_id": "a",
                "command": "cool",
            },
            blocking=True,
        )
    )
    await entered.wait()
    registry.async_update_entity(entity.entity_id, new_entity_id="climate.renamed")
    hass.states.async_set("climate.renamed", "cool", attrs)
    await asyncio.sleep(0)
    second = asyncio.create_task(
        hass.services.async_call(
            "lunactl",
            "ac",
            {
                "device_id": device.id,
                "page_id": "b",
                "command": "heat",
            },
            blocking=True,
        )
    )
    release.set()
    await asyncio.gather(first, second)
    await hass.async_block_till_done()
    assert list(store.ac.runs) == ["climate.renamed"]
    assert store.ac.runs["climate.renamed"]["seconds"] == 3600


async def test_managed_views_preserve_existing_timer_component(hass, setup):
    from homeassistant.helpers.entity_component import DATA_INSTANCES
    from homeassistant.setup import async_setup_component

    store, device, _ = setup
    assert await async_setup_component(
        hass, "timer", {"timer": {"household": {"duration": 60}}}
    )
    component = hass.data[DATA_INSTANCES]["timer"]
    page = {
        "type": "ac",
        "id": "room",
        "entity": "climate.room",
        "minutes": 30,
        "minimum": 18,
        "maximum": 26,
    }
    await store.async_save(device.id, {"schema": 1, "pages": [page]}, 0)
    assert hass.data[DATA_INSTANCES]["timer"] is component
    await hass.services.async_call(
        "timer", "start", {"entity_id": "timer.household"}, blocking=True
    )
    assert hass.states.get("timer.household").state == "active"
    await store.ac.close()
    assert hass.states.get("timer.household").state == "active"
    await hass.services.async_call(
        "timer", "cancel", {"entity_id": "timer.household"}, blocking=True
    )
    assert hass.states.get("timer.household").state == "idle"
