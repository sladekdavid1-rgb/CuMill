//go:build !windows

package main

import "errors"

// mimo Windows vlastní okno není – použije se prohlížeč
func runWindow(url string) bool { return false }

func openFilesDialog(start, kind string) ([]string, error) {
	return nil, errors.New("dialog je jen ve Windows")
}

func pickFolderDialog(start string) (string, error) {
	return "", errors.New("dialog je jen ve Windows")
}
