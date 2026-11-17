//go:build linux

package main

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// složka Dokumenty podle XDG (v češtině bývá ~/Dokumenty), jinak ~/Documents
func documentsDir() string {
	home, _ := os.UserHomeDir()
	cfg := os.Getenv("XDG_CONFIG_HOME")
	if cfg == "" {
		cfg = filepath.Join(home, ".config")
	}
	if f, err := os.Open(filepath.Join(cfg, "user-dirs.dirs")); err == nil {
		defer f.Close()
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			l := strings.TrimSpace(sc.Text())
			if !strings.HasPrefix(l, "XDG_DOCUMENTS_DIR=") {
				continue
			}
			v := strings.Trim(strings.TrimPrefix(l, "XDG_DOCUMENTS_DIR="), `"`)
			v = strings.Replace(v, "$HOME", home, 1)
			if st, err := os.Stat(v); err == nil && st.IsDir() && v != home {
				return v
			}
		}
	}
	for _, n := range []string{"Dokumenty", "Documents"} {
		if st, err := os.Stat(filepath.Join(home, n)); err == nil && st.IsDir() {
			return filepath.Join(home, n)
		}
	}
	return ""
}
