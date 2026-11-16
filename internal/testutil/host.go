// Package testutil drives the very same C++ core compiled into the device.
package testutil

import (
	"bytes"
	"encoding/json"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func Root() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Clean(filepath.Join(filepath.Dir(file), "../.."))
}

func Host(t *testing.T, events any) map[string]any {
	t.Helper()
	input, err := json.Marshal(map[string]any{"events": events})
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(filepath.Join(Root(), ".build/manifest-host"))
	cmd.Stdin = bytes.NewReader(append(input, '\n'))
	raw, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("host (run make check-core first): %v\n%s", err, raw)
	}
	var result map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&result); err != nil {
		t.Fatal(err)
	}
	return result
}
