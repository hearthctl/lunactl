ESPHOME := uvx esphome@2026.10.2
CHECK_DIR := esphome/.check

# Validates and compiles the firmware with the example secrets, so it runs
# without the real secrets file.
.PHONY: check-firmware
check-firmware:
	mkdir -p $(CHECK_DIR)
	cp esphome/lunactl.yaml $(CHECK_DIR)/lunactl.yaml
	cp esphome/secrets.example.yaml $(CHECK_DIR)/secrets.yaml
	$(ESPHOME) config $(CHECK_DIR)/lunactl.yaml
	$(ESPHOME) compile $(CHECK_DIR)/lunactl.yaml
