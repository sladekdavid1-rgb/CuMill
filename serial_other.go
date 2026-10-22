//go:build !windows

package main

import "errors"

// mimo Windows jen simulátor (vývoj a testy)
func listSerialPorts() []string { return nil }

func openSerial(name string, baud int) (portRW, error) {
	return nil, errors.New("sériový port je jen ve Windows")
}
