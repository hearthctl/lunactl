"""Persistent per-device Manifests and their Home Assistant lifecycle."""

import asyncio
import logging
from copy import deepcopy

from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError
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
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.storage import Store

from .manifest import (
    ManifestError,
    firmware_schema,
    load_schemas,
    references,
    rename,
    subscriptions,
    validate,
)

DOMAIN = "lunactl"
_LOGGER = logging.getLogger(__name__)


class ManifestStore:
    """Serialize writes, including registry-driven edits, and debounce reloads."""

    def __init__(self, hass):
        self.hass = hass
        self.storage = Store(hass, 1, "lunactl.manifests")
        self.records = {}
        self.schemas = {}
        self.lock = asyncio.Lock()
        self.pending = {}
        self.delivered = {}
        self.unsub = []

    async def async_load(self):
        self.schemas = await self.hass.async_add_executor_job(load_schemas)
        self.records = await self.storage.async_load() or {}
        devices = dr.async_get(self.hass)
        # Registry deletions while HA was stopped must not leave orphan data.
        for device_id in tuple(self.records):
            if devices.async_get(device_id) is None:
                self.records.pop(device_id)
                ir.async_delete_issue(self.hass, DOMAIN, device_id)
        await self.storage.async_save(self.records)
        for event in (
            er.EVENT_ENTITY_REGISTRY_UPDATED,
            dr.EVENT_DEVICE_REGISTRY_UPDATED,
            ar.EVENT_AREA_REGISTRY_UPDATED,
            fr.EVENT_FLOOR_REGISTRY_UPDATED,
            lr.EVENT_LABEL_REGISTRY_UPDATED,
        ):
            self.unsub.append(
                self.hass.bus.async_listen(event, self.async_registry_updated)
            )
        # Helpers without registry entries can resolve references via states.
        self.unsub.append(
            self.hass.bus.async_listen("state_changed", self.async_states_changed)
        )
        self.check_references()

    def close(self):
        for unsubscribe in self.unsub:
            unsubscribe()
        for cancel in self.pending.values():
            cancel()
        self.pending.clear()

    def device(self, device_id):
        device = dr.async_get(self.hass).async_get(device_id)
        if (
            device is None
            or device.manufacturer != "hearthctl"
            or device.model != "lunactl"
        ):
            raise ManifestError("unknown_device", "Unknown lunactl device")
        return device

    def entities(self, device_id):
        return [
            entity
            for entity in er.async_entries_for_device(
                er.async_get(self.hass), device_id
            )
            if entity.platform == "esphome"
        ]

    def online(self, device_id):
        return any(
            (state := self.hass.states.get(entity.entity_id)) is not None
            and state.state != STATE_UNAVAILABLE
            for entity in self.entities(device_id)
        )

    def read(self, device_id, candidate=None):
        device = self.device(device_id)
        if candidate is not None:
            candidate = validate(
                candidate, firmware_schema(device.sw_version), self.schemas
            )
        record = self.records.get(device_id, {"revision": 0, "manifest": {}})
        manifest = record["manifest"]
        baseline = self.delivered.get(device_id, subscriptions(manifest))
        return {
            "device_id": device_id,
            "name": device.name_by_user or device.name,
            "manifest": deepcopy(manifest),
            "revision": record["revision"],
            "online": self.online(device_id),
            "firmware_version": device.sw_version,
            "schema_version": firmware_schema(device.sw_version),
            "highest_schema": max(self.schemas),
            "required_firmware": f"{manifest['schema']}.0" if manifest else None,
            "will_restart": bool(candidate and subscriptions(candidate) - baseline),
        }

    def fetch(self, mac):
        address = dr.format_mac(mac)
        for device in dr.async_get(self.hass).devices:
            if device.manufacturer != "hearthctl" or device.model != "lunactl":
                continue
            if (dr.CONNECTION_NETWORK_MAC, address) in device.connections:
                manifest = self.records.get(device.id, {}).get("manifest", {})
                required = subscriptions(manifest)
                accepted = firmware_schema(device.sw_version)
                if manifest and accepted is not None and manifest["schema"] <= accepted:
                    previous = self.delivered.get(device.id)
                    # New subscriptions restart the core, dropping old subscriptions.
                    # Removing references alone retains the existing subscriptions.
                    if previous is None or required - previous:
                        self.delivered[device.id] = required
                return deepcopy(manifest)
        return {}

    async def async_save(self, device_id, manifest, revision):
        async with self.lock:
            device = self.device(device_id)
            current = self.records.get(device_id, {"revision": 0})
            if revision != current["revision"]:
                raise ManifestError(
                    "stale_revision", "Manifest wurde inzwischen geändert"
                )
            saved = validate(manifest, firmware_schema(device.sw_version), self.schemas)
            result = self.read(device_id, saved)
            await self._write(
                {
                    **self.records,
                    device_id: {"revision": revision + 1, "manifest": saved},
                }
            )
            self.schedule_reload(device_id)
            self.check_references()
            return {**self.read(device_id), "will_restart": result["will_restart"]}

    async def _write(self, records):
        # Publish only after durable storage succeeds; failure keeps the old revision.
        await self.storage.async_save(records)
        self.records = records

    @callback
    def schedule_reload(self, device_id):
        if cancel := self.pending.pop(device_id, None):
            cancel()

        async def reload(_now):
            self.pending.pop(device_id, None)
            if not self.online(device_id):
                return
            for entity in self.entities(device_id):
                if (
                    entity.domain == "button"
                    and (entity.original_name_unprefixed or entity.original_name)
                    == "Manifest neu laden"
                ):
                    try:
                        await self.hass.services.async_call(
                            "button",
                            "press",
                            {"entity_id": entity.entity_id},
                            blocking=True,
                        )
                    except HomeAssistantError:
                        _LOGGER.exception("Could not reload Manifest for %s", device_id)
                    return

        self.pending[device_id] = async_call_later(self.hass, 10, reload)

    async def async_registry_updated(self, event):
        async with self.lock:
            records = deepcopy(self.records)
            if (
                event.event_type == dr.EVENT_DEVICE_REGISTRY_UPDATED
                and event.data["action"] == "remove"
            ):
                device_id = event.data["device_id"]
                records.pop(device_id, None)
                self.delivered.pop(device_id, None)
                if cancel := self.pending.pop(device_id, None):
                    cancel()
                ir.async_delete_issue(self.hass, DOMAIN, device_id)
            if old := event.data.get("old_entity_id"):
                for device_id, record in records.items():
                    updated = rename(record["manifest"], old, event.data["entity_id"])
                    if updated != record["manifest"]:
                        record["manifest"] = updated
                        record["revision"] += 1
            changed = [key for key in records if records[key] != self.records.get(key)]
            if records != self.records:
                await self._write(records)
                for device_id in changed:
                    self.schedule_reload(device_id)
            self.check_references()

    @callback
    def async_states_changed(self, event):
        if event.data.get("old_state") is None or event.data.get("new_state") is None:
            self.check_references()

    @callback
    def check_references(self):
        registries = {
            "device_id": dr.async_get(self.hass).async_get,
            "area_id": ar.async_get(self.hass).async_get_area,
            "floor_id": fr.async_get(self.hass).async_get_floor,
            "label_id": lr.async_get(self.hass).async_get_label,
            "entity_id": lambda entity: (
                er.async_get(self.hass).async_get(entity)
                or self.hass.states.get(entity)
            ),
        }
        for device_id, record in self.records.items():
            missing = sorted(
                f"{kind}: {value}"
                for kind, value in references(record["manifest"])
                if not registries[kind](value)
            )
            if missing:
                device = dr.async_get(self.hass).async_get(device_id)
                ir.async_create_issue(
                    self.hass,
                    DOMAIN,
                    device_id,
                    is_fixable=False,
                    severity=ir.IssueSeverity.WARNING,
                    translation_key="missing_references",
                    translation_placeholders={
                        "device": (device.name_by_user or device.name or device_id)
                        if device
                        else device_id,
                        "references": "\n".join(missing),
                    },
                )
            else:
                ir.async_delete_issue(self.hass, DOMAIN, device_id)
