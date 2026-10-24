package main

// Simulátor GRBL 1.1 (port „SIMULÁTOR“): na zkoušení KiMillu bez stroje a pro automatické testy.
// Napodobuje RX buffer 128 B, plánovač 15 bloků, odpovědi ok/error, stav <…>, podržení, reset,
// homing, kontrolní režim $C, real-time korekce, posuv joggingu a měření sondou proti
// zvlněnému povrchu desky.

import (
	"fmt"
	"io"
	"math"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const simPortName = "SIMULÁTOR"

func simSpeed() float64 {
	if v, err := strconv.ParseFloat(os.Getenv("KIMILL_SIM_SPEED"), 64); err == nil && v > 0 {
		return v
	}
	return 1
}

type simBlock struct {
	kind   string // move, dwell, probe, home
	to     [3]float64
	feed   float64 // mm/min, 0 = rychloposuv
	rapid  bool
	dwell  float64 // s
	probe  string  // 38.2 …
	jog    bool
	remain float64
}

type grblSim struct {
	mu        sync.Mutex
	speed     float64
	pr        *io.PipeReader
	pw        *io.PipeWriter
	out       chan string
	quit      chan struct{}
	closed    bool
	rx        []byte
	plan      []*simBlock
	pos       [3]float64
	wco       [3]float64
	g92       [3]float64
	state     string
	hold      bool
	holdT     float64
	abs       bool
	motion    int
	feed      float64
	spindle   float64
	spOn      bool
	inch      bool
	ovF, ovR  int
	ovS       int
	check     bool
	prb       [3]float64
	prbOK     bool
	settings  map[int]string
	Overflows int
	Errors    []string
	Lines     int
	waitOK    bool    // G38 / $H: ok až po dokončení
	CutMin    float64 // hloubka řezu pod povrchem (kontrola výškové mapy)
	CutMax    float64
	CutN      int
}

func newGrblSim(speed float64) *grblSim {
	pr, pw := io.Pipe()
	s := &grblSim{speed: speed, pr: pr, pw: pw, out: make(chan string, 4096), quit: make(chan struct{}),
		abs: true, ovF: 100, ovR: 100, ovS: 100, pos: [3]float64{-150, -100, -5}}
	s.settings = map[int]string{0: "10", 1: "25", 2: "0", 3: "0", 4: "0", 5: "0", 6: "0", 10: "1", 11: "0.010", 12: "0.002", 13: "0",
		20: "0", 21: "0", 22: "1", 23: "0", 24: "25.000", 25: "500.000", 26: "250", 27: "1.000", 30: "12000", 31: "0", 32: "0",
		100: "800.000", 101: "800.000", 102: "800.000", 110: "1500.000", 111: "1500.000", 112: "600.000",
		120: "30.000", 121: "30.000", 122: "30.000", 130: "300.000", 131: "180.000", 132: "45.000"}
	go s.writer()
	go s.run()
	s.boot(false)
	return s
}

// povrch desky ve strojových souřadnicích (lehce zvlněný a nakloněný – jako skutečný cuprextit)
func simSurface(x, y float64) float64 {
	return -40 + 0.06*math.Sin(x/17) + 0.05*math.Cos(y/13) + 0.0012*(x+150) - 0.0009*(y+100)
}

func (s *grblSim) emit(l string) {
	select {
	case s.out <- l:
	default:
	}
}
func (s *grblSim) writer() {
	for {
		select {
		case l := <-s.out:
			if _, err := s.pw.Write([]byte(l + "\r\n")); err != nil {
				return
			}
		case <-s.quit:
			return
		}
	}
}

func (s *grblSim) Read(b []byte) (int, error) { return s.pr.Read(b) }
func (s *grblSim) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.closed {
		s.closed = true
		close(s.quit)
		_ = s.pw.Close()
	}
	return nil
}

func (s *grblSim) boot(alarm bool) {
	s.rx, s.plan, s.hold, s.check, s.waitOK = nil, nil, false, false, false
	s.abs, s.motion, s.feed, s.spOn, s.inch, s.g92 = true, 0, 0, false, false, [3]float64{}
	s.ovF, s.ovR, s.ovS = 100, 100, 100
	s.emit("")
	s.emit("Grbl 1.1h ['$' for help]")
	if alarm || s.settings[22] == "1" && s.state == "" {
		s.state = "Alarm"
		if !alarm {
			s.emit("[MSG:'$H'|'$X' to unlock]")
		}
	} else {
		s.state = "Idle"
	}
}

func (s *grblSim) Write(b []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return 0, io.ErrClosedPipe
	}
	for _, c := range b {
		switch {
		case c == '?':
			s.emit(s.status())
		case c == '!':
			if s.state == "Run" || s.state == "Jog" {
				if s.state == "Jog" {
					s.plan = nil
					s.state = "Idle"
				} else {
					s.hold, s.holdT, s.state = true, 0.15, "Hold:1"
				}
			}
		case c == '~':
			if s.hold {
				s.hold = false
				s.state = "Run"
				if len(s.plan) == 0 {
					s.state = "Idle"
				}
			}
		case c == 0x18:
			moving := (s.state == "Run" || s.state == "Jog" || s.state == "Home") && !s.hold
			s.state = "Idle"
			s.boot(moving)
			if moving {
				s.emit("ALARM:3")
			}
		case c == 0x85:
			if s.state == "Jog" {
				s.plan = nil
				s.state = "Idle"
			}
		case c >= 0x90 && c <= 0x9D:
			s.override(c)
		case c >= 0x80:
		default:
			if len(s.rx) >= 128 {
				s.Overflows++
				s.emit("[MSG:SIM RX OVERFLOW]")
				continue
			}
			s.rx = append(s.rx, c)
		}
	}
	return len(b), nil
}

func (s *grblSim) override(c byte) {
	cl := func(v, lo, hi int) int { return int(math.Max(float64(lo), math.Min(float64(hi), float64(v)))) }
	switch c {
	case 0x90:
		s.ovF = 100
	case 0x91:
		s.ovF = cl(s.ovF+10, 10, 200)
	case 0x92:
		s.ovF = cl(s.ovF-10, 10, 200)
	case 0x93:
		s.ovF = cl(s.ovF+1, 10, 200)
	case 0x94:
		s.ovF = cl(s.ovF-1, 10, 200)
	case 0x95:
		s.ovR = 100
	case 0x96:
		s.ovR = 50
	case 0x97:
		s.ovR = 25
	case 0x99:
		s.ovS = 100
	case 0x9A:
		s.ovS = cl(s.ovS+10, 10, 200)
	case 0x9B:
		s.ovS = cl(s.ovS-10, 10, 200)
	case 0x9C:
		s.ovS = cl(s.ovS+1, 10, 200)
	case 0x9D:
		s.ovS = cl(s.ovS-1, 10, 200)
	}
}

func f3(v [3]float64) string { return fmt.Sprintf("%.3f,%.3f,%.3f", v[0], v[1], v[2]) }

func (s *grblSim) status() string {
	st := s.state
	if s.check {
		st = "Check"
	}
	f := 0.0
	if len(s.plan) > 0 && !s.hold {
		f = s.plan[0].feed
		if s.plan[0].rapid {
			f = 1500
		}
	}
	sp := 0.0
	if s.spOn {
		sp = s.spindle * float64(s.ovS) / 100
	}
	pn := ""
	if s.probeContact(s.pos) {
		pn = "|Pn:P"
	}
	return fmt.Sprintf("<%s|MPos:%s|Bf:%d,%d|FS:%.0f,%.0f|WCO:%s|Ov:%d,%d,%d%s>", st, f3(s.pos), 15-len(s.plan), 128-len(s.rx), f, sp, f3(s.wcoTotal()), s.ovF, s.ovR, s.ovS, pn)
}

func (s *grblSim) wcoTotal() [3]float64 {
	return [3]float64{s.wco[0] + s.g92[0], s.wco[1] + s.g92[1], s.wco[2] + s.g92[2]}
}
func (s *grblSim) probeContact(p [3]float64) bool { return p[2] <= simSurface(p[0], p[1])+1e-9 }

// hlavní smyčka: zpracování řádků a pohyb v reálném čase (× rychlost simulace)
func (s *grblSim) run() {
	t := time.NewTicker(4 * time.Millisecond)
	defer t.Stop()
	last := time.Now()
	for {
		select {
		case <-s.quit:
			return
		case now := <-t.C:
			dt := now.Sub(last).Seconds() * s.speed
			last = now
			s.mu.Lock()
			s.parse()
			s.motionStep(dt)
			s.parse()
			s.mu.Unlock()
		}
	}
}

func (s *grblSim) parse() {
	for {
		if s.waitOK {
			return
		}
		i := strings.IndexByte(string(s.rx), '\n')
		if i < 0 {
			return
		}
		line := strings.TrimSpace(strings.TrimRight(string(s.rx[:i]), "\r"))
		up := strings.ToUpper(line)
		// $ příkazy (kromě joggingu) a synchronizační bloky čekají na prázdný plánovač
		if (strings.HasPrefix(up, "$") && !strings.HasPrefix(up, "$J=")) || strings.Contains(up, "G10") || strings.Contains(up, "G92") || strings.Contains(up, "G38") {
			if len(s.plan) > 0 {
				return
			}
		}
		if len(s.plan) >= 15 {
			return
		}
		s.rx = s.rx[i+1:]
		s.Lines++
		if err := s.exec(line); err == "wait" {
			s.waitOK = true
		} else if err == "-" {
		} else if err != "" {
			s.Errors = append(s.Errors, line+" -> "+err)
			s.emit(err)
		} else {
			s.emit("ok")
		}
	}
}

var simWord = regexp.MustCompile(`([A-Z])([-+]?(?:\d+\.?\d*|\.\d+))`)

func (s *grblSim) exec(line string) string {
	up := strings.ToUpper(strings.ReplaceAll(line, " ", ""))
	if up == "" {
		return ""
	}
	if strings.HasPrefix(up, "$") {
		return s.dollar(up)
	}
	if s.state == "Alarm" {
		return "error:9"
	}
	return s.gcode(up, false)
}

func (s *grblSim) dollar(up string) string {
	switch {
	case up == "$$":
		keys := make([]int, 0, len(s.settings))
		for k := range s.settings {
			keys = append(keys, k)
		}
		sort.Ints(keys)
		for _, k := range keys {
			s.emit(fmt.Sprintf("$%d=%s", k, s.settings[k]))
		}
	case up == "$#":
		s.emit("[G54:" + f3(s.wco) + "]")
		for _, g := range []string{"G55", "G56", "G57", "G58", "G59", "G28", "G30"} {
			s.emit("[" + g + ":0.000,0.000,0.000]")
		}
		s.emit("[G92:" + f3(s.g92) + "]")
		s.emit("[TLO:0.000]")
		ok := 0
		if s.prbOK {
			ok = 1
		}
		s.emit(fmt.Sprintf("[PRB:%s:%d]", f3(s.prb), ok))
	case up == "$G":
		u := "G21"
		if s.inch {
			u = "G20"
		}
		d := "G90"
		if !s.abs {
			d = "G91"
		}
		m := "M5"
		if s.spOn {
			m = "M3"
		}
		s.emit(fmt.Sprintf("[GC:G%d G54 G17 %s %s G94 %s M9 T0 F%g S%g]", s.motion, u, d, m, s.feed, s.spindle))
	case up == "$I":
		s.emit("[VER:1.1h.20190825:SIMULATOR]")
		s.emit("[OPT:V,15,128]")
	case up == "$X":
		if s.state == "Alarm" {
			s.state = "Idle"
			s.emit("[MSG:Caution: Unlocked]")
		}
	case up == "$H":
		if s.settings[22] != "1" {
			return "error:5"
		}
		s.state = "Home"
		s.plan = append(s.plan, &simBlock{kind: "home", to: [3]float64{0, 0, 0}, feed: 1200})
		return "wait"
	case up == "$C":
		s.check = !s.check
		if s.check {
			s.emit("[MSG:Enabled]")
		} else {
			s.emit("[MSG:Disabled]")
			s.emit("ok")
			s.boot(false)
			s.state = "Idle"
			return "-"
		}
	case strings.HasPrefix(up, "$J="):
		if s.state != "Idle" && s.state != "Jog" {
			return "error:8"
		}
		return s.gcode(up[3:], true)
	case regexp.MustCompile(`^\$\d+=`).MatchString(up):
		p := strings.SplitN(up[1:], "=", 2)
		n, _ := strconv.Atoi(p[0])
		s.settings[n] = p[1]
	case up == "$SLP" || up == "$RST=*" || up == "$RST=$" || up == "$RST=#" || up == "$N":
	default:
		return "error:3"
	}
	return ""
}

func (s *grblSim) gcode(up string, jog bool) string {
	words := simWord.FindAllStringSubmatch(up, -1)
	if len(words) == 0 {
		return "error:1"
	}
	val := map[string]float64{}
	has := map[string]bool{}
	var gs []float64
	ms := []float64{}
	for _, w := range words {
		v, _ := strconv.ParseFloat(w[2], 64)
		switch w[1] {
		case "G":
			gs = append(gs, v)
		case "M":
			ms = append(ms, v)
		case "N":
		default:
			val[w[1]], has[w[1]] = v, true
		}
	}
	abs, machine, motion, probe := s.abs, false, -1.0, ""
	g10, g92, g921, g4 := false, false, false, false
	for _, g := range gs {
		switch g {
		case 0, 1, 2, 3:
			motion = g
		case 38.2, 38.3, 38.4, 38.5:
			probe = strconv.FormatFloat(g, 'f', 1, 64)
		case 90:
			abs = true
		case 91:
			abs = false
		case 20:
			s.inch = true
		case 21:
			s.inch = false
		case 53:
			machine = true
		case 10:
			g10 = true
		case 92:
			g92 = true
		case 92.1:
			g921 = true
		case 4:
			g4 = true
		case 17, 18, 19, 54, 94, 93, 40, 49, 80, 61, 64:
		case 28, 30:
			motion = 0
		default:
			return "error:20"
		}
	}
	if !jog {
		s.abs = abs
	}
	for _, m := range ms {
		switch m {
		case 3, 4:
			s.spOn = true
		case 5:
			s.spOn = false
		case 2, 30:
			s.spOn = false
			s.abs, s.motion = true, 1
		case 0, 1, 7, 8, 9:
		default:
			return "error:20"
		}
	}
	unit := 1.0
	if s.inch {
		unit = 25.4
	}
	if has["F"] {
		if jog {
			// posuv joggingu se nepamatuje
		} else {
			s.feed = val["F"] * unit
		}
	}
	if has["S"] {
		s.spindle = val["S"]
	}
	axes := []string{"X", "Y", "Z"}
	if g10 {
		l, p := val["L"], val["P"]
		if !(p == 0 || p == 1) || !(l == 20 || l == 2) {
			return "error:28"
		}
		for i, a := range axes {
			if has[a] {
				if l == 20 {
					s.wco[i] = s.pos[i] - s.g92[i] - val[a]*unit
				} else {
					s.wco[i] = val[a] * unit
				}
			}
		}
		return ""
	}
	if g92 {
		for i, a := range axes {
			if has[a] {
				s.g92[i] = s.pos[i] - s.wco[i] - val[a]*unit
			}
		}
		return ""
	}
	if g921 {
		s.g92 = [3]float64{}
		return ""
	}
	if g4 {
		s.plan = append(s.plan, &simBlock{kind: "dwell", dwell: val["P"]})
		return ""
	}
	if motion >= 0 && !jog {
		s.motion = int(motion)
	}
	if !has["X"] && !has["Y"] && !has["Z"] {
		if jog {
			return "error:16"
		}
		return ""
	}
	mo := s.motion
	if motion >= 0 {
		mo = int(motion)
	}
	if jog {
		mo = 1
		if !has["F"] {
			return "error:22"
		}
	}
	// cílová poloha ve strojových souřadnicích
	var to [3]float64
	wt := s.wcoTotal()
	for i, a := range axes {
		to[i] = s.pos[i]
		if has[a] {
			v := val[a] * unit
			switch {
			case machine:
				to[i] = v
			case abs:
				to[i] = v + wt[i]
			default:
				to[i] = s.pos[i] + v
			}
		}
	}
	if s.check {
		s.pos = to // kontrolní režim: jen projít
		return ""
	}
	feed := s.feed
	if jog {
		feed = val["F"] * unit
	}
	if probe != "" {
		if feed <= 0 {
			return "error:22"
		}
		s.plan = append(s.plan, &simBlock{kind: "probe", to: to, feed: feed, probe: probe})
		return "wait"
	}
	if mo != 0 && feed <= 0 {
		return "error:22"
	}
	b := &simBlock{kind: "move", to: to, feed: feed, rapid: mo == 0, jog: jog}
	s.plan = append(s.plan, b)
	if jog {
		s.state = "Jog"
	} else if s.state == "Idle" {
		s.state = "Run"
	}
	return ""
}

func (s *grblSim) motionStep(dt float64) {
	if s.hold {
		if s.holdT > 0 {
			s.holdT -= dt
			if s.holdT <= 0 {
				s.state = "Hold:0"
			}
		}
		return
	}
	for dt > 0 && len(s.plan) > 0 {
		b := s.plan[0]
		if s.state == "Idle" && b.kind != "home" {
			if b.jog {
				s.state = "Jog"
			} else {
				s.state = "Run"
			}
		}
		if b.kind == "dwell" {
			if b.remain == 0 {
				b.remain = b.dwell
			}
			b.remain -= dt
			if b.remain > 0 {
				return
			}
			dt = -b.remain
			s.plan = s.plan[1:]
			continue
		}
		rate := b.feed * float64(s.ovF) / 100
		if b.rapid || b.kind == "home" {
			rate = 1500 * float64(s.ovR) / 100
		}
		if b.jog {
			rate = b.feed
		}
		d := [3]float64{b.to[0] - s.pos[0], b.to[1] - s.pos[1], b.to[2] - s.pos[2]}
		L := math.Sqrt(d[0]*d[0] + d[1]*d[1] + d[2]*d[2])
		step := rate / 60 * dt
		if b.kind == "probe" {
			// po malých krocích kvůli dotyku
			for L > 1e-9 && step > 0 {
				k := math.Min(step, math.Min(L, 0.002))
				for i := range s.pos {
					s.pos[i] += d[i] / L * k
				}
				step -= k
				dd := [3]float64{b.to[0] - s.pos[0], b.to[1] - s.pos[1], b.to[2] - s.pos[2]}
				L = math.Sqrt(dd[0]*dd[0] + dd[1]*dd[1] + dd[2]*dd[2])
				toward := b.probe == "38.2" || b.probe == "38.3"
				if toward && s.probeContact(s.pos) {
					s.pos[2] = simSurface(s.pos[0], s.pos[1])
					s.prb, s.prbOK = s.pos, true
					s.emit(fmt.Sprintf("[PRB:%s:1]", f3(s.prb)))
					s.emit("ok")
					s.waitOK = false
					s.plan = s.plan[1:]
					s.state = "Idle"
					return
				}
			}
			if L <= 1e-9 {
				s.prbOK = false
				s.plan = nil
				s.waitOK = false
				if b.probe == "38.2" || b.probe == "38.4" {
					s.state = "Alarm"
					s.emit("ALARM:5")
					s.emit("error:9")
				} else {
					s.emit(fmt.Sprintf("[PRB:%s:0]", f3(s.pos)))
					s.emit("ok")
					s.state = "Idle"
				}
			}
			return
		}
		if step >= L {
			s.pos = b.to
			s.sampleCut(b)
			s.plan = s.plan[1:]
			if L > 0 {
				dt -= L / (rate / 60)
			}
			if b.kind == "home" {
				s.state = "Idle"
				s.waitOK = false
				s.emit("ok")
			}
			continue
		}
		for i := range s.pos {
			s.pos[i] += d[i] / L * step
		}
		s.sampleCut(b)
		dt = 0
	}
	if len(s.plan) == 0 && (s.state == "Run" || s.state == "Jog") {
		s.state = "Idle"
	}
}

// hloubka pod povrchem při řezných pohybech (jen vodorovné úseky – zanoření se nepočítá)
func (s *grblSim) sampleCut(b *simBlock) {
	if b.kind != "move" || b.rapid || b.jog || s.check {
		return
	}
	d := simSurface(s.pos[0], s.pos[1]) - s.pos[2]
	if d <= 0.001 || math.Abs(b.to[2]-s.pos[2]) > 1e-6 {
		return
	}
	if s.CutN == 0 || d < s.CutMin {
		s.CutMin = d
	}
	if s.CutN == 0 || d > s.CutMax {
		s.CutMax = d
	}
	s.CutN++
}
