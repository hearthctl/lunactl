"""Keep the device's response template compatible with HA's actual renderer."""

import json
from pathlib import Path
import re

from homeassistant.helpers.template import Template
import pytest


def deep_manifest():
    value = {}
    for _ in range(32):
        value = {"n": value}
    return value


@pytest.mark.parametrize(
    "manifest",
    [
        {},
        {"schema": 2, "pages": []},
        {"schema": 1, "extra": True},
        {"label": "Grüße", "quoted": 'a "quote" and \\ slash'},
        deep_manifest(),
    ],
)
async def test_manifest_response_template(hass, manifest):
    firmware = (Path(__file__).parents[2] / "esphome/lunactl.yaml").read_text()
    match = re.search(r'^\s+response_template: (".*")$', firmware, re.MULTILINE)
    assert match is not None
    template = Template(json.loads(match[1]), hass)
    # ESPHome's HA integration wraps the rendered result in {"response": ...}.
    response = {"response": template.async_render({"response": manifest}, strict=True)}
    assert isinstance(response["response"], dict)
    text = response["response"]["manifest_json"]
    assert isinstance(text, str)
    assert json.loads(text) == manifest
    # It stays a string even when it looks like JSON; the wire envelope has
    # fixed depth regardless of the depth of the Manifest.
    wire = json.loads(json.dumps(response, ensure_ascii=False))
    assert wire["response"]["manifest_json"] == text
    if "label" in manifest:
        assert "Grüße" in text
