ESPHOME := uvx esphome@2026.10.2
.DEFAULT_GOAL := check-firmware
CHECK_DIR := esphome/.check
CXXFLAGS := -std=c++17 -Wall -Wextra -Werror -O2
ARDUINOJSON := .build/include/ArduinoJson.h

# Same JSON implementation/version as ESPHome 2026.10.2.
$(ARDUINOJSON):
	mkdir -p $(@D)
	curl -fLsS https://github.com/bblanchon/ArduinoJson/releases/download/v7.4.3/ArduinoJson-v7.4.3.h -o $@.tmp
	echo 'ab5fbb8268b846b5f4bc5a5fee11bb2c96f7b8b846f5bef6540afb6a9cc76a5b  $@.tmp' | sha256sum -c -
	mv $@.tmp $@

.build/manifest-host: firmware/host.cpp esphome/lunactl/core.h esphome/lunactl/battery.h $(ARDUINOJSON)
	$(CXX) $(CXXFLAGS) -I.build/include firmware/host.cpp -o $@

.PHONY: verify e2e check-core check-schema check-contracts
verify: check-core check-schema check-firmware
e2e: check-contracts

check-core: .build/manifest-host
	go test -count=1 -v ./firmware/test

check-schema: .build/manifest-host
	go test -count=1 -v ./schema/test

check-contracts: .build/manifest-host
	./contracts/test/run.sh

# Validates and compiles the firmware with the example secrets, so it runs
# without the real secrets file.
.PHONY: check-firmware
check-firmware:
	mkdir -p $(CHECK_DIR)
	cp esphome/lunactl.yaml $(CHECK_DIR)/lunactl.yaml
	cp esphome/secrets.example.yaml $(CHECK_DIR)/secrets.yaml
	cp -R esphome/lunactl $(CHECK_DIR)/
	$(ESPHOME) config $(CHECK_DIR)/lunactl.yaml
	$(ESPHOME) compile $(CHECK_DIR)/lunactl.yaml
