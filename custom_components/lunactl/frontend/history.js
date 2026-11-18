// Session history of JSON source, including invalid drafts. No DOM or storage.
export class History {
  constructor(source) { this.entries = [source]; this.index = 0; }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.entries.length - 1; }
  push(source) {
    if (source === this.entries[this.index]) return false;
    this.entries.splice(this.index + 1);
    this.entries.push(source);
    this.index++;
    return true;
  }
  // Successful saves may normalize whitespace/schema without creating an edit.
  replace(source) { this.entries[this.index] = source; }
  undo() { return this.canUndo ? this.entries[--this.index] : undefined; }
  redo() { return this.canRedo ? this.entries[++this.index] : undefined; }
}
