//go:build windows

package main

import "golang.org/x/sys/windows"

// složka Dokumenty (i když je přesměrovaná, např. do OneDrive)
func documentsDir() string {
	p, err := windows.KnownFolderPath(windows.FOLDERID_Documents, 0)
	if err != nil {
		return ""
	}
	return p
}
