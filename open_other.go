//go:build !windows

package main

import (
	"os/exec"
	"runtime"
)

// otevře soubor výchozí aplikací systému
func openWithSystem(p string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", p).Start()
	}
	return exec.Command("xdg-open", p).Start()
}
