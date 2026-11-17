"""Test devices only, installed exclusively in the disposable contract HA."""

from homeassistant import config_entries
from homeassistant.core import SupportsResponse
from homeassistant.helpers import device_registry as dr


async def async_setup(hass, config):
    result = await hass.config_entries.flow.async_init(
        "lunactl", context={"source": "user"}, data={}
    )
    if result["type"] == "create_entry":
        await hass.config_entries.async_setup(result["result"].entry_id)
    entry = config_entries.ConfigEntry(
        version=1,
        minor_version=1,
        domain="esphome",
        title="Contract device",
        data={},
        options={},
        unique_id="contract",
        source="user",
        discovery_keys={},
        subentries_data=[],
        disabled_by=config_entries.ConfigEntryDisabler.USER,
    )
    await hass.config_entries.async_add(entry)
    registry = dr.async_get(hass)
    device = registry.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={("esphome", "contract")},
        connections={(dr.CONNECTION_NETWORK_MAC, "aa:bb:cc:dd:ee:ff")},
        manufacturer="hearthctl",
        model="lunactl",
        name="Contract lunactl",
        sw_version="1.0 (ESPHome 2026.10.2)",
    )
    manifest = {
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
    await hass.data["lunactl"].async_save(device.id, manifest, 0)

    async def remove(call):
        registry.async_remove_device(device.id)
        return {}

    hass.services.async_register(
        "lunactl_contract",
        "remove_device",
        remove,
        supports_response=SupportsResponse.ONLY,
    )
    return True
