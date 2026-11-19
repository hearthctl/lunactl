"""The Manifest contract, independent of Home Assistant's storage and registries."""

import json
import re
from copy import deepcopy
from pathlib import Path

from jsonschema import Draft202012Validator


def load_schemas():
    """Load all released schemas from the HACS installation."""
    return {
        int(re.search(r"\.v(\d+)\.", path.name)[1]): Draft202012Validator(
            json.loads(path.read_text())
        )
        for path in Path(__file__).with_name("schema").glob("manifest.v*.schema.json")
    }


def firmware_schema(version):
    """ESPHome reports project version followed by its own build version."""
    match = re.fullmatch(r"([1-9]\d*)\.\d+ \(ESPHome [^)]+\)", version or "")
    return int(match[1]) if match else None


class ManifestError(ValueError):
    """An error suitable for the internal API."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def validate(manifest, device_schema, schemas):
    """Validate device capabilities, then stamp the lowest compatible schema."""
    if device_schema is None:
        raise ManifestError("unknown_firmware", "Firmware-Version unbekannt")
    candidate = deepcopy(manifest)
    if not isinstance(candidate, dict) or type(candidate.get("schema")) is not int:
        raise ManifestError("invalid_manifest", "Invalid Manifest schema")
    # The input schema is a declaration, not a feature: saving canonicalizes it.
    limit = min(device_schema, max(schemas))
    candidate["schema"] = limit
    errors = list(schemas[limit].iter_errors(candidate))
    if errors:
        raise ManifestError("invalid_manifest", errors[0].message)
    for version in sorted(schemas):
        if version > limit:
            break
        candidate["schema"] = version
        if schemas[version].is_valid(candidate):
            break
    if len(json.dumps(candidate, ensure_ascii=False).encode()) > 32768:
        raise ManifestError("invalid_manifest", "Manifest exceeds 32 KiB")
    return candidate


def items(manifest):
    for page in manifest.get("pages", []):
        if page["type"] == "single":
            yield page["item"]
        elif page["type"] == "dial":
            yield page["minus"]
            yield page["plus"]
            yield from (item for item in page["items"] if item is not None)
        else:
            yield from (item for item in page["quarters"] if item is not None)
            if "center" in page:
                yield page["center"]


def countdowns(manifest):
    """Objects that can carry a timer: every Item and every Dial page."""
    yield from items(manifest)
    yield from (page for page in manifest.get("pages", []) if page["type"] == "dial")


def refs(manifest):
    """Every entity/attribute reference object: value refs and Aktiv refs."""
    for item in items(manifest):
        yield from item.get("value", {}).get("refs", [])
        if "active" in item:
            yield item["active"]
    for page in manifest.get("pages", []):
        if page["type"] == "dial":
            for name in ("status", "value", "caption"):
                yield from page.get(name, {}).get("refs", [])


def actions(manifest):
    yield from (item["action"] for item in items(manifest))
    yield from manifest.get("buttons", {}).values()


def subscriptions(manifest):
    """Match the core's entity/attribute subscription pairs, including timers."""
    result = set()
    for ref in refs(manifest):
        result.add((ref["entity"], ref.get("attribute", "")))
    for holder in countdowns(manifest):
        if "countdown" in holder:
            result.update(
                (holder["countdown"], attr) for attr in ("", "finishes_at", "duration")
            )
    if entity := manifest.get("display", {}).get("brightness"):
        result.add((entity, ""))
    return result


def references(manifest):
    result = {("entity_id", entity) for entity, _ in subscriptions(manifest)}
    for action in actions(manifest):
        if action["action"].startswith("script.") and action["action"] not in {
            "script.turn_on",
            "script.turn_off",
            "script.toggle",
            "script.reload",
        }:
            result.add(("entity_id", action["action"]))
        for kind, values in action.get("target", {}).items():
            result.update(
                (kind, value)
                for value in (values if isinstance(values, list) else [values])
            )
    return result


def rename(manifest, old, new):
    """Rewrite defined reference fields only; action data is opaque."""
    result = deepcopy(manifest)
    for ref in refs(result):
        if ref["entity"] == old:
            ref["entity"] = new
    for holder in countdowns(result):
        if holder.get("countdown") == old:
            holder["countdown"] = new
    if result.get("display", {}).get("brightness") == old:
        result["display"]["brightness"] = new
    for action in actions(result):
        target = action.get("target", {})
        value = target.get("entity_id")
        if isinstance(value, list):
            target["entity_id"] = [new if entity == old else entity for entity in value]
        elif value == old:
            target["entity_id"] = new
        if old.startswith("script.") and action["action"] == old:
            action["action"] = new
    return result
