package main

// Projekty KiMillu (.kimill) ve složce projektů: seznam, uložení, přejmenování, kopie, smazání.

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

var oldProjectsOnce sync.Once

// výchozí složka projektů: Dokumenty\KiMill\Projekty (dřív Dokumenty\CuMill\Projekty)
func defaultProjectsDir() string {
	docs := documentsDir()
	if docs == "" {
		h, _ := os.UserHomeDir()
		docs = filepath.Join(h, "Documents")
	}
	base, _ := appFolder(docs)
	dir := filepath.Join(base, "Projekty")
	oldProjectsOnce.Do(func() { renameOldProjects(dir) })
	return dir
}

type projectInfo struct {
	Path  string          `json:"path"`
	File  string          `json:"file"`
	Size  int64           `json:"size"`
	Mtime int64           `json:"mtime"`
	Meta  json.RawMessage `json:"meta,omitempty"`
	Board string          `json:"board"`
	Saved string          `json:"saved"`
}

func validProjectName(n string) error {
	n = strings.TrimSpace(n)
	if n == "" || len(n) > 120 || strings.ContainsAny(n, `/\:*?"<>|`) || strings.Contains(n, "..") || strings.HasPrefix(n, ".") {
		return errors.New("neplatný název projektu: " + n)
	}
	return nil
}

const projectExt = ".kimill"

// projekt KiMillu (.kimill), nebo starší z doby, kdy se program jmenoval CuMill (.cumill)
func isProjectFile(p string) bool {
	e := filepath.Ext(p)
	return strings.EqualFold(e, projectExt) || strings.EqualFold(e, ".cumill")
}

// cesta musí ležet přímo ve složce projektů a končit .kimill (.cumill)
func projectPath(dir, p string) (string, error) {
	if dir == "" {
		dir = defaultProjectsDir()
	}
	ad, _ := filepath.Abs(dir)
	ap, _ := filepath.Abs(p)
	if !strings.EqualFold(filepath.Dir(ap), ad) || !isProjectFile(ap) {
		return "", errors.New("soubor není projekt ve složce projektů")
	}
	return ap, nil
}

func registerProjectsAPI(mux *http.ServeMux, guard func(func(http.ResponseWriter, *http.Request) error) http.HandlerFunc) {
	mux.HandleFunc("/api/projects", guard(func(w http.ResponseWriter, r *http.Request) error {
		dir := r.URL.Query().Get("dir")
		if dir == "" {
			dir = defaultProjectsDir()
		}
		out := []projectInfo{}
		ents, err := os.ReadDir(dir)
		if err != nil {
			return writeJSON(w, map[string]any{"dir": dir, "default": defaultProjectsDir(), "projects": out, "missing": true})
		}
		for _, e := range ents {
			if e.IsDir() || !isProjectFile(e.Name()) {
				continue
			}
			p := filepath.Join(dir, e.Name())
			st, err := e.Info()
			if err != nil {
				continue
			}
			pi := projectInfo{Path: p, File: e.Name(), Size: st.Size(), Mtime: st.ModTime().UnixMilli()}
			if b, err := os.ReadFile(p); err == nil {
				var h struct {
					Meta  json.RawMessage `json:"meta"`
					Board string          `json:"board"`
					Saved string          `json:"saved"`
				}
				if json.Unmarshal(b, &h) == nil {
					pi.Meta, pi.Board, pi.Saved = h.Meta, h.Board, h.Saved
				}
			}
			out = append(out, pi)
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Mtime > out[j].Mtime })
		return writeJSON(w, map[string]any{"dir": dir, "default": defaultProjectsDir(), "projects": out})
	}))
	mux.HandleFunc("/api/projects/save", guard(func(w http.ResponseWriter, r *http.Request) error {
		var req struct {
			Dir, Name, Path, Text string
			NoOverwrite           bool
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return err
		}
		if req.Dir == "" {
			req.Dir = defaultProjectsDir()
		}
		p := req.Path
		if p == "" {
			if err := validProjectName(req.Name); err != nil {
				return err
			}
			p = filepath.Join(req.Dir, strings.TrimSpace(req.Name)+projectExt)
			if req.NoOverwrite {
				if _, err := os.Stat(p); err == nil {
					return errors.New("projekt s tímto názvem už existuje")
				}
			}
		} else if !isProjectFile(p) {
			return errors.New("soubor projektu musí mít příponu " + projectExt)
		}
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			return err
		}
		tmp := p + ".tmp"
		if err := os.WriteFile(tmp, []byte(req.Text), 0o644); err != nil {
			return err
		}
		if err := os.Rename(tmp, p); err != nil {
			_ = os.Remove(tmp)
			return err
		}
		return writeJSON(w, map[string]any{"path": p, "mtime": time.Now().UnixMilli()})
	}))
	mux.HandleFunc("/api/projects/rename", guard(func(w http.ResponseWriter, r *http.Request) error {
		var req struct{ Dir, Path, Name string }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return err
		}
		p, err := projectPath(req.Dir, req.Path)
		if err != nil {
			return err
		}
		if err := validProjectName(req.Name); err != nil {
			return err
		}
		np := filepath.Join(filepath.Dir(p), strings.TrimSpace(req.Name)+projectExt)
		if _, err := os.Stat(np); err == nil && !strings.EqualFold(np, p) {
			return errors.New("projekt s tímto názvem už existuje")
		}
		if err := os.Rename(p, np); err != nil {
			return err
		}
		return writeJSON(w, map[string]any{"path": np})
	}))
	mux.HandleFunc("/api/projects/delete", guard(func(w http.ResponseWriter, r *http.Request) error {
		var req struct{ Dir, Path string }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return err
		}
		p, err := projectPath(req.Dir, req.Path)
		if err != nil {
			return err
		}
		return os.Remove(p)
	}))
}
