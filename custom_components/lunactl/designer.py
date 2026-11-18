"""Register the admin Designer and serve the installed ES modules unchanged."""

from hashlib import sha256
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig

from .store import DOMAIN


def _frontend_hash(frontend: Path) -> str:
    """Fingerprint installed paths and contents, excluding HACS gzip copies."""
    digest = sha256()
    for path in sorted(frontend.rglob("*")):
        if path.name.endswith(".gz") or not path.is_file():
            continue
        content = path.read_bytes()
        digest.update(path.relative_to(frontend).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()[:12]


async def async_register_designer(hass):
    frontend_path = Path(__file__).with_name("frontend")
    content_hash = await hass.async_add_executor_job(_frontend_hash, frontend_path)
    url = f"/lunactl/frontend/{content_hash}"
    # HTTP routes live until HA stops, even when the config entry is reloaded.
    if hass.data.get("lunactl_frontend_path") != url:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(url, str(frontend_path), True)]
        )
        hass.data["lunactl_frontend_path"] = url
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=DOMAIN,
        webcomponent_name="lunactl-designer",
        sidebar_title="lunactl",
        sidebar_icon="mdi:palette",
        module_url=f"{url}/panel.js",
        require_admin=True,
    )


def async_remove_designer(hass):
    frontend.async_remove_panel(hass, DOMAIN)
