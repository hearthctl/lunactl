"""Set up Manifest storage once per Home Assistant installation."""

from homeassistant import config_entries


class ConfigFlow(config_entries.ConfigFlow, domain="lunactl"):
    """The integration has no household configuration."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="lunactl", data={})
        return self.async_show_form(step_id="user")
