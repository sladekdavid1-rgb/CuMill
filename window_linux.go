//go:build linux

package main

// Linux: vlastní okno není (UI běží v Chromiu / Chromu v režimu aplikace nebo v prohlížeči),
// dialogy pro soubory a složky přes zenity (GNOME, Xfce, Cinnamon, MATE) nebo kdialog (KDE).

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

func runWindow(url string) bool { return false }

var dialogMu sync.Mutex

// nástroj pro dialogy: na KDE přednostně kdialog, jinak zenity
func dialogTool() string {
	kde := strings.Contains(strings.ToUpper(os.Getenv("XDG_CURRENT_DESKTOP")), "KDE")
	order := []string{"zenity", "kdialog"}
	if kde {
		order = []string{"kdialog", "zenity"}
	}
	for _, t := range order {
		if p, err := exec.LookPath(t); err == nil {
			return p
		}
	}
	return ""
}

// s dialogy umí KiMill pracovat se soubory přes cesty (sledování změn, znovunačtení, projekty)
func hostDialogs() bool {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		return false
	}
	return dialogTool() != ""
}

var errNoDialog = errors.New("chybí program pro dialogy – nainstaluj zenity (sudo apt install zenity) nebo kdialog")

type filt struct{ name, globs string }

func openFilesDialog(start, kind string) ([]string, error) {
	if kind == "gcode" {
		return fileDialog("Otevřít G-kód", start, false, true, []filt{
			{"G-kód (nc, ngc, gcode, tap)", "*.nc *.NC *.ngc *.gcode *.gc *.tap *.cnc *.txt"},
			{"Všechny soubory", "*"},
		})
	}
	return fileDialog("Otevřít desku KiCad nebo gerbery", start, false, true, []filt{
		{"Deska KiCad, projekt KiMill, gerbery, vrtání", "*.kicad_pcb *.kimill *.cumill *.gbr *.gtl *.gbl *.gko *.gm1 *.gml *.drl *.xln *.exc *.GBR *.GTL *.GBL *.GKO *.DRL"},
		{"Projekt KiMill (kimill)", "*.kimill *.cumill"},
		{"Deska KiCad (kicad_pcb)", "*.kicad_pcb"},
		{"Všechny soubory", "*"},
	})
}

func pickFolderDialog(start string) (string, error) {
	p, err := fileDialog("Vyber složku", start, true, false, nil)
	if err != nil || len(p) == 0 {
		return "", err
	}
	return p[0], nil
}

func fileDialog(title, start string, folder, multi bool, filters []filt) ([]string, error) {
	tool := dialogTool()
	if tool == "" {
		return nil, errNoDialog
	}
	dialogMu.Lock()
	defer dialogMu.Unlock()
	if start != "" {
		if st, err := os.Stat(start); err == nil && !st.IsDir() {
			start = filepath.Dir(start)
		}
	}
	if start == "" {
		start, _ = os.UserHomeDir()
	}
	var args []string
	if filepath.Base(tool) == "kdialog" {
		args = []string{"--title", title}
		if folder {
			args = append(args, "--getexistingdirectory", start)
		} else {
			var fs []string
			for _, f := range filters {
				fs = append(fs, f.name+" ("+f.globs+")")
			}
			args = append(args, "--getopenfilename", start, strings.Join(fs, "\n"))
			if multi {
				args = append(args, "--multiple", "--separate-output")
			}
		}
	} else {
		args = []string{"--file-selection", "--title=" + title, "--filename=" + strings.TrimSuffix(start, "/") + "/"}
		if folder {
			args = append(args, "--directory")
		}
		if multi {
			args = append(args, "--multiple", "--separator=\n")
		}
		for _, f := range filters {
			args = append(args, "--file-filter="+f.name+" | "+f.globs)
		}
	}
	out, err := exec.Command(tool, args...).Output()
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) && ee.ExitCode() == 1 {
			return nil, nil // zrušeno
		}
		return nil, errors.New("dialog selhal: " + err.Error())
	}
	var paths []string
	for _, l := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if l = strings.TrimSpace(l); l != "" {
			paths = append(paths, l)
		}
	}
	return paths, nil
}
