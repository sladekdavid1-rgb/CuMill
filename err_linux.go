//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// chyba při startu: do terminálu a, je-li to možné, do okna
func showError(msg string) {
	fmt.Fprintln(os.Stderr, "KiMill: "+msg)
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		return
	}
	if t := dialogTool(); t != "" {
		if filepath.Base(t) == "kdialog" {
			_ = exec.Command(t, "--title", "KiMill", "--error", msg).Run()
		} else {
			_ = exec.Command(t, "--error", "--title=KiMill", "--no-wrap", "--text="+msg).Run()
		}
		return
	}
	if p, err := exec.LookPath("notify-send"); err == nil {
		_ = exec.Command(p, "-u", "critical", "KiMill", msg).Run()
	}
}
