//go:build windows

package main

// Sériový port ve Windows (COMx) přes WinAPI – bez dalších knihoven.

import (
	"errors"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

type winSerial struct {
	h      windows.Handle
	mu     sync.Mutex
	closed bool
}

func listSerialPorts() []string {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `HARDWARE\DEVICEMAP\SERIALCOMM`, registry.QUERY_VALUE)
	if err != nil {
		return nil
	}
	defer k.Close()
	names, err := k.ReadValueNames(0)
	if err != nil {
		return nil
	}
	var out []string
	for _, n := range names {
		if v, _, err := k.GetStringValue(n); err == nil && v != "" {
			out = append(out, v)
		}
	}
	num := func(s string) int { n, _ := strconv.Atoi(strings.TrimPrefix(strings.ToUpper(s), "COM")); return n }
	sort.Slice(out, func(i, j int) bool { return num(out[i]) < num(out[j]) })
	return out
}

func openSerial(name string, baud int) (portRW, error) {
	if !strings.HasPrefix(strings.ToUpper(name), "COM") {
		return nil, errors.New("neplatný port: " + name)
	}
	path, _ := windows.UTF16PtrFromString(`\\.\` + name)
	h, err := windows.CreateFile(path, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil, windows.OPEN_EXISTING, 0, 0)
	if err != nil {
		if errors.Is(err, windows.ERROR_ACCESS_DENIED) {
			return nil, errors.New(name + " je obsazený – nemá ho otevřený UGS, Candle nebo jiný program?")
		}
		return nil, errors.New("nelze otevřít " + name + ": " + err.Error())
	}
	_ = windows.SetupComm(h, 4096, 4096)
	var dcb windows.DCB
	dcb.DCBlength = uint32(unsafe.Sizeof(dcb))
	if err := windows.GetCommState(h, &dcb); err != nil {
		windows.CloseHandle(h)
		return nil, errors.New("nastavení portu selhalo: " + err.Error())
	}
	dcb.BaudRate = uint32(baud)
	// fBinary=1, fDtrControl=ENABLE, fRtsControl=ENABLE, bez řízení toku
	dcb.Flags = 0x0001 | 0x0010 | 0x1000
	dcb.ByteSize = 8
	dcb.Parity = 0   // NOPARITY
	dcb.StopBits = 0 // ONESTOPBIT
	if err := windows.SetCommState(h, &dcb); err != nil {
		windows.CloseHandle(h)
		return nil, errors.New("nastavení portu selhalo: " + err.Error())
	}
	// čtení: vrátit, jakmile něco přijde, jinak po 10 ms (zápis nečeká déle)
	to := windows.CommTimeouts{ReadIntervalTimeout: 0xFFFFFFFF, ReadTotalTimeoutMultiplier: 0xFFFFFFFF, ReadTotalTimeoutConstant: 10, WriteTotalTimeoutConstant: 2000}
	if err := windows.SetCommTimeouts(h, &to); err != nil {
		windows.CloseHandle(h)
		return nil, errors.New("nastavení portu selhalo: " + err.Error())
	}
	_ = windows.PurgeComm(h, windows.PURGE_RXCLEAR|windows.PURGE_TXCLEAR)
	return &winSerial{h: h}, nil
}

func (s *winSerial) Read(b []byte) (int, error) {
	for {
		s.mu.Lock()
		closed := s.closed
		s.mu.Unlock()
		if closed {
			return 0, errors.New("port zavřen")
		}
		var n uint32
		err := windows.ReadFile(s.h, b, &n, nil)
		if err != nil {
			return 0, err
		}
		if n > 0 {
			return int(n), nil
		}
		time.Sleep(time.Millisecond)
	}
}

func (s *winSerial) Write(b []byte) (int, error) {
	s.mu.Lock()
	closed := s.closed
	s.mu.Unlock()
	if closed {
		return 0, errors.New("port zavřen")
	}
	var n uint32
	err := windows.WriteFile(s.h, b, &n, nil)
	return int(n), err
}

func (s *winSerial) Close() error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	s.mu.Unlock()
	return windows.CloseHandle(s.h)
}
