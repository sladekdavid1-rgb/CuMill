//go:build linux

package main

// Sériový port v Linuxu (/dev/ttyUSB*, /dev/ttyACM*) přes termios – bez dalších knihoven.

import (
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"

	"golang.org/x/sys/unix"
)

type unixSerial struct {
	fd     int
	mu     sync.Mutex
	rmu    sync.Mutex // drží se během čtení – Close počká, než čtení doběhne (≤ 0,1 s), aby se fd nezavřel pod rukama
	wmu    sync.Mutex
	closed bool
}

// porty: USB převodníky (CH340, FTDI = ttyUSB), Arduino / nativní USB (ttyACM), Raspberry Pi UART (ttyAMA, serial0)
func listSerialPorts() []string {
	var out []string
	for _, pat := range []string{"/dev/ttyUSB*", "/dev/ttyACM*", "/dev/ttyAMA*", "/dev/ttyCH341USB*"} {
		m, _ := filepath.Glob(pat)
		out = append(out, m...)
	}
	sort.Slice(out, func(i, j int) bool {
		if len(out[i]) != len(out[j]) {
			return len(out[i]) < len(out[j])
		}
		return out[i] < out[j]
	})
	return out
}

var baudRates = map[int]uint32{
	9600: unix.B9600, 19200: unix.B19200, 38400: unix.B38400, 57600: unix.B57600,
	115200: unix.B115200, 230400: unix.B230400, 250000: 0, 460800: unix.B460800, 921600: unix.B921600,
}

func openSerial(name string, baud int) (portRW, error) {
	if !strings.HasPrefix(name, "/dev/") {
		return nil, errors.New("neplatný port: " + name)
	}
	fd, err := unix.Open(name, unix.O_RDWR|unix.O_NOCTTY|unix.O_NONBLOCK|unix.O_CLOEXEC, 0)
	if err != nil {
		switch {
		case errors.Is(err, syscall.EACCES):
			u := os.Getenv("USER")
			if u == "" {
				u = "$USER"
			}
			return nil, errors.New("k portu " + name + " nemáš oprávnění – přidej se do skupiny dialout: sudo usermod -aG dialout " + u + " (pak se odhlas a přihlas)")
		case errors.Is(err, syscall.EBUSY):
			return nil, errors.New(name + " je obsazený – nemá ho otevřený UGS, Candle nebo jiný program?")
		case errors.Is(err, syscall.ENOENT):
			return nil, errors.New("port " + name + " neexistuje – je frézka připojená?")
		}
		return nil, errors.New("nelze otevřít " + name + ": " + err.Error())
	}
	fail := func(msg string, e error) (portRW, error) {
		unix.Close(fd)
		return nil, errors.New(msg + e.Error())
	}
	// výhradní přístup (jako ve Windows): zámek souboru (respektuje ho i KiMill / UGS spuštěný podruhé)
	// a TIOCEXCL (druhé otevření selže i u programů bez zámku; root ho obejde)
	if err := unix.Flock(fd, unix.LOCK_EX|unix.LOCK_NB); err != nil {
		unix.Close(fd)
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, errors.New(name + " je obsazený – nemá ho otevřený UGS, Candle nebo jiný program?")
		}
		return nil, errors.New("nelze zamknout " + name + ": " + err.Error())
	}
	if err := unix.IoctlSetInt(fd, unix.TIOCEXCL, 0); err != nil && !errors.Is(err, syscall.ENOTTY) {
		return fail("nastavení portu selhalo: ", err)
	}
	t, err := unix.IoctlGetTermios(fd, unix.TCGETS)
	if err != nil {
		return fail("nastavení portu selhalo: ", err)
	}
	// raw 8N1, bez řízení toku, bez echa a úprav znaků
	t.Iflag &^= unix.IGNBRK | unix.BRKINT | unix.PARMRK | unix.ISTRIP | unix.INLCR | unix.IGNCR | unix.ICRNL | unix.IXON | unix.IXOFF | unix.IXANY
	t.Oflag &^= unix.OPOST
	t.Lflag &^= unix.ECHO | unix.ECHONL | unix.ICANON | unix.ISIG | unix.IEXTEN
	t.Cflag &^= unix.CSIZE | unix.PARENB | unix.CSTOPB | unix.CRTSCTS | unix.CBAUD
	t.Cflag |= unix.CS8 | unix.CREAD | unix.CLOCAL | unix.HUPCL
	b, ok := baudRates[baud]
	if !ok || b == 0 {
		b = unix.B115200
	}
	t.Cflag |= b
	t.Ispeed, t.Ospeed = b, b
	// čtení: vrátit, jakmile něco přijde, jinak po 0,1 s (kvůli zavření portu)
	t.Cc[unix.VMIN] = 0
	t.Cc[unix.VTIME] = 1
	if err := unix.IoctlSetTermios(fd, unix.TCSETS, t); err != nil {
		return fail("nastavení portu selhalo: ", err)
	}
	if err := unix.SetNonblock(fd, false); err != nil {
		return fail("nastavení portu selhalo: ", err)
	}
	_ = unix.IoctlSetInt(fd, unix.TCFLSH, unix.TCIOFLUSH)
	return &unixSerial{fd: fd}, nil
}

func (s *unixSerial) isClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
}

func (s *unixSerial) Read(b []byte) (int, error) {
	for {
		if s.isClosed() {
			return 0, errors.New("port zavřen")
		}
		s.rmu.Lock()
		if s.isClosed() {
			s.rmu.Unlock()
			return 0, errors.New("port zavřen")
		}
		n, err := unix.Read(s.fd, b)
		s.rmu.Unlock()
		if err != nil {
			if errors.Is(err, syscall.EINTR) || errors.Is(err, syscall.EAGAIN) {
				continue
			}
			return 0, err
		}
		if n > 0 {
			return n, nil
		}
		// n == 0: vypršel VTIME (nic nepřišlo) – u odpojeného USB převodníku hlásí chybu stav linky
		if _, e := unix.IoctlGetInt(s.fd, unix.TIOCMGET); e != nil && !errors.Is(e, syscall.ENOTTY) && !errors.Is(e, syscall.EINVAL) {
			return 0, errors.New("port odpojen: " + e.Error())
		}
	}
}

func (s *unixSerial) Write(b []byte) (int, error) {
	s.wmu.Lock()
	defer s.wmu.Unlock()
	if s.isClosed() {
		return 0, errors.New("port zavřen")
	}
	n := 0
	for n < len(b) {
		k, err := unix.Write(s.fd, b[n:])
		if err != nil {
			if errors.Is(err, syscall.EINTR) || errors.Is(err, syscall.EAGAIN) {
				continue
			}
			return n, err
		}
		n += k
	}
	return n, nil
}

func (s *unixSerial) Close() error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	s.mu.Unlock()
	s.rmu.Lock()
	s.wmu.Lock()
	defer s.rmu.Unlock()
	defer s.wmu.Unlock()
	return unix.Close(s.fd)
}
