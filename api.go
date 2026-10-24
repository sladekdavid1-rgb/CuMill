package main

// Lokální API pro vlastní okno: čtení/zápis souborů a nativní dialogy.
// Přístup jen ze stránky KiMill: vlastní hlavička X-KiMill (cizí stránky ji kvůli CORS poslat nemůžou)
// a kontrola Host (proti DNS rebindingu).

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

func registerAPI(mux *http.ServeMux) {
	guard := func(h func(w http.ResponseWriter, r *http.Request) error) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-KiMill") != "1" || !hostOK(r.Host) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			if err := h(w, r); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		}
	}
	registerMachineAPI(mux, guard)
	registerProjectsAPI(mux, guard)
	mux.HandleFunc("/api/caps", guard(func(w http.ResponseWriter, r *http.Request) error {
		return writeJSON(w, map[string]any{"native": webviewMode.Load(), "os": runtime.GOOS})
	}))
	mux.HandleFunc("/api/read", guard(func(w http.ResponseWriter, r *http.Request) error {
		p := r.URL.Query().Get("path")
		st, err := os.Stat(p)
		if err != nil {
			return errors.New("soubor nelze otevřít: " + p)
		}
		if st.IsDir() || st.Size() > 100<<20 {
			return errors.New("není to soubor desky: " + p)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		w.Header().Set("X-Mtime", strconv.FormatInt(st.ModTime().UnixMilli(), 10))
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, err = w.Write(b)
		return err
	}))
	mux.HandleFunc("/api/stat", guard(func(w http.ResponseWriter, r *http.Request) error {
		st, err := os.Stat(r.URL.Query().Get("path"))
		if err != nil {
			return writeJSON(w, map[string]any{"mtime": 0})
		}
		return writeJSON(w, map[string]any{"mtime": st.ModTime().UnixMilli(), "size": st.Size()})
	}))
	mux.HandleFunc("/api/open", guard(func(w http.ResponseWriter, r *http.Request) error {
		var req struct{ Start, Kind string }
		_ = json.NewDecoder(r.Body).Decode(&req)
		paths, err := openFilesDialog(req.Start, req.Kind)
		if err != nil {
			return err
		}
		return writeJSON(w, map[string]any{"paths": paths})
	}))
	mux.HandleFunc("/api/pick-dir", guard(func(w http.ResponseWriter, r *http.Request) error {
		var req struct{ Start string }
		_ = json.NewDecoder(r.Body).Decode(&req)
		p, err := pickFolderDialog(req.Start)
		if err != nil {
			return err
		}
		return writeJSON(w, map[string]any{"path": p})
	}))
	mux.HandleFunc("/api/write", guard(func(w http.ResponseWriter, r *http.Request) error {
		var req struct {
			Dir         string
			Files       []struct{ Name, Text string }
			CleanPrefix string
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return err
		}
		n, removed, err := writeFiles(req.Dir, req.Files, req.CleanPrefix)
		if err != nil {
			return err
		}
		return writeJSON(w, map[string]any{"written": n, "removed": removed})
	}))
}

var oldProgram = regexp.MustCompile(`_\d\d_.+\.nc$`)

func writeFiles(dir string, files []struct{ Name, Text string }, prefix string) (int, int, error) {
	st, err := os.Stat(dir)
	if err != nil || !st.IsDir() {
		return 0, 0, errors.New("složka neexistuje: " + dir)
	}
	keep := map[string]bool{}
	for _, f := range files {
		if f.Name == "" || strings.ContainsAny(f.Name, `/\:*?"<>|`) || strings.Contains(f.Name, "..") {
			return 0, 0, errors.New("neplatný název souboru: " + f.Name)
		}
		keep[strings.ToLower(f.Name)] = true
	}
	// staré programy této desky (stejná předpona, jiné číslo/název) smazat, ať nezůstanou zastaralé
	removed := 0
	if prefix != "" && !strings.ContainsAny(prefix, `/\`) {
		if ents, err := os.ReadDir(dir); err == nil {
			for _, e := range ents {
				n := e.Name()
				if !e.IsDir() && strings.HasPrefix(n, prefix) && oldProgram.MatchString(n) && !keep[strings.ToLower(n)] {
					if os.Remove(filepath.Join(dir, n)) == nil {
						removed++
					}
				}
			}
		}
	}
	for _, f := range files {
		if err := os.WriteFile(filepath.Join(dir, f.Name), []byte(f.Text), 0o644); err != nil {
			return 0, removed, err
		}
	}
	return len(files), removed, nil
}

func hostOK(h string) bool {
	_, port, _ := strings.Cut(serverAddr, ":")
	return h == "127.0.0.1:"+port || h == "localhost:"+port
}

func writeJSON(w http.ResponseWriter, v any) error {
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(v)
}
