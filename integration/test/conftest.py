"""Exercise the real HA services, storage, registries and websocket API."""

import pytest
import pytest_asyncio
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

pytest_plugins = ["pytest_homeassistant_custom_component"]


@pytest.fixture
def manifest():
    return {
        "schema": 1,
        "pages": [
            {
                "type": "single",
                "item": {
                    "label": "Beispiel",
                    "color": "#B91360",
                    "action": {
                        "action": "input_boolean.toggle",
                        "target": {"entity_id": "input_boolean.lunactl_example"},
                    },
                },
            }
        ],
    }


@pytest_asyncio.fixture
async def setup(hass, enable_custom_integrations):
    assert await async_setup_component(hass, "websocket_api", {})
    entry = MockConfigEntry(domain="lunactl", title="lunactl", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    esphome = MockConfigEntry(domain="esphome", data={})
    esphome.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=esphome.entry_id,
        identifiers={("esphome", "test")},
        connections={(dr.CONNECTION_NETWORK_MAC, "aa:bb:cc:dd:ee:ff")},
        manufacturer="hearthctl",
        model="lunactl",
        name="Test lunactl",
        sw_version="1.0 (ESPHome 2026.10.2)",
    )
    entity = er.async_get(hass).async_get_or_create(
        "button",
        "esphome",
        "test-manifest_reload",
        config_entry=esphome,
        device_id=device.id,
        original_name="Manifest neu laden",
    )
    hass.states.async_set(entity.entity_id, "unavailable")
    await hass.async_block_till_done()
    yield hass.data["lunactl"], device, entity
    if "lunactl" in hass.data:
        await hass.config_entries.async_unload(entry.entry_id)
