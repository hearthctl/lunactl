"""Keep the device's response template compatible with HA's actual renderer."""

import json
from pathlib import Path
import re
from textwrap import dedent

from homeassistant.helpers.json import json_bytes
from homeassistant.helpers.template import Template
import pytest
import yaml


def deep_manifest():
    value = {}
    for _ in range(32):
        value = {"n": value}
    return value


def encrypted_response_size(response):
    data_size = len(json_bytes(response))
    # HomeassistantActionResponse: call_id (worst-case uint32), success, and
    # response_data (tag, varint length and payload). Noise adds a 4-byte
    # message header and a 16-byte authentication tag to the encrypted body.
    return 6 + 2 + 1 + (data_size.bit_length() + 6) // 7 + data_size + 4 + 16


@pytest.mark.parametrize(
    "text", ['"' * 12000, "日" * 10860], ids=["escaped-quotes", "near-limit-utf8"]
)
async def test_manifest_response_fits_encrypted_frame(hass, text):
    manifest = {
        "schema": 1,
        "pages": [
            {
                "type": "single",
                "item": {
                    "label": "Text",
                    "color": "#123456",
                    "action": {"action": "script.message", "data": {"text": text}},
                },
            }
        ],
    }
    assert encrypted_response_size({"response": manifest}) <= 32768
    response = render_manifest_response(hass, manifest)
    assert encrypted_response_size(response) <= 32768
    body = response["response"]
    decoded = json.loads(body["manifest_json"]) if "manifest_json" in body else body
    assert decoded == manifest


def render_manifest_response(hass, manifest):
    firmware = (Path(__file__).parents[2] / "esphome/lunactl.yaml").read_text()
    match = re.search(
        r"^ +response_template: [^\n]+\n(?: {12}[^\n]+\n)*", firmware, re.MULTILINE
    )
    assert match is not None
    template = Template(yaml.safe_load(dedent(match[0]))["response_template"], hass)
    # ESPHome's HA integration wraps the rendered result in {"response": ...}.
    return {"response": template.async_render({"response": manifest}, strict=True)}


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
    response = render_manifest_response(hass, manifest)
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
