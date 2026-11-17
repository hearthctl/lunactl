package test

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

// Compile the production subscription lambda with the pinned API's signatures.
// The firmware compile also checks these against ESPHome itself.
func TestProductionValueSubscriptions(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	match := regexp.MustCompile(`(?s)- id: sync_subscriptions\n.*?- lambda: \|-\n(.*?)\n  - id: wake_display`).FindStringSubmatch(string(raw))
	if match == nil {
		t.Fatal("missing subscription adapter")
	}
	if !regexp.MustCompile(`homeassistant_states: true`).Match(raw) ||
		!regexp.MustCompile(`(?s)on_success:.*?- script.execute: render_manifest\n\s+- script.execute: sync_subscriptions`).Match(raw) {
		t.Fatal("Manifest response must reconcile subscriptions with HA state support enabled")
	}
	checkAdapter(t, `#include "core.h"
#include <functional>
#include <memory>
#define id(name) name
struct StringRef {
 std::string text;
 const char *c_str() const { return text.c_str(); }
 size_t size() const { return text.size(); }
};
struct Client { int drops{0}; void on_fatal_error() { ++drops; } };
struct Server {
 struct Subscription { const char *entity, *attribute; std::function<void(StringRef)> callback; };
 std::vector<Subscription> subscriptions;
 std::vector<std::unique_ptr<Client>> clients;
 void subscribe_home_assistant_state(const char *entity, const char *attribute, std::function<void(StringRef)> &&callback) {
   subscriptions.push_back({entity, attribute, std::move(callback)});
 }
 const auto &active_clients() const { return clients; }
};
namespace api { Server *global_api_server; }
struct { int reboots{0}; void safe_reboot() { ++reboots; } } App;
lunactl::Core manifest_core;
struct { int calls{0}; void execute() { ++calls; } } render_manifest;
int main() {
 Server server;
 api::global_api_server = &server;
 server.clients.emplace_back(new Client);
 server.clients.emplace_back(new Client);
 auto sync = [&]() { `+match[1]+` };
 manifest_core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"Temperatur","color":"#123456","action":{"action":"script.example"},"value":{"format":"{0} / {1}","refs":[{"entity":"sensor.room","decimals":1,"decimal_comma":true},{"entity":"climate.room","attribute":"hvac_action","map":{"heating":"Heizen"}},{"entity":"sensor.room"}]}}}]})";
 if (!manifest_core.accept_json(manifest_core.begin_fetch(), manifest, error)) return 1;
 sync();
 if (server.subscriptions.size() != 2 || server.clients[0]->drops != 1 || server.clients[1]->drops != 1 || App.reboots) return 2;
 auto &temp = server.subscriptions[0];
 auto &mode = server.subscriptions[1];
 if (std::string(temp.entity) != "sensor.room" || temp.attribute != nullptr || std::string(mode.entity) != "climate.room" || std::string(mode.attribute) != "hvac_action") return 3;
 manifest_core.set_connected(false);
 temp.callback({"99"});
 manifest_core.set_connected(true);
 if (!manifest_core.accept_json(manifest_core.begin_fetch(), manifest, error)) return 4;
 if (manifest_core.value() != "-- / --") return 5;
 temp.callback({"21.26"});
 mode.callback({"heating"});
 if (manifest_core.value() != "21,3 / Heizen" || render_manifest.calls != 3) return 6;
 sync();
 if (server.subscriptions.size() != 2 || server.clients[0]->drops != 1 || App.reboots) return 7;
 // Replacement keeps the original registry strings alive for the API.
 std::string replacement = manifest;
 replacement.replace(replacement.find("{0} / {1}"), 9, "Neu: {0}");
 if (!manifest_core.accept_json(manifest_core.begin_fetch(), replacement, error)) return 8;
 temp.callback({"22"});
 if (manifest_core.value() != "Neu: 22,0" || std::string(mode.attribute) != "hvac_action") return 9;
 sync();
 if (App.reboots || server.clients[1]->drops != 1) return 10;
 replacement.replace(replacement.find("sensor.room"), 11, "sensor.new");
 if (manifest_core.accept_json(manifest_core.begin_fetch(), replacement, error)) return 11;
 sync();
 if (App.reboots != 1 || server.subscriptions.size() != 2 || server.clients[0]->drops != 1) return 12;
 sync();
 if (App.reboots != 1) return 13;
}
`)
}
