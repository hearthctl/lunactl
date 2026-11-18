import assert from "node:assert/strict";
import {test} from "node:test";
import {ManifestEditor} from "../../custom_components/lunactl/frontend/manifest-editor.js";

test("preview restores the editor's selected page after undoing invalid JSON", async () => {
  let Preview;
  // Provide the browser globals Lit reads on import. Exercise the preview's
  // update hook and SVG template without attaching the element to a document.
  globalThis.HTMLElement = class {};
  globalThis.document = {createTreeWalker() {}};
  globalThis.window = globalThis;
  globalThis.customElements = {define(_name, constructor) { Preview = constructor; }};
  await import("../../custom_components/lunactl/frontend/preview-element.js");

  const pages = ["First item", "Second item"].map((label) => ({
    type: "pie", quarters: [{label}, null, null, null],
  }));
  const editor = new ManifestEditor({manifest: {schema: 1, pages}}, undefined, undefined,
    {setTimeout() {}, clearTimeout() {}});
  editor.selectPage(1);
  const preview = new Preview();
  preview.page = editor.page;
  preview.source = editor.source;
  preview.willUpdate(new Map([["page", undefined], ["source", undefined]]));
  const svg = () => preview.render().values[2].values[0];
  assert.match(svg(), /Second item/);

  editor.edit("{");
  preview.source = editor.source;
  preview.willUpdate(new Map([["source", undefined]]));
  editor.undo();
  editor.setView("visual");
  assert.equal(editor.page, 1);
  preview.source = editor.source;
  preview.willUpdate(new Map([["source", "{"]]));
  assert.match(svg(), /Second item/);
});
