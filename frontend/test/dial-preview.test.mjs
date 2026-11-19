import assert from "node:assert/strict";
import {readFileSync, writeFileSync} from "node:fs";
import {test} from "node:test";
import {renderPreview} from "../../custom_components/lunactl/frontend/preview.js";

for (const name of ["dial", "dial-active", "dial-disconnected"]) {
  test(`Dial SVG follows firmware events: ${name}`, () => {
    const {events, want} = JSON.parse(readFileSync(new URL(`../../firmware/test/testdata/${name}.json`, import.meta.url)));
    let manifest, connected = false, timestamp;
    const states = {};
    const frames = [];
    for (const [i, event] of events.entries()) {
      if (event.type === "connect") connected = true;
      if (event.type === "disconnect") connected = false;
      if (event.type === "manifest" && !want.snapshots[i].error) manifest = event.manifest;
      if (event.type === "time") timestamp = event.valid === false ? undefined : event.timestamp ?? timestamp;
      if (event.type === "state" && connected) {
        const state = states[event.entity] ??= {attributes: {}};
        if (event.attribute) state.attributes[event.attribute] = event.state;
        else state.state = event.state;
      }
      if (!manifest || want.snapshots[i].type !== "dial") continue;
      const svg = renderPreview(manifest, states, {timestamp, clock: "12:00"}, want.snapshots[i].page);
      assert.match(svg, /font-size="96"/);
      const expected = want.snapshots[i].dial;
      if (expected.status.length) assert.ok(svg.includes(`fill="${expected.color}">${expected.status}</text>`));
      assert.equal(svg.includes('data-slot="0"'), expected.minus.visible);
      assert.equal(svg.includes('data-slot="1"'), expected.plus.visible);
      for (const [slot, item] of expected.items.entries()) {
        assert.equal(svg.includes(`data-slot="${slot + 2}"`), item.tappable);
      }
      if (frames.at(-1) !== svg) frames.push(svg);
    }
    assert.ok(frames.length > 0);
    const url = new URL(`golden/svg/${name}.svg`, import.meta.url);
    const result = frames.join("\n");
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(url, result);
    assert.equal(result, readFileSync(url, "utf8"));
  });
}

test("Dial hints cover page values, active references and unsupported glyphs", async () => {
  const {manifestHints, textFitHints} = await import("../../custom_components/lunactl/frontend/hints.js");
  const manifest = {pages: [{type: "dial", value: {format: "{0} °C", refs: [{entity: "sensor.room"}]},
    minus: {active: {entity: "climate.room", states: ["cool"]}}, items: [null, null, null]}]};
  assert.deepEqual(manifestHints(manifest).map(({path}) => path),
    ["pages[0].minus.active.entity", "pages[0].value.refs[0].entity"]);
  assert.deepEqual(textFitHints(manifest, {"sensor.room": {state: "20"}}, () => 10),
    [{kind: "dial-glyphs", path: "pages[0].value", page: 0}]);
});
