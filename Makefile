ESPHOME := uvx esphome@2026.10.2
.DEFAULT_GOAL := verify
CHECK_DIR := esphome/.check
CXXFLAGS := -std=c++17 -Wall -Wextra -Werror -O2
ARDUINOJSON := .build/include/ArduinoJson.h

# Same JSON implementation/version as ESPHome 2026.10.2.
$(ARDUINOJSON):
	mkdir -p $(@D)
	curl -fLsS https://github.com/bblanchon/ArduinoJson/releases/download/v7.4.3/ArduinoJson-v7.4.3.h -o $@.tmp
	echo 'ab5fbb8268b846b5f4bc5a5fee11bb2c96f7b8b846f5bef6540afb6a9cc76a5b  $@.tmp' | sha256sum -c -
	mv $@.tmp $@

.build/manifest-host: firmware/host.cpp esphome/lunactl/core.h esphome/lunactl/icons.h esphome/lunactl/battery.h $(ARDUINOJSON)
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

# 3D-printable wall mount. Needs the b123d-print workbench checkout (WORKBENCH),
# cad-3mf also Bambu Studio. The results in $(CAD_GEN) are versioned.
BAMBU ?= /Applications/BambuStudio.app/Contents/MacOS/BambuStudio
CAD_PART := cad/parts/wandhalter
CAD_GEN := $(CAD_PART)/generated
SLICER_PROFILES = $(WORKBENCH)/profiles/slicer/h2d-engineering

# The workbench always writes to out/; the finished tree is moved to generated/.
.PHONY: cad cad-3mf
cad:
	@test -n "$(WORKBENCH)" || { echo "set WORKBENCH to the b123d-print workbench checkout"; exit 1; }
	rm -rf $(CAD_PART)/out
	$(WORKBENCH)/.venv/bin/b123d-print --root cad build wandhalter
	$(WORKBENCH)/.venv/bin/b123d-print --root cad check wandhalter
	for part in body carrier; do \
		$(WORKBENCH)/.venv/bin/python $(WORKBENCH)/tools/verify_step.py \
			--model $(CAD_PART)/out/cad/wandhalter_$$part.step \
			--requirements cad/requirements/$$part.json \
			--report $(CAD_PART)/out/geometry-$$part.json > /dev/null || exit 1; \
	done
	# of the pictures the workbench renders, keep the assembly and the centre-line section
	find $(CAD_PART)/out/images -type f ! -name wandhalter_assembly.png ! -name wandhalter_yz0.png -delete
	rm -rf $(CAD_GEN)
	mv $(CAD_PART)/out $(CAD_GEN)
	# the reports name the model by its absolute path; keep the checkout location out of the repo
	for part in body carrier; do \
		sed -i.bak 's#$(CURDIR)/$(CAD_PART)/out/#$(CAD_GEN)/#' $(CAD_GEN)/geometry-$$part.json && rm $(CAD_GEN)/geometry-$$part.json.bak; \
	done

# Slices both plates for the Bambu Lab H2D and writes $(CAD_GEN)/h2d/wandhalter.3mf.
cad-3mf: cad
	mkdir -p $(CAD_GEN)/h2d
	cd cad && "$(BAMBU)" --load-assemble-list plates.json \
		--load-settings "$(SLICER_PROFILES)/machine.json;process.json" \
		--load-filaments "$(SLICER_PROFILES)/pla.json" \
		--curr-bed-type 'Engineering Plate' --nozzle-volume-type Standard,Standard \
		--filament-colour '#FFFFFF' --filament-map-mode Manual --filament-map 1 \
		--orient 0 --arrange 1 --slice 0 --export-3mf wandhalter.3mf \
		--outputdir $(CURDIR)/$(CAD_GEN)/h2d
	rm $(CAD_GEN)/h2d/plate_*.gcode  # the same G-code is inside the 3MF
