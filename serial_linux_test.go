//go:build linux

package main

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

// pseudoterminál: master (strana „frézky“) a jméno slave (/dev/pts/N), který otevře KiMill jako sériový port
func openPty(t *testing.T) (*os.File, string) {
	t.Helper()
	m, err := os.OpenFile("/dev/ptmx", os.O_RDWR|unix.O_NOCTTY, 0)
	if err != nil {
		t.Skip("pty není k dispozici: ", err)
	}
	if err := unix.IoctlSetPointerInt(int(m.Fd()), unix.TIOCSPTLCK, 0); err != nil {
		t.Fatal(err)
	}
	n, err := unix.IoctlGetInt(int(m.Fd()), unix.TIOCGPTN)
	if err != nil {
		t.Fatal(err)
	}
	return m, fmt.Sprintf("/dev/pts/%d", n)
}

// skutečná cesta sériovým portem Linuxu: na druhém konci pty běží simulátor GRBL
func TestLinuxSerialWithGrblSim(t *testing.T) {
	master, slave := openPty(t)
	defer master.Close()
	t.Setenv("KIMILL_SIM_SPEED", "50")
	g := newGrblSim(50)
	defer g.Close()
	go func() { // KiMill -> GRBL
		b := make([]byte, 256)
		for {
			n, err := master.Read(b)
			if err != nil {
				return
			}
			_, _ = g.Write(b[:n])
		}
	}()
	go func() { // GRBL -> KiMill
		b := make([]byte, 256)
		for {
			n, err := g.Read(b)
			if err != nil {
				return
			}
			_, _ = master.Write(b[:n])
		}
	}()

	m := &Machine{zFeed: 1, wake: make(chan struct{}, 1), subs: map[chan []byte]struct{}{}}
	ev := subscribe(m)
	if err := m.Connect(slave, 115200); err != nil {
		t.Fatal(err)
	}
	defer m.Disconnect()
	// výhradní přístup: druhé otevření musí selhat
	if _, err := openSerial(slave, 115200); err == nil || !strings.Contains(err.Error(), "obsazený") {
		t.Fatalf("druhé otevření portu mělo selhat jako obsazené, je: %v", err)
	}
	time.Sleep(100 * time.Millisecond)
	if r, err := m.Command("$X", true, 5*time.Second); err != nil || !r.OK {
		t.Fatalf("$X: %v %v", r, err)
	}
	if r, err := m.Command("$$", true, 5*time.Second); err != nil || !r.OK || len(r.Msgs) < 10 {
		t.Fatalf("$$: %v %v", r, err)
	}
	// program se stovkami řádků (plní RX buffer GRBL)
	var lines []string
	lines = append(lines, "G21 G90", "G0 Z1")
	for i := 0; i < 400; i++ {
		lines = append(lines, fmt.Sprintf("G1 X%.3f Y%.3f F3000", float64(i%20)*0.5, float64(i/20)*0.5))
	}
	lines = append(lines, "G0 Z5", "M5")
	m.Load(lines)
	if err := m.Start(0, nil); err != nil {
		t.Fatal(err)
	}
	waitEv(t, ev, "end", 90*time.Second)
	m.mu.Lock()
	done, total := m.done, len(m.lines)
	m.mu.Unlock()
	if done != total {
		t.Fatalf("odesláno %d z %d řádků", done, total)
	}
}

func TestLinuxSerialErrors(t *testing.T) {
	if _, err := openSerial("COM3", 115200); err == nil {
		t.Fatal("COM3 na Linuxu má selhat")
	}
	if _, err := openSerial("/dev/ttyUSB99", 115200); err == nil || !strings.Contains(err.Error(), "neexistuje") {
		t.Fatalf("chybějící port: %v", err)
	}
}

func TestLinuxDocumentsDir(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	t.Setenv("XDG_CONFIG_HOME", "")
	_ = os.MkdirAll(h+"/.config", 0o755)
	_ = os.MkdirAll(h+"/Dokumenty", 0o755)
	_ = os.WriteFile(h+"/.config/user-dirs.dirs", []byte("XDG_DESKTOP_DIR=\"$HOME/Plocha\"\nXDG_DOCUMENTS_DIR=\"$HOME/Dokumenty\"\n"), 0o644)
	if d := documentsDir(); d != h+"/Dokumenty" {
		t.Fatalf("Dokumenty: %q", d)
	}
}

// vytažený USB kabel (u pty zavřený master): čtení skončí chybou a KiMill se odpojí
func TestLinuxSerialUnplug(t *testing.T) {
	master, slave := openPty(t)
	p, err := openSerial(slave, 115200)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	done := make(chan error, 1)
	go func() { b := make([]byte, 64); _, err := p.Read(b); done <- err }()
	time.Sleep(200 * time.Millisecond)
	master.Close()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("čtení po odpojení mělo skončit chybou")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("čtení po odpojení neskončilo")
	}
}
