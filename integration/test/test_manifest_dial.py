"""Dial pages in the Manifest helpers: items, subscriptions, references and rename."""

import pytest

from custom_components.lunactl.manifest import load_schemas, references, rename, subscriptions, validate

TIMER_ATTRS = {("timer.heat", ""), ("timer.heat", "finishes_at"), ("timer.heat", "duration")}


def dial_manifest():
    def item(label, color, action, **extra):
        return {"label": label, "color": color, "action": {"action": action}, **extra}

    return {
        "schema": 1,
        "pages": [
            {
                "type": "dial",
                "status": {"format": "{0}", "refs": [{"entity": "climate.room", "attribute": "hvac_action"}]},
                "value": {"format": "{0}°", "refs": [{"entity": "input_number.setpoint", "decimals": 0}]},
                "caption": {"format": "{0}", "refs": [{"entity": "sensor.room_temperature"}]},
                "minus": item("Kälter", "#374151", "script.minus", active={"entity": "climate.room", "states": ["heat"]}),
                "plus": item("Wärmer", "#374151", "script.plus"),
                "items": [
                    item("Kühlen", "#3B82F6", "script.cool", icon="mdi:snowflake",
                         active={"entity": "climate.room", "attribute": "preset", "states": ["cool"]}),
                    None,
                    item("Heizen", "#F0782A", "script.heat", icon="mdi:fire", value={"format": "{0}", "refs": [{"entity": "sensor.heater"}]}),
                ],
                "countdown": "timer.heat",
            }
        ],
    }


def test_dial_manifest_is_valid():
    validate(dial_manifest(), 1, load_schemas())


def test_dial_subscriptions():
    assert subscriptions(dial_manifest()) == {
        ("climate.room", "hvac_action"),
        ("climate.room", ""),
        ("climate.room", "preset"),
        ("input_number.setpoint", ""),
        ("sensor.room_temperature", ""),
        ("sensor.heater", ""),
    } | TIMER_ATTRS


def test_dial_references():
    assert references(dial_manifest()) == {
        ("entity_id", entity)
        for entity in (
            "climate.room",
            "input_number.setpoint",
            "sensor.room_temperature",
            "sensor.heater",
            "timer.heat",
            "script.minus",
            "script.plus",
            "script.cool",
            "script.heat",
        )
    }


@pytest.mark.parametrize(
    "old,new,path",
    [
        ("climate.room", "climate.new", lambda m: m["pages"][0]["status"]["refs"][0]["entity"]),
        ("climate.room", "climate.new", lambda m: m["pages"][0]["minus"]["active"]["entity"]),
        ("climate.room", "climate.new", lambda m: m["pages"][0]["items"][0]["active"]["entity"]),
        ("input_number.setpoint", "input_number.new", lambda m: m["pages"][0]["value"]["refs"][0]["entity"]),
        ("sensor.room_temperature", "sensor.new", lambda m: m["pages"][0]["caption"]["refs"][0]["entity"]),
        ("sensor.heater", "sensor.new", lambda m: m["pages"][0]["items"][2]["value"]["refs"][0]["entity"]),
        ("timer.heat", "timer.new", lambda m: m["pages"][0]["countdown"]),
        ("script.plus", "script.new", lambda m: m["pages"][0]["plus"]["action"]["action"]),
    ],
)
def test_dial_rename(old, new, path):
    renamed = rename(dial_manifest(), old, new)
    assert path(renamed) == new
    validate(renamed, 1, load_schemas())
