//go:build windows

package main

import (
	"syscall"

	webview2 "github.com/jchv/go-webview2"
)

var ownerHwnd uintptr // okno aplikace – vlastník dialogů

// otevře vlastní okno KiMill (WebView2); false, když WebView2 v systému chybí
func runWindow(url string) (ok bool) {
	defer func() {
		if recover() != nil {
			ok = false
		}
	}()
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  dataDir("webview2"),
		WindowOptions: webview2.WindowOptions{
			Title:  "KiMill",
			Width:  1600,
			Height: 980,
			IconId: 2, // ikona v prostředcích exe (rsrc: manifest = 1, skupina ikon = 2)
			Center: true,
		},
	})
	if w == nil {
		return false
	}
	ownerHwnd = uintptr(w.Window())
	w.SetSize(1100, 700, webview2.HintMin)
	// spustit maximalizované
	user32 := syscall.NewLazyDLL("user32.dll")
	_, _, _ = user32.NewProc("ShowWindow").Call(ownerHwnd, 3)
	w.Navigate(url)
	w.Run()
	w.Destroy()
	return true
}
