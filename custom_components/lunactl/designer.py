"""Register the admin Designer and serve the installed ES modules unchanged."""

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.loader import async_get_integration

from .store import DOMAIN


async def async_register_designer(hass):
    integration = await async_get_integration(hass, DOMAIN)
    url = f"/lunactl/frontend/{integration.version}"
    # HTTP routes live until HA stops, even when the config entry is reloaded.
    if hass.data.get("lunactl_frontend_path") != url:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(url, str(Path(__file__).with_name("frontend")), True)]
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
