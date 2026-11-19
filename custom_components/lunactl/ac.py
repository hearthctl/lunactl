"""Managed AC configuration, Dial generation and shared per-climate runs."""

import asyncio
from copy import deepcopy
from datetime import timedelta
import hashlib
import logging
import math
import re

from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.entity_platform import EntityPlatform
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .manifest import ManifestError

_LOGGER = logging.getLogger(__name__)


def entity_ids(entity):
    key = hashlib.sha256(entity.encode()).hexdigest()[:16]
    return {
        field: f"{'timer' if field == 'timer' else 'sensor'}.lunactl_ac_{key}_{field}"
        for field in ("timer", "status", "value", "caption", "adjustable")
    }


def ac_pages(document):
    return [
        p
        for p in document.get("pages", [])
        if isinstance(p, dict) and p.get("type") == "ac"
    ]


def validate_page(page):
    if set(page) != {"type", "id", "entity", "minutes", "minimum", "maximum"}:
        raise ManifestError("invalid_manifest", "Invalid AC configuration fields")
    if not isinstance(page["id"], str) or not re.fullmatch(
        r"[a-zA-Z0-9_-]{1,64}", page["id"]
    ):
        raise ManifestError("invalid_manifest", "Invalid AC page id")
    if not isinstance(page["entity"], str) or not re.fullmatch(
        r"climate\.[a-z0-9_]+", page["entity"]
    ):
        raise ManifestError("invalid_manifest", "Select a climate entity")
    for field in ("minutes", "minimum", "maximum"):
        if type(page[field]) not in (int, float) or not math.isfinite(page[field]):
            raise ManifestError(
                "invalid_manifest", "AC settings must be finite numbers"
            )
    if not 1 <= page["minutes"] <= 1440 or not page["minimum"] < page["maximum"]:
        raise ManifestError(
            "invalid_manifest", "Invalid AC duration or temperature bounds"
        )


def dial_page(page, device_id):
    ids = entity_ids(page["entity"])

    def item(label, color, command, icon=None):
        result = {
            "label": label,
            "color": color,
            "action": {
                "action": "lunactl.ac",
                "data": {
                    "device_id": device_id,
                    "page_id": page["id"],
                    "command": command,
                },
            },
        }
        if icon:
            result["icon"] = icon
            result["active"] = {"entity": page["entity"], "states": [command]}
        else:
            result["active"] = {"entity": ids["adjustable"], "states": ["on"]}
        return result

    return {
        "type": "dial",
        **{
            field: {"format": "{0}", "refs": [{"entity": ids[field]}]}
            for field in ("status", "value", "caption")
        },
        "countdown": ids["timer"],
        "minus": item("Kälter", "#374151", "minus"),
        "plus": item("Wärmer", "#374151", "plus"),
        "items": [
            item("Kühlen", "#2876A8", "cool", "mdi:snowflake"),
            item("Klima aus", "#56616D", "off", "mdi:power"),
            item("Heizen", "#B85C20", "heat", "mdi:fire"),
        ],
    }


def compile_manifest(document, device_id):
    if not isinstance(document, dict) or not isinstance(
        document.get("pages", []), list
    ):
        return deepcopy(document)
    result = deepcopy(document)
    seen = set()
    for index, page in enumerate(result.get("pages", [])):
        if not isinstance(page, dict) or page.get("type") != "ac":
            continue
        validate_page(page)
        if page["id"] in seen:
            raise ManifestError("invalid_manifest", "Duplicate AC page id")
        seen.add(page["id"])
        result["pages"][index] = dial_page(page, device_id)
    return result


def numeric(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (ValueError, TypeError):
        return None


class ACEntity(Entity):
    """Read-only view of a managed climate run, including the timer contract."""

    _attr_should_poll = False

    def __init__(self, manager, climate, field):
        self.manager, self.climate, self.field = manager, climate, field
        self.entity_id = entity_ids(climate)[field]
        self._attr_name = f"lunactl {climate} {field}"

    @property
    def state(self):
        return self.manager.view(self.climate)[self.field]

    @property
    def extra_state_attributes(self):
        identity = {"lunactl_ac": self.climate, "field": self.field}
        if self.field != "timer":
            return identity
        run = self.manager.runs.get(self.climate)
        if not run:
            return {**identity, "duration": "0:00:00"}
        return {
            **identity,
            "duration": str(timedelta(seconds=run["seconds"])),
            "finishes_at": run["end"],
        }


class ACManager:
    """Serialize actions per appliance and persist deadlines before operating it."""

    def __init__(self, hass, manifests):
        self.hass, self.manifests = hass, manifests
        self.storage = Store(hass, 1, "lunactl.ac_runs")
        self.runs = {}
        self.locks = {}
        self.write_lock = asyncio.Lock()
        self.sync_lock = asyncio.Lock()
        self.entities = {}
        self.cancel = {}
        self.platforms = {
            domain: EntityPlatform(
                hass=hass,
                logger=_LOGGER,
                domain=domain,
                platform_name="lunactl",
                platform=None,
                scan_interval=timedelta(seconds=30),
                entity_namespace=None,
            )
            for domain in ("sensor", "timer")
        }
        self.unsub = None
        self.closed = False

    async def load(self):
        self.runs = await self.storage.async_load() or {}
        await self.sync()
        self.unsub = self.hass.bus.async_listen("state_changed", self.changed)
        for climate in self.runs:
            self.schedule(climate)

    async def sync(self):
        async with self.sync_lock:
            wanted = {
                p["entity"]
                for r in self.manifests.records.values()
                for p in ac_pages(r["manifest"])
            } | set(self.runs)
            for climate in wanted - self.entities.keys():
                entities = [
                    ACEntity(self, climate, field) for field in entity_ids(climate)
                ]
                for domain, component in self.platforms.items():
                    await component.async_add_entities(
                        [e for e in entities if e.entity_id.startswith(domain + ".")]
                    )
                self.entities[climate] = entities
            for climate in self.entities.keys() - wanted:
                for entity in self.entities.pop(climate):
                    await self.platforms[
                        entity.entity_id.split(".")[0]
                    ].async_remove_entity(entity.entity_id)

    async def rename(self, old, new):
        # Registry renames must move the deadline along with the physical appliance.
        async with self.locks.setdefault(old, asyncio.Lock()):
            async with self.locks.setdefault(new, asyncio.Lock()):
                async with self.write_lock:
                    if old not in self.runs:
                        return
                    updated = deepcopy(self.runs)
                    updated[new] = updated.pop(old)
                    await self.storage.async_save(updated)
                    self.runs = updated
                self.schedule(old)
                self.schedule(new)

    async def close(self):
        self.closed = True
        if self.unsub:
            self.unsub()
        for cancel in self.cancel.values():
            cancel()
        self.cancel.clear()
        # Wait for in-flight service calls before removing their state views.
        for lock in list(self.locks.values()):
            async with lock:
                pass
        for entities in self.entities.values():
            for entity in entities:
                await self.platforms[
                    entity.entity_id.split(".")[0]
                ].async_remove_entity(entity.entity_id)
        self.entities.clear()

    def view(self, climate):
        state = self.hass.states.get(climate)
        mode = state.state if state else "unavailable"
        attrs = state.attributes if state else {}
        run = self.runs.get(climate)
        active = (
            run is not None and dt_util.parse_datetime(run["end"]) > dt_util.utcnow()
        )
        temperature = numeric(attrs.get("current_temperature"))
        running = mode in ("cool", "heat")
        target = run["target"] if run else numeric(attrs.get("temperature"))
        value = target if running else temperature
        return {
            "timer": "active" if active else "idle",
            "status": {"cool": "Kühlt", "heat": "Heizt", "off": "Klima aus"}.get(
                mode, "Klima nicht bereit"
            ),
            "value": "--" if value is None else f"{value:g}°".replace(".", ","),
            "caption": (
                (
                    "--"
                    if temperature is None
                    else f"{temperature:g} °C".replace(".", ",")
                )
                + " im Zimmer"
            )
            if running
            else "im Zimmer",
            "adjustable": "on" if running and active else "off",
        }

    async def changed(self, event):
        climate = event.data["entity_id"]
        if self.closed or climate not in self.entities:
            return
        old, new = event.data["old_state"], event.data["new_state"]
        target = numeric(new.attributes.get("temperature")) if new else None
        if target is not None and old and old.attributes.get("temperature") != target:
            async with self.locks.setdefault(climate, asyncio.Lock()):
                current = self.hass.states.get(climate)
                run = self.runs.get(climate)
                if (
                    not self.closed
                    and run
                    and current
                    and numeric(current.attributes.get("temperature")) == target
                ):
                    await self.write(climate, {**run, "target": target})
        self.publish(climate)

    @callback
    def publish(self, climate):
        for entity in self.entities.get(climate, []):
            entity.async_write_ha_state()

    async def write(self, climate, run):
        async with self.write_lock:
            updated = deepcopy(self.runs)
            if run is None:
                updated.pop(climate, None)
            else:
                updated[climate] = run
            await self.storage.async_save(updated)
            self.runs = updated
        self.schedule(climate)
        self.publish(climate)

    @callback
    def schedule(self, climate, retry=False):
        if cancel := self.cancel.pop(climate, None):
            cancel()
        if self.closed or climate not in self.runs:
            return
        deadline = dt_util.parse_datetime(self.runs[climate]["end"])
        when = (
            dt_util.utcnow() + timedelta(seconds=60)
            if retry
            else max(deadline, dt_util.utcnow())
        )

        async def expire(_now):
            self.cancel.pop(climate, None)
            async with self.locks.setdefault(climate, asyncio.Lock()):
                run = self.runs.get(climate)
                if (
                    not run
                    or dt_util.parse_datetime(run["end"]) > dt_util.utcnow()
                    or self.closed
                ):
                    return
                try:
                    await self.call(climate, "turn_off")
                    await self.write(climate, None)
                    await self.sync()
                except (HomeAssistantError, OSError):
                    _LOGGER.exception("Could not stop managed AC run for %s", climate)
                    self.schedule(climate, retry=True)

        self.cancel[climate] = async_track_point_in_utc_time(self.hass, expire, when)

    async def call(self, climate, service, context=None, **data):
        state = self.hass.states.get(climate)
        if state is None or state.state in ("unknown", "unavailable"):
            raise ServiceValidationError("Climate is unavailable")
        await self.hass.services.async_call(
            "climate",
            service,
            {"entity_id": climate, **data},
            blocking=True,
            context=context,
        )

    def settings(self, device_id, page_id):
        for page in ac_pages(
            self.manifests.records.get(device_id, {}).get("manifest", {})
        ):
            if page["id"] == page_id:
                return page
        raise ServiceValidationError("AC page no longer exists")

    async def action(self, call):
        # Use the same transaction boundary as page edits and registry renames.
        async with self.manifests.lock:
            if self.closed:
                raise ServiceValidationError("AC integration is unloading")
            await self._action(call)

    async def _action(self, call):
        page = self.settings(call.data["device_id"], call.data["page_id"])
        climate = page["entity"]
        async with self.locks.setdefault(climate, asyncio.Lock()):
            if self.closed:
                raise ServiceValidationError("AC integration is unloading")
            page = self.settings(call.data["device_id"], call.data["page_id"])
            if page["entity"] != climate:
                raise ServiceValidationError("AC configuration changed; retry")
            command = call.data["command"]
            if command == "off":
                await self.call(climate, "turn_off", context=call.context)
                await self.write(climate, None)
                await self.sync()
                return
            state = self.hass.states.get(climate)
            if state is None or state.state in ("unknown", "unavailable"):
                raise ServiceValidationError("Climate is unavailable")
            attrs = state.attributes
            hardware_min = numeric(attrs.get("min_temp"))
            hardware_max = numeric(attrs.get("max_temp"))
            minimum = max(
                page["minimum"],
                hardware_min if hardware_min is not None else page["minimum"],
            )
            maximum = min(
                page["maximum"],
                hardware_max if hardware_max is not None else page["maximum"],
            )
            if minimum >= maximum:
                raise ServiceValidationError(
                    "AC temperature limits do not fit this climate"
                )
            run = self.runs.get(climate)
            if command in ("cool", "heat"):
                if command not in attrs.get("hvac_modes", []):
                    raise ServiceValidationError("Climate does not support this mode")
                target = run["target"] if run else numeric(attrs.get("temperature"))
                if target is None:
                    raise ServiceValidationError("Climate has no numeric setpoint")
                target = max(minimum, min(maximum, target))
                seconds = page["minutes"] * 60
                await self.write(
                    climate,
                    {
                        "target": target,
                        "minimum": minimum,
                        "maximum": maximum,
                        "seconds": seconds,
                        "end": (
                            dt_util.utcnow() + timedelta(seconds=seconds)
                        ).isoformat(),
                    },
                )
                try:
                    await self.call(
                        climate,
                        "set_hvac_mode",
                        context=call.context,
                        hvac_mode=command,
                    )
                    await self.call(
                        climate,
                        "set_temperature",
                        context=call.context,
                        temperature=target,
                    )
                except HomeAssistantError:
                    # Keep the shutdown deadline if switching mode partly succeeded.
                    actual = self.hass.states.get(climate)
                    previous_target = (
                        numeric(actual.attributes.get("temperature"))
                        if actual
                        else None
                    )
                    if previous_target is not None:
                        await self.write(
                            climate, {**self.runs[climate], "target": previous_target}
                        )
                    raise
            else:
                if not run or self.view(climate)["adjustable"] != "on":
                    raise ServiceValidationError("No active AC run")
                target = max(
                    run["minimum"],
                    min(
                        run["maximum"], run["target"] + (1 if command == "plus" else -1)
                    ),
                )
                await self.write(climate, {**run, "target": target})
                try:
                    await self.call(
                        climate,
                        "set_temperature",
                        context=call.context,
                        temperature=target,
                    )
                except HomeAssistantError:
                    await self.write(climate, run)
                    raise
