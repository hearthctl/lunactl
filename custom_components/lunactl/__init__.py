"""lunactl Manifest storage and the firmware's two HA actions."""

import json
import re

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr

from .designer import async_register_designer, async_remove_designer
from .manifest import ManifestError
from .store import DOMAIN, ManifestStore


async def async_setup_entry(hass, entry):
    store = ManifestStore(hass)
    await store.async_load()
    hass.data[DOMAIN] = store
    await async_register_designer(hass)

    async def manifest(call):
        return store.fetch(call.data["mac"])

    async def run(call):
        try:
            payload = json.loads(call.data["data"])
            if not isinstance(payload, dict):
                raise TypeError("Expected target/data object")
            if any(
                not isinstance(payload.get(key, {}), dict) for key in ("target", "data")
            ):
                raise ValueError("Expected target and data objects")
        except (ValueError, TypeError) as err:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="invalid_action_data"
            ) from err
        domain, service = call.data["action"].split(".", 1)
        await hass.services.async_call(
            domain,
            service,
            payload.get("data", {}),
            target=payload.get("target", {}),
            blocking=True,
            context=call.context,
        )

    hass.services.async_register(
        DOMAIN,
        "manifest",
        manifest,
        schema=vol.Schema({vol.Required("mac"): str}),
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "run",
        run,
        schema=vol.Schema(
            {
                vol.Required("action"): vol.Match(
                    re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
                ),
                vol.Required("data"): str,
            }
        ),
    )
    for command in (ws_devices, ws_read, ws_save):
        websocket_api.async_register_command(hass, command)
    return True


async def async_unload_entry(hass, entry):
    async_remove_designer(hass)
    hass.data.pop(DOMAIN).close()
    for service in ("manifest", "run"):
        hass.services.async_remove(DOMAIN, service)
    return True


@callback
def get_store(hass, connection, msg):
    if (store := hass.data.get(DOMAIN)) is None:
        connection.send_error(msg["id"], "not_loaded", "lunactl is not loaded")
    return store


@websocket_api.websocket_command({vol.Required("type"): "lunactl/devices"})
@websocket_api.require_admin
@callback
def ws_devices(hass, connection, msg):
    if store := get_store(hass, connection, msg):
        connection.send_result(
            msg["id"],
            [
                store.read(device.id)
                for device in dr.async_get(hass).devices.values()
                if device.manufacturer == "hearthctl" and device.model == "lunactl"
            ],
        )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "lunactl/manifest/get",
        vol.Required("device_id"): str,
        vol.Optional("manifest"): dict,
    }
)
@websocket_api.require_admin
@callback
def ws_read(hass, connection, msg):
    if store := get_store(hass, connection, msg):
        try:
            connection.send_result(
                msg["id"], store.read(msg["device_id"], msg.get("manifest"))
            )
        except ManifestError as err:
            connection.send_error(msg["id"], err.code, str(err))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "lunactl/manifest/save",
        vol.Required("device_id"): str,
        vol.Required("revision"): vol.All(int, vol.Range(min=0)),
        vol.Required("manifest"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save(hass, connection, msg):
    if store := get_store(hass, connection, msg):
        try:
            result = await store.async_save(
                msg["device_id"], msg["manifest"], msg["revision"]
            )
        except ManifestError as err:
            connection.send_error(msg["id"], err.code, str(err))
        else:
            connection.send_result(msg["id"], result)
