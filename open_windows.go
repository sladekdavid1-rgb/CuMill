//go:build windows

package main

import "golang.org/x/sys/windows"

// otevře soubor / adresu výchozí aplikací Windows (ShellExecute – bez rundll32)
func openWithSystem(p string) error {
	verb, _ := windows.UTF16PtrFromString("open")
	file, err := windows.UTF16PtrFromString(p)
	if err != nil {
		return err
	}
	return windows.ShellExecute(0, verb, file, nil, nil, windows.SW_SHOWNORMAL)
}
