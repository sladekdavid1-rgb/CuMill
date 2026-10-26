package main

// Spuštění nové verze, když ještě běží stará: nová verze má jiný otisk vloženého UI,
// starou požádá o ukončení (pokud zrovna neposílá program do stroje) a převezme port.

import (
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"net/http"
	"os"
	"sort"
	"time"
)

var buildID = func() string {
	h := sha256.New()
	var names []string
	_ = fs.WalkDir(webFS, "web", func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			names = append(names, p)
		}
		return nil
	})
	sort.Strings(names)
	for _, n := range names {
		b, _ := webFS.ReadFile(n)
		h.Write([]byte(n))
		h.Write(b)
	}
	return hex.EncodeToString(h.Sum(nil))[:12]
}()

// stará instance na portu: true = ukončila se a port je volný
func replaceOldInstance(url string) (freed bool, busy bool) {
	c := http.Client{Timeout: 3 * time.Second}
	req, _ := http.NewRequest("POST", url+"api/quit", nil)
	req.Header.Set("X-KiMill", "1")
	r, err := c.Do(req)
	if err != nil {
		return false, false
	}
	r.Body.Close()
	if r.StatusCode == http.StatusConflict {
		return false, true
	}
	if r.StatusCode != http.StatusOK {
		return false, false // starší verze bez /api/quit
	}
	return true, false
}

func registerQuitAPI(mux *http.ServeMux) {
	mux.HandleFunc("/api/quit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("X-KiMill") != "1" || !hostOK(r.Host) {
			http.Error(w, "zakázáno", http.StatusForbidden)
			return
		}
		mach.mu.Lock()
		streaming := mach.streaming
		mach.mu.Unlock()
		if streaming {
			http.Error(w, "běží program", http.StatusConflict)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
		go func() {
			time.Sleep(150 * time.Millisecond)
			mach.Disconnect()
			os.Exit(0)
		}()
	})
}
