import assert from "node:assert/strict";
import {readFileSync, writeFileSync} from "node:fs";
import {test} from "node:test";
import {ManifestEditor, starterManifest, parseManifest} from "../../custom_components/lunactl/frontend/manifest-editor.js";
import {deviceList, deviceHeader} from "../../custom_components/lunactl/frontend/devices.js";
import {errorText} from "../../custom_components/lunactl/frontend/strings.js";

const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const copy = (value) => structuredClone(value);

class Clock {
  now = 0;
  next = 0;
  tasks = new Map();
  Date = {now: () => this.now};
  setTimeout = (fn, delay) => {
    this.tasks.set(++this.next, {fn, at: this.now + delay});
    return this.next;
  };
  clearTimeout = (id) => this.tasks.delete(id);
  async tick(ms) {
    const until = this.now + ms;
    while (true) {
      const first = [...this.tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!first || first[1].at > until) break;
      this.tasks.delete(first[0]);
      this.now = first[1].at;
      first[1].fn();
      await settle();
    }
    this.now = until;
    await settle();
  }
}

// Responses are API fixtures, not a second implementation of JSON Schema.
// The integration tests validate the same requests against the actual schema.
class Server {
  calls = [];
  holds = [];
  failures = [];
  constructor(record) { this.record = copy(record); }
  async call(message) {
    this.calls.push(copy(message));
    const kind = message.type.endsWith("/save") ? "save" : message.manifest ? "validate" : "read";
    const hold = this.holds.find((item) => item.kind === kind && !item.used);
    if (hold) {
      hold.used = true;
      await new Promise((resolve) => { hold.release = resolve; });
    }
    const failure = this.failures.findIndex((item) => item.kind === kind);
    if (failure !== -1) throw this.failures.splice(failure, 1)[0].error;
    if (kind === "save") {
      if (message.revision !== this.record.revision) throw {code: "stale_revision"};
      this.record.manifest = copy(message.manifest);
      this.record.revision++;
    }
    return copy(this.record);
  }
}

const base = {
  device_id: "bedroom", name: "Kinderzimmer", manifest: starterManifest(),
  revision: 2, online: true, firmware_version: "1.0 (ESPHome 2026.10.2)",
  schema_version: 1, highest_schema: 1, required_firmware: "1.0", will_restart: false,
};

for (const scenario of read("cases.json")) {
  test(scenario.name, async () => {
    const clock = new Clock();
    const record = {...copy(base), ...scenario.record};
    const server = new Server(record);
    const editor = new ManifestEditor(copy(record), (message) => server.call(message), () => {}, clock);
    const snapshots = [];
    function snapshot(step) {
      snapshots.push({step, status: editor.status, state: editor.saveText(), error: editor.error,
        revision: editor.record.revision, source: editor.source,
        calls: copy(server.calls)});
    }
    snapshot("initial");
    for (const step of scenario.steps) {
      switch (step.do) {
        case "edit": editor.edit(typeof step.value === "string" ? step.value : JSON.stringify(step.value)); break;
        case "create": editor.create(); break;
        case "tick": await clock.tick(step.ms); break;
        case "remote": Object.assign(server.record, copy(step.value)); break;
        case "refresh": editor.refresh({...copy(server.record), ...step.value}); break;
        case "reload": await editor.reload(); break;
        case "fail": server.failures.push({kind: step.kind, error: step.error}); break;
        case "hold": server.holds.push({kind: step.kind}); break;
        case "release": server.holds.find((item) => item.release)?.release(); break;
        case "close": editor.close(); break;
        default: throw new Error(`Unknown step ${step.do}`);
      }
      await settle();
      if (step.check) snapshot(step.check);
    }
    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(new URL(`golden/${scenario.name}.json`, import.meta.url), `${JSON.stringify(snapshots, null, 2)}\n`);
    }
    const expected = read(`golden/${scenario.name}.json`);
    assert.deepEqual(snapshots, expected);
    editor.close();
  });
}

for (const {name, source, error} of read("parsing.json")) {
  test(`parse: ${name}`, () => {
    const result = parseManifest(source);
    if (error) assert.equal(result.error, error);
    else assert.deepEqual(result.manifest, JSON.parse(source));
  });
}

test("device list and headers: German names, deterministic order and version drift", () => {
  const input = [
    {...copy(base), device_id: "z", name: "Zimmer 10"},
    {...copy(base), device_id: "b", name: "Zimmer 2", online: false},
    {...copy(base), device_id: "a", name: "Zimmer 2", firmware_version: null, schema_version: null},
    {...copy(base), device_id: "c", name: null, manifest: {schema: 2}, required_firmware: "2.0"},
  ];
  const before = copy(input);
  const headers = deviceList(input).map(deviceHeader);
  if (process.env.UPDATE_GOLDEN === "1") {
    writeFileSync(new URL("golden/devices.json", import.meta.url), `${JSON.stringify(headers, null, 2)}\n`);
  }
  assert.deepEqual(headers, read("golden/devices.json"));
  assert.deepEqual(input, before);
});

for (const row of read("errors.json")) {
  test(`German validation: ${row.name}`, () => assert.equal(errorText(row.input), row.output));
}
