//go:build windows

package main

// Nativní dialogy Windows (IFileOpenDialog přes COM) bez CGO.

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	ole32         = syscall.NewLazyDLL("ole32.dll")
	procCoInit    = ole32.NewProc("CoInitializeEx")
	procCoUninit  = ole32.NewProc("CoUninitialize")
	procCoCreate  = ole32.NewProc("CoCreateInstance")
	procCoFree    = ole32.NewProc("CoTaskMemFree")
	shell32       = syscall.NewLazyDLL("shell32.dll")
	procSHCreate  = shell32.NewProc("SHCreateItemFromParsingName")
	dialogMu      sync.Mutex
	clsidFileOpen = &windows.GUID{Data1: 0xDC1C5A9C, Data2: 0xE88A, Data3: 0x4DDE, Data4: [8]byte{0xA5, 0xA1, 0x60, 0xF8, 0x2A, 0x20, 0xAE, 0xF7}}
	iidFileOpen   = &windows.GUID{Data1: 0xD57C7288, Data2: 0xD4AD, Data3: 0x4768, Data4: [8]byte{0xBE, 0x02, 0x9D, 0x96, 0x95, 0x32, 0xD9, 0x60}}
	iidShellItem  = &windows.GUID{Data1: 0x43826D1E, Data2: 0xE718, Data3: 0x42EE, Data4: [8]byte{0xBC, 0x55, 0xA1, 0xE2, 0x61, 0xC3, 0x7B, 0xFE}}
)

const (
	fosPickFolders   = 0x20
	fosForceFS       = 0x40
	fosAllowMulti    = 0x200
	fosPathMustExist = 0x800
	fosFileMustExist = 0x1000
	sigdnFSPath      = 0x80058000
)

// volání metody COM rozhraní podle pořadí ve vtable
func vcall(obj uintptr, idx int, args ...uintptr) uintptr {
	vtbl := *(*uintptr)(unsafe.Pointer(obj))
	fn := *(*uintptr)(unsafe.Pointer(vtbl + uintptr(idx)*unsafe.Sizeof(uintptr(0))))
	r, _, _ := syscall.SyscallN(fn, append([]uintptr{obj}, args...)...)
	return r
}
func release(obj uintptr) {
	if obj != 0 {
		vcall(obj, 2)
	}
}

// proměnné, jejichž adresu dostává Windows, držíme na haldě (Go nesmí posunout zásobník)
type comBuf struct {
	opts  uint32
	obj   uintptr
	item  uintptr
	arr   uintptr
	count uint32
	str   *uint16
	specs [4][2]*uint16
}

var bufSink *comBuf

func openFilesDialog(start, kind string) ([]string, error) {
	if kind == "gcode" {
		return fileDialog("Otevřít G-kód", start, false, true, [][2]string{
			{"G-kód (*.nc, *.ngc, *.gcode, *.tap)", "*.nc;*.ngc;*.gcode;*.gc;*.tap;*.cnc;*.txt"},
			{"Všechny soubory", "*.*"},
		})
	}
	return fileDialog("Otevřít desku KiCad nebo gerbery", start, false, true, [][2]string{
		{"Deska KiCad, projekt KiMill, gerbery, vrtání", "*.kicad_pcb;*.kimill;*.cumill;*.gbr;*.gtl;*.gbl;*.gko;*.gm1;*.gml;*.drl;*.xln;*.exc"},
		{"Projekt KiMill (*.kimill)", "*.kimill;*.cumill"},
		{"Deska KiCad (*.kicad_pcb)", "*.kicad_pcb"},
		{"Všechny soubory", "*.*"},
	})
}

func pickFolderDialog(start string) (string, error) {
	p, err := fileDialog("Složka pro G-kódy", start, true, false, nil)
	if err != nil || len(p) == 0 {
		return "", err
	}
	return p[0], nil
}

func fileDialog(title, start string, folder, multi bool, filters [][2]string) ([]string, error) {
	dialogMu.Lock()
	defer dialogMu.Unlock()
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	b := &comBuf{}
	bufSink = b // drží na haldě
	defer func() { bufSink = nil }()

	hr, _, _ := procCoInit.Call(0, 2) // COINIT_APARTMENTTHREADED
	if hr == 0 || hr == 1 {
		defer procCoUninit.Call()
	}
	hr, _, _ = procCoCreate.Call(uintptr(unsafe.Pointer(clsidFileOpen)), 0, 1 /*CLSCTX_INPROC_SERVER*/, uintptr(unsafe.Pointer(iidFileOpen)), uintptr(unsafe.Pointer(&b.obj)))
	if hr != 0 || b.obj == 0 {
		return nil, fmt.Errorf("dialog nelze otevřít (0x%X)", hr)
	}
	dlg := b.obj
	defer release(dlg)

	vcall(dlg, 10, uintptr(unsafe.Pointer(&b.opts))) // GetOptions
	o := b.opts | fosForceFS | fosPathMustExist
	if folder {
		o |= fosPickFolders
	} else {
		o |= fosFileMustExist
	}
	if multi {
		o |= fosAllowMulti
	}
	vcall(dlg, 9, uintptr(o)) // SetOptions
	t, _ := syscall.UTF16PtrFromString(title)
	vcall(dlg, 17, uintptr(unsafe.Pointer(t))) // SetTitle
	if !folder && len(filters) > 0 {
		n := len(filters)
		if n > len(b.specs) {
			n = len(b.specs)
		}
		for i := 0; i < n; i++ {
			b.specs[i][0], _ = syscall.UTF16PtrFromString(filters[i][0])
			b.specs[i][1], _ = syscall.UTF16PtrFromString(filters[i][1])
		}
		vcall(dlg, 4, uintptr(n), uintptr(unsafe.Pointer(&b.specs[0]))) // SetFileTypes
	}
	if start != "" {
		if st, err := os.Stat(start); err == nil {
			if !st.IsDir() {
				start = filepath.Dir(start)
			}
			p, _ := syscall.UTF16PtrFromString(start)
			b.item = 0
			if r, _, _ := procSHCreate.Call(uintptr(unsafe.Pointer(p)), 0, uintptr(unsafe.Pointer(iidShellItem)), uintptr(unsafe.Pointer(&b.item))); r == 0 && b.item != 0 {
				vcall(dlg, 12, b.item) // SetFolder
				release(b.item)
			}
			runtime.KeepAlive(p)
		}
	}
	if vcall(dlg, 3, ownerHwnd) != 0 { // Show – nenulové = zrušeno
		return nil, nil
	}
	var out []string
	if multi {
		if vcall(dlg, 27, uintptr(unsafe.Pointer(&b.arr))) != 0 || b.arr == 0 { // GetResults
			return nil, errors.New("výběr se nepodařilo načíst")
		}
		defer release(b.arr)
		vcall(b.arr, 7, uintptr(unsafe.Pointer(&b.count))) // GetCount
		for i := uint32(0); i < b.count; i++ {
			b.item = 0
			if vcall(b.arr, 8, uintptr(i), uintptr(unsafe.Pointer(&b.item))) == 0 && b.item != 0 { // GetItemAt
				if p := itemPath(b); p != "" {
					out = append(out, p)
				}
				release(b.item)
			}
		}
	} else {
		b.item = 0
		if vcall(dlg, 20, uintptr(unsafe.Pointer(&b.item))) == 0 && b.item != 0 { // GetResult
			if p := itemPath(b); p != "" {
				out = append(out, p)
			}
			release(b.item)
		}
	}
	runtime.KeepAlive(t)
	runtime.KeepAlive(b)
	return out, nil
}

func itemPath(b *comBuf) string {
	b.str = nil
	if vcall(b.item, 5, sigdnFSPath, uintptr(unsafe.Pointer(&b.str))) != 0 || b.str == nil { // GetDisplayName
		return ""
	}
	s := windows.UTF16PtrToString(b.str)
	procCoFree.Call(uintptr(unsafe.Pointer(b.str)))
	return s
}
