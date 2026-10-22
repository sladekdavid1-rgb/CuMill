package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

// odběr událostí stroje do kanálu
func subscribe(m *Machine) chan map[string]any {
	raw := make(chan []byte, 4096)
	out := make(chan map[string]any, 4096)
	m.mu.Lock()
	m.subs[raw] = struct{}{}
	m.mu.Unlock()
	go func() {
		for b := range raw {
			var v map[string]any
			_ = json.Unmarshal(b, &v)
			out <- v
		}
	}()
	return out
}

func waitEv(t *testing.T, ch chan map[string]any, typ string, to time.Duration) map[string]any {
	t.Helper()
	dl := time.After(to)
	for {
		select {
		case v := <-ch:
			if v["t"] == typ {
				return v
			}
			if v["t"] == "perr" || v["t"] == "alarm" {
				t.Fatalf("neočekávaná událost %v", v)
			}
		case <-dl:
			t.Fatalf("nedočkal jsem se události %s", typ)
		}
	}
}

func sim(m *Machine) *grblSim { m.mu.Lock(); defer m.mu.Unlock(); return m.port.(*grblSim) }

func connectSim(t *testing.T, speed string) (*Machine, chan map[string]any) {
	t.Setenv("CUMILL_SIM_SPEED", speed)
	m := &Machine{zFeed: 1, wake: make(chan struct{}, 1), subs: map[chan []byte]struct{}{}}
	ev := subscribe(m)
	if err := m.Connect(simPortName, 115200); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	if r, err := m.Command("$X", true, 5*time.Second); err != nil || !r.OK {
		t.Fatalf("$X: %v %v", r, err)
	}
	return m, ev
}

func loadNC(t *testing.T, name string) []string {
	b, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	return strings.Split(strings.ReplaceAll(string(b), "\r", ""), "\n")
}

// syntetické testovací programy: izolace (G1 + oblouky G2/G3), vrtání, ořez po krocích
func synthPrograms() map[string][]string {
	head := []string{"(CuMill test)", "G21", "G90", "G94", "G17", "G0 Z2", "S12000 M3", "G4 P2"}
	tail := []string{"G0 Z15", "M5", "G0 X0 Y0", "M2"}
	iso := append([]string{}, head...)
	for i := 0; i < 40; i++ {
		x, y := float64(i%8)*10, float64(i/8)*10
		iso = append(iso, fmt.Sprintf("(sit N%d)", i), fmt.Sprintf("G0 X%.4f Y%.4f", x, y), "G0 Z0.3", "G1 Z-0.1 F100",
			fmt.Sprintf("G1 X%.4f Y%.4f F400", x+6, y), fmt.Sprintf("G3 X%.4f Y%.4f I0 J1.5", x+6, y+3),
			fmt.Sprintf("G1 X%.4f Y%.4f", x, y+3), fmt.Sprintf("G2 X%.4f Y%.4f I0 J-1.5", x, y), "G0 Z2")
	}
	iso = append(iso, tail...)
	drill := append([]string{}, head...)
	for i := 0; i < 120; i++ {
		drill = append(drill, fmt.Sprintf("G0 X%.4f Y%.4f", float64(i%15)*5.08, float64(i/15)*2.54), "G0 Z0.3", "G1 Z-1.7 F300", "G0 Z2")
	}
	drill = append(drill, tail...)
	cut := append([]string{}, head...)
	for _, z := range []string{"-0.6", "-1.2", "-1.8"} {
		cut = append(cut, "G0 X-1 Y-1", "G0 Z0.3", "G1 Z"+z+" F60", "G1 X96 Y-1 F120", "G1 X96 Y66", "G1 X-1 Y66", "G1 X-1 Y-1", "G0 Z2")
	}
	cut = append(cut, tail...)
	return map[string][]string{"izolace": iso, "vrtani": drill, "orez": cut}
}

func TestStreamPrograms(t *testing.T) {
	m, ev := connectSim(t, "400")
	defer m.Disconnect()
	progs := synthPrograms()
	for _, f := range []string{"izolace", "vrtani", "orez"} {
		lines := progs[f]
		m.Load(lines)
		s := sim(m)
		before := s.Lines
		if err := m.Start(0, nil); err != nil {
			t.Fatal(err)
		}
		waitEv(t, ev, "end", 60*time.Second)
		n := 0
		for _, l := range lines {
			if stripComment(l) != "" {
				n++
			}
		}
		s.mu.Lock()
		got, ovf, errs := s.Lines-before, s.Overflows, append([]string(nil), s.Errors...)
		s.mu.Unlock()
		if ovf > 0 || len(errs) > 0 || got != n {
			t.Fatalf("%s: řádků %d/%d, přetečení %d, chyby %v", f, got, n, ovf, errs)
		}
		m.mu.Lock()
		if m.done != len(lines) || m.inBytes != 0 || len(m.inflight) != 0 {
			t.Fatalf("%s: done %d/%d inBytes %d", f, m.done, len(lines), m.inBytes)
		}
		m.mu.Unlock()
		t.Logf("%s: %d bloků OK", f, n)
	}
}

func TestPauseResumeStopPatch(t *testing.T) {
	m, ev := connectSim(t, "20")
	defer m.Disconnect()
	var lines []string
	lines = append(lines, "G21 G90", "G0 Z2", "G0 X0 Y0", "G1 Z-0.1 F100")
	for i := 0; i < 200; i++ {
		lines = append(lines, "G1 X"+fmtNum(float64(i%10))+" Y"+fmtNum(float64(i/10))+" F400")
	}
	lines = append(lines, "G0 Z2", "M5")
	m.Load(lines)
	if err := m.Start(0, nil); err != nil {
		t.Fatal(err)
	}
	time.Sleep(300 * time.Millisecond)
	// náhrada pozdějších řádků (vynechání)
	if _, err := m.Patch([]int{150, 151}, []string{"G0 Z2\nG0 X5 Y5\nG1 Z-0.1 F100\nG1 F400", ""}); err != nil {
		t.Fatal(err)
	}
	// už odeslaný řádek se změnit nesmí
	if _, err := m.Patch([]int{1}, []string{""}); err == nil {
		t.Fatal("odeslaný řádek šel změnit")
	}
	_ = m.Pause()
	time.Sleep(400 * time.Millisecond)
	m.mu.Lock()
	st := m.state
	d1 := m.done
	m.mu.Unlock()
	if !strings.HasPrefix(st, "Hold") {
		t.Fatalf("po pauze stav %s", st)
	}
	time.Sleep(300 * time.Millisecond)
	m.mu.Lock()
	d2 := m.done
	m.mu.Unlock()
	if d2-d1 > 16 { // plánovač GRBL dojede jen to, co už má
		t.Fatalf("během pauzy pokračoval %d→%d", d1, d2)
	}
	_ = m.Resume()
	waitEv(t, ev, "end", 30*time.Second)
	s := sim(m)
	if s.Overflows > 0 || len(s.Errors) > 0 {
		t.Fatalf("přetečení %d chyby %v", s.Overflows, s.Errors)
	}
	// stop uprostřed: bez alarmu, poloha zachována
	m.Load(lines)
	_ = m.Start(0, nil)
	time.Sleep(300 * time.Millisecond)
	_ = m.Stop()
	waitEv(t, ev, "reset", 10*time.Second)
	time.Sleep(300 * time.Millisecond)
	s = sim(m)
	s.mu.Lock()
	state := s.state
	s.mu.Unlock()
	if state != "Idle" {
		t.Fatalf("po stopu stav %s (má být Idle bez alarmu)", state)
	}
}

func TestProbeAndZFeed(t *testing.T) {
	m, _ := connectSim(t, "50")
	defer m.Disconnect()
	// dojet nad povrch a změřit
	for _, c := range []string{"G21 G90", "G53 G0 Z-5", "G53 G0 X-100 Y-60", "G91 G38.2 Z-50 F200", "G90"} {
		r, err := m.Command(c, true, 20*time.Second)
		if err != nil || !r.OK {
			t.Fatalf("%s: %v %v", c, r, err)
		}
		if strings.Contains(c, "G38") {
			if len(r.Msgs) == 0 || !strings.HasPrefix(r.Msgs[0], "[PRB:") || !strings.HasSuffix(r.Msgs[0], ":1]") {
				t.Fatalf("sonda: %v", r.Msgs)
			}
			t.Logf("sonda %v (povrch %.3f)", r.Msgs, simSurface(-100, -60))
		}
	}
	// korekce posuvu v Z
	m.zFeed = 0.5
	m.modalF, m.modalG = 400, 1
	if got := m.applyZFeed("G1 Z-0.1 F100"); got != "G1 Z-0.1 F50" {
		t.Fatalf("zfeed: %q", got)
	}
	if got := m.applyZFeed("G1 X5 Y5"); got != "G1 X5 Y5 F100" {
		t.Fatalf("zfeed návrat: %q", got)
	}
	m.modalF = 400
	if got := m.applyZFeed("G0 Z2"); got != "G0 Z2" {
		t.Fatalf("zfeed rychloposuv: %q", got)
	}
}
