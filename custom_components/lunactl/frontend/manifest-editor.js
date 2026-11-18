import {errorText, text} from "./strings.js";
import {History} from "./history.js";
import {canEditManifest, slotsFor, addPage, removePage, reorderPage,
  switchPageType, addItem, removeItem} from "./manifest-operations.js";

export const AUTOSAVE_MS = 1000;

export function starterManifest() {
  return {schema: 1, pages: [{type: "pie", quarters: [null, null, null, null]}]};
}

export function parseManifest(source) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    return {error: text.jsonInvalid};
  }
  if (!manifest || Array.isArray(manifest) || typeof manifest !== "object") {
    return {error: text.objectRequired};
  }
  return {manifest};
}

// This owns debounce, validation and revision handling; it needs no Lit or DOM.
// callWS and clock are injected so races and timing are deterministic in Node.
export class ManifestEditor {
  constructor(record, callWS, changed = () => {}, clock = globalThis) {
    this.callWS = callWS;
    this.changed = changed;
    this.clock = clock;
    this.generation = 0;
    this.version = 0;
    this.running = false;
    this.queued = false;
    this.closed = false;
    this.replace(record);
  }

  replace(record) {
    this.cancelTimer();
    this.generation++;
    this.record = record;
    this.source = Object.keys(record.manifest).length ?
      JSON.stringify(record.manifest, null, 2) : "";
    this.history = new History(this.source);
    this.view = "visual";
    this.page = 0;
    this.slot = null;
    this.pendingSwitch = null;
    this.status = this.source ? "saved" : "empty";
    this.error = "";
    this.restartUntil = 0;
    this.changed();
  }

  refresh(record) {
    // Polls must never replace a draft, its base revision or a conflict.
    if (!this.running && ["saved", "empty"].includes(this.status) &&
        record.revision > this.record.revision) {
      this.replace(record);
    } else {
      for (const key of ["name", "online", "firmware_version", "schema_version",
        "highest_schema", "required_firmware"]) this.record[key] = record[key];
      this.changed();
    }
  }

  create() {
    if (this.status === "empty") this.edit(JSON.stringify(starterManifest(), null, 2));
  }

  edit(source) {
    if (this.closed) return;
    this.history.push(source);
    this.setSource(source);
  }

  undo() { this.restore(this.history.undo()); }
  redo() { this.restore(this.history.redo()); }
  restore(source) {
    if (source !== undefined && !this.closed) this.setSource(source);
  }

  setSource(source) {
    this.source = source;
    if (parseManifest(source).error) this.view = "json";
    this.pendingSwitch = null;
    const manifest = this.manifest;
    if (canEditManifest(manifest)) {
      this.page = Math.min(this.page, manifest.pages.length - 1);
      if (!slotsFor(manifest.pages[this.page]).includes(this.slot)) this.slot = null;
    }
    this.version++;
    this.error = "";
    this.cancelTimer();
    if (this.status !== "conflict") {
      const parsed = parseManifest(source);
      this.status = parsed.error ? "invalid" : "dirty";
      this.error = parsed.error || "";
      if (!parsed.error) this.schedule();
    }
    this.changed();
  }

  get manifest() { return parseManifest(this.source).manifest; }

  setView(view) {
    if (!["visual", "json"].includes(view) || parseManifest(this.source).error) return false;
    this.view = view;
    this.changed();
    return true;
  }

  selectPage(page) {
    const pages = this.manifest?.pages;
    if (!Array.isArray(pages) || !Number.isInteger(page) ||
        page < 0 || page >= Math.min(6, pages.length)) return;
    this.page = page;
    this.slot = null;
    this.pendingSwitch = null;
    this.changed();
  }

  selectSlot(slot) {
    if (!slotsFor(this.manifest?.pages?.[this.page]).includes(slot)) return;
    this.slot = slot;
    this.changed();
  }

  apply(manifest) {
    if (manifest) this.edit(JSON.stringify(manifest, null, 2));
  }

  addPage(type) {
    const before = this.manifest;
    const after = addPage(before, type);
    if (after === before) return;
    this.page = after.pages.length - 1;
    this.slot = null;
    this.apply(after);
  }

  removePage() { this.slot = null; this.apply(removePage(this.manifest, this.page)); }

  reorderPage(direction) {
    const before = this.manifest;
    const after = reorderPage(before, this.page, direction);
    if (before === after) return;
    this.page += direction;
    this.apply(after);
  }

  requestPageType(type) {
    const before = this.manifest;
    const plan = switchPageType(before, this.page, type);
    if (plan.manifest === before) {
      this.cancelPageType();
      return;
    }
    if (plan.dropped.length) {
      this.pendingSwitch = {type, dropped: plan.dropped};
      this.changed();
    } else {
      this.slot = null;
      this.apply(plan.manifest);
    }
  }

  confirmPageType() {
    if (!this.pendingSwitch) return;
    const plan = switchPageType(this.manifest, this.page, this.pendingSwitch.type);
    this.slot = null;
    this.apply(plan.manifest);
  }

  cancelPageType() { this.pendingSwitch = null; this.changed(); }
  addItem() { this.apply(addItem(this.manifest, this.page, this.slot)); }
  removeItem() { this.apply(removeItem(this.manifest, this.page, this.slot)); }

  schedule() {
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, AUTOSAVE_MS);
  }

  cancelTimer() {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
    this.queued = false;
  }

  async flush() {
    if (this.closed || ["conflict", "empty", "invalid"].includes(this.status)) return;
    if (this.running) {
      this.queued = true;
      return;
    }
    const {manifest, error} = parseManifest(this.source);
    if (error) return;
    const generation = this.generation;
    const version = this.version;
    const current = () => !this.closed && generation === this.generation;
    this.running = true;
    this.status = "validating";
    this.changed();
    try {
      // This endpoint validates with the device schema without changing storage.
      await this.callWS({type: "lunactl/manifest/get",
        device_id: this.record.device_id, manifest});
      if (!current() || version !== this.version) return;
      this.status = "saving";
      this.changed();
      const result = await this.callWS({type: "lunactl/manifest/save",
        device_id: this.record.device_id, revision: this.record.revision, manifest});
      if (!current()) return;
      this.record = result;
      this.restartUntil = result.will_restart ? this.clock.Date.now() + 10000 : 0;
      // A response to an older edit may advance the revision, never erase typing.
      if (version === this.version) {
        this.source = JSON.stringify(result.manifest, null, 2);
        this.history.replace(this.source);
        this.status = "saved";
        this.error = "";
      }
    } catch (failure) {
      if (!current()) return;
      if (failure.code === "stale_revision") {
        this.cancelTimer();
        this.status = "conflict";
        this.error = "";
      } else if (version === this.version) {
        this.status = ["invalid_manifest", "unknown_firmware"].includes(failure.code) ?
          "invalid" : "error";
        this.error = errorText(failure);
      }
    } finally {
      this.running = false;
      this.changed();
      if (this.queued && !this.closed) {
        this.queued = false;
        void this.flush();
      }
    }
  }

  async reload() {
    // The read must finish before dropping local changes or releasing a conflict.
    const generation = this.generation;
    const version = this.version;
    try {
      const result = await this.callWS({type: "lunactl/manifest/get",
        device_id: this.record.device_id});
      if (!this.closed && generation === this.generation && version === this.version) {
        this.replace(result);
      }
    } catch (failure) {
      this.error = errorText(failure);
      this.changed();
    }
  }

  saveText() {
    if (this.status !== "saved") return text[this.status];
    if (!this.record.online) return text.savedOffline;
    if (this.restartUntil > this.clock.Date.now()) return text.savedRestart;
    return text.saved;
  }

  close() {
    this.closed = true;
    this.cancelTimer();
    this.generation++;
  }
}
