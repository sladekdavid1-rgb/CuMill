package main

// Přechod ze starého názvu CuMill na KiMill: složky s daty (nastavení okna, projekty) se jednou
// přejmenují, staré projekty .cumill dostanou příponu .kimill. Když přejmenování nejde
// (např. ještě běží stará verze), použije se dál stará složka – nic se neztratí.

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const appName, oldAppName = "KiMill", "CuMill"

var migrateMu sync.Mutex

// vrátí parent\KiMill; existuje-li jen parent\CuMill, přejmenuje ji (nebo ji použije, když to nejde)
func appFolder(parent string) (string, bool) {
	migrateMu.Lock()
	defer migrateMu.Unlock()
	nw, old := filepath.Join(parent, appName), filepath.Join(parent, oldAppName)
	if _, err := os.Stat(nw); err == nil {
		return nw, false
	}
	if st, err := os.Stat(old); err == nil && st.IsDir() {
		if os.Rename(old, nw) == nil {
			return nw, true
		}
		return old, false
	}
	return nw, false
}

// staré projekty *.cumill -> *.kimill (jen když cílový soubor ještě neexistuje)
func renameOldProjects(dir string) {
	ents, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range ents {
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".cumill") {
			continue
		}
		p := filepath.Join(dir, e.Name())
		np := strings.TrimSuffix(p, filepath.Ext(p)) + projectExt
		if _, err := os.Stat(np); os.IsNotExist(err) {
			_ = os.Rename(p, np)
		}
	}
}
