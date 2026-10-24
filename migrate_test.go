package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMigrateOldName(t *testing.T) {
	root := t.TempDir()
	old := filepath.Join(root, "CuMill", "Projekty")
	if err := os.MkdirAll(old, 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(old, "deska.cumill"), []byte("{}"), 0o644)
	base, moved := appFolder(root)
	if !moved || base != filepath.Join(root, "KiMill") {
		t.Fatalf("složka nepřejmenována: %s %v", base, moved)
	}
	renameOldProjects(filepath.Join(base, "Projekty"))
	if _, err := os.Stat(filepath.Join(base, "Projekty", "deska.kimill")); err != nil {
		t.Fatal("projekt nepřejmenován")
	}
	if b2, m2 := appFolder(root); m2 || b2 != base {
		t.Fatal("druhé volání má jen vrátit novou složku")
	}
}
