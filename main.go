// KiMill – spouštěč: lokální server s vloženým UI + vlastní okno (WebView2),
// záložně okno Edge/Chrome v režimu --app.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"time"
)

//go:embed web
var webFS embed.FS

const appPort = 47823 // pevný port = stejný původ = zachovaná nastavení a nedávné soubory

var (
	lastPing    atomic.Int64
	webviewMode atomic.Bool // UI běží ve vlastním okně -> soubory přes nativní dialogy
	serverAddr  string
)

func init() { runtime.LockOSThread() } // okno WebView2 musí běžet v hlavním vlákně

func main() {
	url := fmt.Sprintf("http://127.0.0.1:%d/", appPort)
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", appPort))
	if err != nil {
		c := http.Client{Timeout: 2 * time.Second}
		app, build := "", ""
		if r, e := c.Get(url + "api/ping"); e == nil {
			app, build = r.Header.Get("X-App"), r.Header.Get("X-Build")
			r.Body.Close()
		}
		switch {
		case app == "KiMill" && build == buildID:
			// stejná verze už běží -> otevřít další okno nad stejným serverem
			if !runWindow(url) {
				if cmd := openBrowserWindow(url); cmd != nil {
					_ = cmd.Wait()
				}
			}
			return
		case app == "KiMill" || app == "CuMill":
			// běží jiná (starší) verze -> požádat ji o ukončení a převzít port
			freed, busy := replaceOldInstance(url)
			if busy {
				fatal("Běží starší verze KiMillu a právě posílá program do frézky.\nNech ji dokončit, zavři ji a spusť KiMill znovu.")
			}
			if !freed {
				fatal("Běží starší verze programu (KiMill / CuMill), kterou nejde zavřít automaticky.\nZavři všechna její okna (případně ve Správci úloh ukonči KiMill.exe / CuMill.exe) a spusť KiMill znovu.")
			}
			for i := 0; i < 50 && err != nil; i++ {
				time.Sleep(100 * time.Millisecond)
				ln, err = net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", appPort))
			}
			if err != nil {
				fatal("Starší verze KiMillu se neukončila včas. Spusť KiMill znovu.")
			}
		default:
			// port drží něco jiného -> náhodný port
			ln, err = net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				fatal("Nelze spustit lokální server: " + err.Error())
			}
			url = fmt.Sprintf("http://%s/", ln.Addr().String())
		}
	}
	serverAddr = ln.Addr().String()

	sub, _ := fs.Sub(webFS, "web")
	mux := http.NewServeMux()
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		lastPing.Store(time.Now().UnixNano())
		w.Header().Set("X-App", "KiMill")
		w.Header().Set("X-Build", buildID)
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write([]byte("ok"))
	})
	registerAPI(mux)
	registerQuitAPI(mux)
	files := http.FileServer(http.FS(sub))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if filepath.Ext(r.URL.Path) == ".js" {
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		}
		files.ServeHTTP(w, r)
	}))
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = srv.Serve(ln) }()

	// 1) vlastní okno (WebView2 je součástí Windows 10/11)
	webviewMode.Store(true)
	if runWindow(url) {
		os.Exit(0)
	}
	// Linux: dialogy přes zenity / kdialog -> soubory přes cesty jako ve Windows (KIMILL_NATIVE=0/1 vynutí)
	switch os.Getenv("KIMILL_NATIVE") {
	case "1":
		webviewMode.Store(true)
	case "0":
		webviewMode.Store(false)
	default:
		webviewMode.Store(hostDialogs())
	}
	if runtime.GOOS != "windows" {
		fmt.Printf("KiMill běží na %s (okno zavřeš normálně, server se pak sám ukončí)\n", url)
	}

	// 2) záloha: okno prohlížeče v režimu aplikace
	lastPing.Store(time.Now().UnixNano())
	start := time.Now()
	var browserDone atomic.Bool
	if cmd := openBrowserWindow(url); cmd != nil {
		go func() {
			_ = cmd.Wait()
			if time.Since(start) > 8*time.Second {
				browserDone.Store(true)
			}
		}()
	}
	for {
		time.Sleep(2 * time.Second)
		idle := time.Since(time.Unix(0, lastPing.Load()))
		if browserDone.Load() && idle > 6*time.Second {
			os.Exit(0)
		}
		if time.Since(start) > 30*time.Second && idle > 10*time.Minute {
			os.Exit(0)
		}
	}
}

// okno Edge / Chrome v režimu --app s vlastním profilem
func openBrowserWindow(url string) *exec.Cmd {
	if runtime.GOOS != "windows" {
		// Chromium / Chrome / Edge / Brave v režimu aplikace (samostatné okno bez lišty prohlížeče)
		for _, b := range []string{"chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge", "microsoft-edge-stable", "brave-browser", "vivaldi"} {
			p, err := exec.LookPath(b)
			if err != nil {
				continue
			}
			args := append(appArgs(url), "--class=KiMill") // ikona z nabídky aplikací (StartupWMClass)
			// chromium ze snapu nesmí do skrytých složek v domovské – profil do ~/snap/chromium/common
			if real, _ := filepath.EvalSymlinks(p); strings.Contains(real, "/snap/") || strings.HasPrefix(p, "/snap/") {
				h, _ := os.UserHomeDir()
				d := filepath.Join(h, "snap", "chromium", "common", "KiMill-okno")
				_ = os.MkdirAll(d, 0o755)
				for i, a := range args {
					if strings.HasPrefix(a, "--user-data-dir=") {
						args[i] = "--user-data-dir=" + d
					}
				}
			}
			cmd := exec.Command(p, args...)
			if cmd.Start() == nil {
				return cmd
			}
		}
		// jinak výchozí prohlížeč (Firefox…) – KiMill funguje i v něm, jen jako karta
		_ = openWithSystem(url)
		return nil
	}
	var cands []string
	pf, pf86, lad := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")
	for _, base := range []string{pf86, pf, lad} {
		if base != "" {
			cands = append(cands, filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
		}
	}
	for _, base := range []string{pf, pf86, lad} {
		if base != "" {
			cands = append(cands, filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
		}
	}
	for _, c := range cands {
		if _, err := os.Stat(c); err == nil {
			cmd := exec.Command(c, appArgs(url)...)
			if cmd.Start() == nil {
				return cmd
			}
		}
	}
	_ = openWithSystem(url)
	return nil
}

func appArgs(url string) []string {
	return []string{
		"--app=" + url,
		"--user-data-dir=" + dataDir("okno"),
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-features=Translate,msEdgeTranslate,EdgeCollections,msUndersideButton",
		"--window-size=1600,980",
		"--lang=cs",
	}
}

func dataDir(name string) string {
	dir := os.Getenv("LOCALAPPDATA")
	if dir == "" && runtime.GOOS == "linux" {
		// ~/.local/share (data, profil okna s nastavením a knihovnou nástrojů – ne do mezipaměti)
		if dir = os.Getenv("XDG_DATA_HOME"); dir == "" {
			h, _ := os.UserHomeDir()
			dir = filepath.Join(h, ".local", "share")
		}
	}
	if dir == "" {
		dir, _ = os.UserCacheDir()
	}
	base, _ := appFolder(dir)
	p := filepath.Join(base, name)
	_ = os.MkdirAll(p, 0o755)
	return p
}

func fatal(msg string) {
	if runtime.GOOS == "windows" || runtime.GOOS == "linux" {
		showError(msg)
	} else {
		fmt.Fprintln(os.Stderr, msg)
	}
	os.Exit(1)
}
