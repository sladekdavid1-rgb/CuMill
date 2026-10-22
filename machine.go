package main

// Spojení s GRBL (náhrada UGS / Candle): sériový port, posílání programu s počítáním znaků
// (RX buffer GRBL 128 B), ruční příkazy s čekáním na odpověď, real-time příkazy,
// průběžný stav a události do UI přes Server-Sent Events.

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const grblRX = 127 // RX buffer GRBL je 128 B, necháme 1 B rezervu

type portRW interface {
	io.ReadWriteCloser
}

type cmdResult struct {
	OK   bool     `json:"ok"`
	Resp string   `json:"resp"`
	Msgs []string `json:"msgs"`
}

type inflight struct {
	n      int // délka včetně \n
	entry  int // index řádku programu, -1 = ruční/úvodní
	text   string
	waiter chan cmdResult
	msgs   []string
}

type manualCmd struct {
	text   string
	waiter chan cmdResult
}

type Machine struct {
	mu       sync.Mutex
	port     portRW
	portName string
	gen      int // číslo spojení (staré čtecí smyčky se ukončí)

	// program
	lines     []string
	pre       []string
	next      int
	streaming bool
	paused    bool
	stopping  bool
	done      int // počet potvrzených řádků programu (index posledního + 1)
	errLine   int
	startT    time.Time

	inflight []*inflight
	inBytes  int
	manual   []manualCmd

	zFeed  float64 // korekce posuvu jen pro pohyby v ose Z (zanoření), 1 = 100 %
	modalF float64
	modalG int

	ready    bool // GRBL odpověděl (po připojení se Arduino restartuje – do té doby nic neposílat)
	state    string
	wake     chan struct{}
	subs     map[chan []byte]struct{}
	lastProg time.Time
}

var mach = &Machine{zFeed: 1, wake: make(chan struct{}, 1), subs: map[chan []byte]struct{}{}, state: "Odpojeno"}
var eventToken = func() string { b := make([]byte, 16); _, _ = rand.Read(b); return hex.EncodeToString(b) }()

// ---------- události do UI ----------
func (m *Machine) emit(v map[string]any) {
	b, _ := json.Marshal(v)
	for ch := range m.subs {
		select {
		case ch <- b:
		default: // pomalý odběratel – zahodit
		}
	}
}

func (m *Machine) progressLocked(force bool) {
	if !force && time.Since(m.lastProg) < 100*time.Millisecond {
		return
	}
	m.lastProg = time.Now()
	m.emit(map[string]any{"t": "prog", "done": m.done, "next": m.next, "total": len(m.lines), "streaming": m.streaming, "paused": m.paused, "err": m.errLine})
}

func (m *Machine) kick() {
	select {
	case m.wake <- struct{}{}:
	default:
	}
}

// ---------- připojení ----------
func (m *Machine) Connect(name string, baud int) error {
	m.Disconnect()
	var p portRW
	var err error
	if name == simPortName {
		p = newGrblSim(simSpeed())
	} else {
		p, err = openSerial(name, baud)
	}
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.port, m.portName = p, name
	m.gen++
	gen := m.gen
	m.resetStateLocked()
	m.ready = false
	m.state = "Připojuji"
	m.emit(map[string]any{"t": "conn", "port": name, "on": true})
	m.mu.Unlock()
	go m.readLoop(p, gen)
	go m.sendLoop(gen)
	go m.pollLoop(gen)
	return nil
}

func (m *Machine) Disconnect() {
	m.mu.Lock()
	p := m.port
	m.port = nil
	m.gen++
	m.resetStateLocked()
	m.state = "Odpojeno"
	if p != nil {
		m.emit(map[string]any{"t": "conn", "on": false})
	}
	m.mu.Unlock()
	if p != nil {
		_ = p.Close()
	}
	m.kick()
}

func (m *Machine) resetStateLocked() {
	for _, f := range m.inflight {
		if f.waiter != nil {
			f.waiter <- cmdResult{OK: false, Resp: "reset"}
		}
	}
	for _, c := range m.manual {
		c.waiter <- cmdResult{OK: false, Resp: "reset"}
	}
	m.inflight, m.manual, m.inBytes = nil, nil, 0
	m.streaming, m.paused, m.stopping, m.pre = false, false, false, nil
}

func (m *Machine) writeRaw(b []byte) error {
	m.mu.Lock()
	p := m.port
	m.mu.Unlock()
	if p == nil {
		return errors.New("stroj není připojen")
	}
	_, err := p.Write(b)
	return err
}

// ---------- čtení odpovědí ----------
var reAlarm = regexp.MustCompile(`^ALARM:(\d+)`)
var reErr = regexp.MustCompile(`^error:(\d+)`)

func (m *Machine) readLoop(p portRW, gen int) {
	r := bufio.NewReaderSize(p, 4096)
	for {
		line, err := r.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if line != "" {
			m.handleLine(line, gen)
		}
		if err != nil {
			m.mu.Lock()
			if m.gen == gen && m.port != nil {
				m.mu.Unlock()
				m.emit(map[string]any{"t": "msg", "level": "error", "text": "Spojení se strojem přerušeno: " + err.Error()})
				m.Disconnect()
				return
			}
			m.mu.Unlock()
			return
		}
	}
}

func (m *Machine) handleLine(line string, gen int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.gen != gen {
		return
	}
	switch {
	case strings.HasPrefix(line, "<"):
		if !m.ready {
			m.ready = true
			m.kick()
		}
		if i := strings.IndexAny(line[1:], "|>"); i > 0 {
			m.state = line[1 : 1+i]
		}
		m.emit(map[string]any{"t": "st", "s": line})
		return
	case line == "ok" || strings.HasPrefix(line, "error:"):
		if len(m.inflight) == 0 {
			m.emit(map[string]any{"t": "rx", "s": line})
			return
		}
		f := m.inflight[0]
		m.inflight = m.inflight[1:]
		m.inBytes -= f.n
		ok := line == "ok"
		if f.waiter != nil {
			f.waiter <- cmdResult{OK: ok, Resp: line, Msgs: f.msgs}
		}
		if f.entry >= 0 {
			if f.entry+1 > m.done {
				m.done = f.entry + 1
			}
			if !ok {
				// chyba v programu: zastavit posílání a podržet stroj, ať uživatel rozhodne
				m.errLine = f.entry
				m.paused = true
				if m.port != nil {
					_, _ = m.port.Write([]byte{'!'})
				}
				code, _ := strconv.Atoi(strings.TrimPrefix(line, "error:"))
				m.emit(map[string]any{"t": "perr", "line": f.entry, "code": code, "text": f.text})
				m.progressLocked(true)
			} else {
				m.progressLocked(false)
			}
		} else if f.waiter == nil || !ok {
			m.emit(map[string]any{"t": "rx", "s": line, "cmd": f.text})
		}
		m.checkDoneLocked()
		m.kick()
		return
	case reAlarm.MatchString(line):
		// čekající ruční příkaz (např. měření sondou) dostane alarm jako odpověď
		for _, f := range m.inflight {
			if f.waiter != nil {
				f.waiter <- cmdResult{OK: false, Resp: line, Msgs: f.msgs}
				f.waiter = nil
				break
			}
		}
		was := m.streaming
		m.streaming, m.paused, m.pre = false, false, nil
		m.emit(map[string]any{"t": "alarm", "s": line, "wasStreaming": was})
		m.progressLocked(true)
	case strings.HasPrefix(line, "Grbl ") || strings.HasPrefix(line, "GrblHAL"):
		// restart řídicí jednotky (po resetu) – vše rozpracované je pryč
		was := m.streaming
		m.resetStateLocked()
		m.stopping = false
		m.ready = true
		m.emit(map[string]any{"t": "reset", "s": line, "wasStreaming": was})
		m.progressLocked(true)
		m.kick()
		return
	}
	// zprávy [PRB:..], [MSG:..], [GC:..], $N=hodnota … patří k právě čekajícímu ručnímu příkazu
	if len(m.inflight) > 0 && m.inflight[0].entry < 0 {
		m.inflight[0].msgs = append(m.inflight[0].msgs, line)
	}
	m.emit(map[string]any{"t": "rx", "s": line})
}

func (m *Machine) checkDoneLocked() {
	if !m.streaming || m.next < len(m.lines) || len(m.pre) > 0 {
		return
	}
	for _, f := range m.inflight {
		if f.entry >= 0 {
			return
		}
	}
	m.streaming = false
	m.done = len(m.lines)
	m.emit(map[string]any{"t": "end", "secs": time.Since(m.startT).Seconds()})
	m.progressLocked(true)
}

// ---------- posílání ----------
func (m *Machine) sendLoop(gen int) {
	for {
		m.mu.Lock()
		if m.gen != gen {
			m.mu.Unlock()
			return
		}
		m.fillLocked()
		m.mu.Unlock()
		select {
		case <-m.wake:
		case <-time.After(50 * time.Millisecond):
		}
	}
}

// pošle tolik řádků, kolik se vejde do RX bufferu GRBL
func (m *Machine) fillLocked() {
	if m.port == nil || m.stopping || !m.ready {
		return
	}
	var out []byte
	for {
		var text string
		entry := -1
		var waiter chan cmdResult
		switch {
		case len(m.manual) > 0:
			text, waiter = m.manual[0].text, m.manual[0].waiter
		case m.streaming && !m.paused && len(m.pre) > 0:
			text = m.pre[0]
		case m.streaming && !m.paused && m.next < len(m.lines):
			// prázdné a komentářové řádky se přeskočí, řádek může obsahovat víc bloků (vynechání)
			raw := m.lines[m.next]
			blocks := splitBlocks(raw)
			if len(blocks) == 0 {
				m.next++
				m.checkDoneLocked()
				continue
			}
			if len(blocks) > 1 {
				// rozepsat na samostatné bloky; potvrzení posledního = hotový řádek
				m.lines[m.next] = blocks[len(blocks)-1]
				m.pre = append(m.pre, blocks[:len(blocks)-1]...)
				continue
			}
			text, entry = m.applyZFeed(blocks[0]), m.next
		default:
			if len(out) > 0 {
				_, _ = m.port.Write(out)
			}
			return
		}
		n := len(text) + 1
		if n > grblRX {
			text = text[:grblRX-1]
			n = grblRX
		}
		if m.inBytes+n > grblRX {
			break
		}
		switch {
		case len(m.manual) > 0:
			m.manual = m.manual[1:]
		case entry < 0:
			m.pre = m.pre[1:]
			m.trackModal(text)
		default:
			m.next++
		}
		m.inflight = append(m.inflight, &inflight{n: n, entry: entry, text: text, waiter: waiter})
		m.inBytes += n
		out = append(out, text...)
		out = append(out, '\n')
	}
	if len(out) > 0 {
		_, _ = m.port.Write(out)
	}
}

func splitBlocks(s string) []string {
	var r []string
	for _, l := range strings.Split(s, "\n") {
		l = stripComment(l)
		if l != "" {
			r = append(r, l)
		}
	}
	return r
}

func stripComment(l string) string {
	var b strings.Builder
	depth := 0
	for _, c := range l {
		if c == ';' && depth == 0 {
			break
		}
		if c == '(' {
			depth++
			continue
		}
		if c == ')' && depth > 0 {
			depth--
			continue
		}
		if depth == 0 && c != '\r' && c != '%' {
			b.WriteRune(c)
		}
	}
	return strings.TrimSpace(b.String())
}

var reWord = regexp.MustCompile(`([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+))`)

// korekce posuvu pro samotné pohyby v Z (zanoření / vyjetí posuvem) – GRBL to sám neumí
func (m *Machine) applyZFeed(text string) string {
	words := reWord.FindAllStringSubmatch(text, -1)
	hasXY, hasZ, hasF, motion := false, false, false, -1
	f := 0.0
	for _, w := range words {
		k := strings.ToUpper(w[1])
		v, _ := strconv.ParseFloat(w[2], 64)
		switch k {
		case "X", "Y", "I", "J", "R":
			hasXY = true
		case "Z":
			hasZ = true
		case "F":
			hasF, f = true, v
		case "G":
			if v == 0 || v == 1 || v == 2 || v == 3 {
				motion = int(v)
			}
		}
	}
	prevF := m.modalF
	m.trackModalWords(words)
	g := motion
	if g < 0 {
		g = m.modalG
	}
	feedMove := g == 1 || g == 2 || g == 3
	if !feedMove || strings.HasPrefix(text, "$") {
		return text
	}
	if hasZ && !hasXY && m.zFeed != 1 {
		base := prevF
		if hasF {
			base = f
		}
		if base <= 0 {
			return text
		}
		nf := fmtNum(base * m.zFeed)
		if hasF {
			return reWord.ReplaceAllStringFunc(text, func(s string) string {
				if strings.ToUpper(s[:1]) == "F" {
					return "F" + nf
				}
				return s
			})
		}
		return text + " F" + nf
	}
	// po upraveném zanoření vrátit původní modální posuv
	if hasXY && !hasF && m.zFeed != 1 && prevF > 0 {
		return text + " F" + fmtNum(prevF)
	}
	return text
}

func (m *Machine) trackModal(text string) { m.trackModalWords(reWord.FindAllStringSubmatch(text, -1)) }
func (m *Machine) trackModalWords(words [][]string) {
	for _, w := range words {
		v, _ := strconv.ParseFloat(w[2], 64)
		switch strings.ToUpper(w[1]) {
		case "F":
			m.modalF = v
		case "G":
			if v == 0 || v == 1 || v == 2 || v == 3 {
				m.modalG = int(v)
			}
		}
	}
}

func fmtNum(v float64) string {
	s := strconv.FormatFloat(math.Round(v*1000)/1000, 'f', -1, 64)
	return s
}

// dotaz na stav 5× za sekundu
func (m *Machine) pollLoop(gen int) {
	t := time.NewTicker(200 * time.Millisecond)
	defer t.Stop()
	for range t.C {
		m.mu.Lock()
		if m.gen != gen || m.port == nil {
			m.mu.Unlock()
			return
		}
		p := m.port
		m.mu.Unlock()
		_, _ = p.Write([]byte{'?'})
	}
}

// ---------- ovládání ----------
func (m *Machine) Command(text string, wait bool, timeout time.Duration) (cmdResult, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return cmdResult{OK: true}, nil
	}
	m.mu.Lock()
	if m.port == nil {
		m.mu.Unlock()
		return cmdResult{}, errors.New("stroj není připojen")
	}
	if m.streaming {
		m.mu.Unlock()
		return cmdResult{}, errors.New("během běhu programu nejde poslat jiný příkaz (zastav nebo počkej na konec)")
	}
	ch := make(chan cmdResult, 1)
	m.manual = append(m.manual, manualCmd{text: text, waiter: ch})
	m.emit(map[string]any{"t": "tx", "s": text})
	m.mu.Unlock()
	m.kick()
	if !wait {
		return cmdResult{OK: true}, nil
	}
	select {
	case r := <-ch:
		return r, nil
	case <-time.After(timeout):
		return cmdResult{}, errors.New("stroj neodpověděl včas")
	}
}

func (m *Machine) Load(lines []string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.streaming {
		return
	}
	m.lines = lines
	m.next, m.done, m.errLine = 0, 0, -1
	m.progressLocked(true)
}

func (m *Machine) Start(from int, pre []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.port == nil {
		return errors.New("stroj není připojen")
	}
	if m.streaming {
		return errors.New("program už běží")
	}
	if len(m.lines) == 0 {
		return errors.New("není načtený program")
	}
	if from < 0 || from >= len(m.lines) {
		from = 0
	}
	m.next, m.done, m.errLine = from, from, -1
	m.pre = append([]string(nil), pre...)
	m.streaming, m.paused, m.stopping = true, false, false
	m.modalF, m.modalG = 0, 0
	m.startT = time.Now()
	m.progressLocked(true)
	m.kick()
	return nil
}

func (m *Machine) Pause() error {
	m.mu.Lock()
	m.paused = true
	m.progressLocked(true)
	m.mu.Unlock()
	return m.writeRaw([]byte{'!'})
}

func (m *Machine) Resume() error {
	m.mu.Lock()
	m.paused = false
	m.errLine = -1
	m.progressLocked(true)
	m.mu.Unlock()
	m.kick()
	return m.writeRaw([]byte{'~'})
}

// zastavení: podržet (plynulé zastavení bez ztráty polohy), pak měkký reset
func (m *Machine) Stop() error {
	m.mu.Lock()
	if m.port == nil {
		m.mu.Unlock()
		return errors.New("stroj není připojen")
	}
	m.streaming, m.paused, m.pre = false, false, nil
	m.next = len(m.lines)
	m.stopping = true
	gen := m.gen
	m.progressLocked(true)
	m.mu.Unlock()
	if err := m.writeRaw([]byte{'!'}); err != nil {
		return err
	}
	go func() {
		deadline := time.Now().Add(4 * time.Second)
		for time.Now().Before(deadline) {
			time.Sleep(100 * time.Millisecond)
			m.mu.Lock()
			st, g := m.state, m.gen
			m.mu.Unlock()
			if g != gen {
				return
			}
			if st == "Hold:0" || st == "Idle" || strings.HasPrefix(st, "Alarm") || st == "Check" {
				break
			}
		}
		_ = m.writeRaw([]byte{0x18})
		m.mu.Lock()
		m.stopping = false
		m.mu.Unlock()
	}()
	return nil
}

// náhrada řádků programu, které ještě nebyly odeslané (vynechání drah za běhu)
func (m *Machine) Patch(idx []int, text []string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, i := range idx {
		if i < 0 || i >= len(m.lines) {
			return m.next, errors.New("řádek mimo program")
		}
		if m.streaming && i < m.next {
			return m.next, fmt.Errorf("řádek %d už byl odeslán do stroje", i+1)
		}
	}
	for k, i := range idx {
		m.lines[i] = text[k]
	}
	return m.next, nil
}

// ---------- HTTP ----------
func registerMachineAPI(mux *http.ServeMux, guard func(func(http.ResponseWriter, *http.Request) error) http.HandlerFunc) {
	decode := func(r *http.Request, v any) error { return json.NewDecoder(r.Body).Decode(v) }
	ok := func(w http.ResponseWriter, v any) error {
		if v == nil {
			v = map[string]any{"ok": true}
		}
		return writeJSON(w, v)
	}
	mux.HandleFunc("/api/m/ports", guard(func(w http.ResponseWriter, r *http.Request) error {
		return ok(w, map[string]any{"ports": append(listSerialPorts(), simPortName), "token": eventToken})
	}))
	mux.HandleFunc("/api/m/connect", guard(func(w http.ResponseWriter, r *http.Request) error {
		var q struct {
			Port string
			Baud int
		}
		if err := decode(r, &q); err != nil {
			return err
		}
		if q.Baud == 0 {
			q.Baud = 115200
		}
		return errOr(w, mach.Connect(q.Port, q.Baud))
	}))
	mux.HandleFunc("/api/m/disconnect", guard(func(w http.ResponseWriter, r *http.Request) error { mach.Disconnect(); return ok(w, nil) }))
	mux.HandleFunc("/api/m/cmd", guard(func(w http.ResponseWriter, r *http.Request) error {
		var q struct {
			Line    string
			Wait    bool
			Timeout float64
		}
		if err := decode(r, &q); err != nil {
			return err
		}
		to := time.Duration(q.Timeout * float64(time.Second))
		if to <= 0 {
			to = 30 * time.Second
		}
		res, err := mach.Command(q.Line, q.Wait, to)
		if err != nil {
			return err
		}
		return ok(w, res)
	}))
	mux.HandleFunc("/api/m/rt", guard(func(w http.ResponseWriter, r *http.Request) error {
		var q struct{ Bytes []int }
		if err := decode(r, &q); err != nil {
			return err
		}
		b := make([]byte, len(q.Bytes))
		for i, v := range q.Bytes {
			b[i] = byte(v)
		}
		if err := mach.writeRaw(b); err != nil {
			return err
		}
		return ok(w, nil)
	}))
	mux.HandleFunc("/api/m/load", guard(func(w http.ResponseWriter, r *http.Request) error {
		var q struct{ Lines []string }
		if err := decode(r, &q); err != nil {
			return err
		}
		mach.Load(q.Lines)
		return ok(w, nil)
	}))
	mux.HandleFunc("/api/m/start", guard(func(w http.ResponseWriter, r *http.Request) error {
		var q struct {
			From int
			Pre  []string
		}
		if err := decode(r, &q); err != nil {
			return err
		}
		if err := mach.Start(q.From, q.Pre); err != nil {
			return err
		}
		return ok(w, nil)
	}))
	mux.HandleFunc("/api/m/pause", guard(func(w http.ResponseWriter, r *http.Request) error { return errOr(w, mach.Pause()) }))
	mux.HandleFunc("/api/m/resume", guard(func(w http.ResponseWriter, r *http.Request) error { return errOr(w, mach.Resume()) }))
	mux.HandleFunc("/api/m/stop", guard(func(w http.ResponseWriter, r *http.Request) error { return errOr(w, mach.Stop()) }))
	mux.HandleFunc("/api/m/patch", guard(func(w http.ResponseWriter, r *http.Request) error {
		var q struct {
			Idx  []int
			Text []string
		}
		if err := decode(r, &q); err != nil {
			return err
		}
		if len(q.Idx) != len(q.Text) {
			return errors.New("neplatná změna")
		}
		next, err := mach.Patch(q.Idx, q.Text)
		if err != nil {
			return err
		}
		return ok(w, map[string]any{"ok": true, "next": next})
	}))
	mux.HandleFunc("/api/m/zfeed", guard(func(w http.ResponseWriter, r *http.Request) error {
		var q struct{ Pct float64 }
		if err := decode(r, &q); err != nil {
			return err
		}
		if q.Pct < 10 || q.Pct > 200 {
			return errors.New("korekce Z mimo 10–200 %")
		}
		mach.mu.Lock()
		mach.zFeed = q.Pct / 100
		mach.mu.Unlock()
		return ok(w, nil)
	}))
	mux.HandleFunc("/api/m/simstats", guard(func(w http.ResponseWriter, r *http.Request) error {
		mach.mu.Lock()
		sp, okp := mach.port.(*grblSim)
		mach.mu.Unlock()
		if !okp {
			return errors.New("jen pro simulátor")
		}
		sp.mu.Lock()
		defer sp.mu.Unlock()
		res := map[string]any{"cutMin": sp.CutMin, "cutMax": sp.CutMax, "n": sp.CutN, "overflows": sp.Overflows, "errors": sp.Errors}
		sp.CutMin, sp.CutMax, sp.CutN = 0, 0, 0
		return ok(w, res)
	}))
	mux.HandleFunc("/api/m/state", guard(func(w http.ResponseWriter, r *http.Request) error {
		mach.mu.Lock()
		defer mach.mu.Unlock()
		return ok(w, map[string]any{"port": mach.portName, "on": mach.port != nil, "done": mach.done, "next": mach.next, "total": len(mach.lines), "streaming": mach.streaming, "paused": mach.paused, "zfeed": mach.zFeed * 100})
	}))
	// události (EventSource nemůže poslat vlastní hlavičku -> token z /api/m/ports)
	mux.HandleFunc("/api/m/events", func(w http.ResponseWriter, r *http.Request) {
		if !hostOK(r.Host) || r.URL.Query().Get("k") != eventToken {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		fl, okf := w.(http.Flusher)
		if !okf {
			http.Error(w, "stream", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-store")
		ch := make(chan []byte, 512)
		mach.mu.Lock()
		mach.subs[ch] = struct{}{}
		on := mach.port != nil
		mach.emitTo(ch, map[string]any{"t": "conn", "on": on, "port": mach.portName})
		mach.mu.Unlock()
		defer func() { mach.mu.Lock(); delete(mach.subs, ch); mach.mu.Unlock() }()
		fl.Flush()
		ping := time.NewTicker(15 * time.Second)
		defer ping.Stop()
		for {
			select {
			case b := <-ch:
				_, _ = w.Write([]byte("data: "))
				_, _ = w.Write(b)
				_, _ = w.Write([]byte("\n\n"))
				// víc událostí naráz
				for k := 0; k < 64; k++ {
					select {
					case b2 := <-ch:
						_, _ = w.Write([]byte("data: "))
						_, _ = w.Write(b2)
						_, _ = w.Write([]byte("\n\n"))
						continue
					default:
					}
					break
				}
				fl.Flush()
			case <-ping.C:
				_, _ = w.Write([]byte(": ping\n\n"))
				fl.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})
}

func (m *Machine) emitTo(ch chan []byte, v map[string]any) {
	b, _ := json.Marshal(v)
	select {
	case ch <- b:
	default:
	}
}

func errOr(w http.ResponseWriter, err error) error {
	if err != nil {
		return err
	}
	return writeJSON(w, map[string]any{"ok": true})
}
