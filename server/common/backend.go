package common

import (
	"io"
	"os"
	"strings"
	"sync"
)

const BACKEND_NIL = "_nothing_"

var Backend = NewDriver()

func NewDriver() Driver {
	return Driver{ds: make(map[string]IBackend)}
}

type Driver struct {
	mu sync.RWMutex
	ds map[string]IBackend
}

func (d *Driver) Register(name string, driver IBackend) {
	if driver == nil {
		panic("backend: register invalid nil backend")
	}
	d.mu.Lock()
	d.ds[name] = driver
	d.mu.Unlock()
}

func (d *Driver) Get(name string) IBackend {
	d.mu.RLock()
	b := d.ds[name]
	d.mu.RUnlock()
	if b == nil || name == BACKEND_NIL {
		return Nothing{}
	}
	return b
}

func (d *Driver) Drivers() map[string]IBackend {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := make(map[string]IBackend, len(d.ds))
	for name, driver := range d.ds {
		out[name] = driver
	}
	return out
}

type Nothing struct{}

func (b Nothing) Init(params map[string]string, app *App) (IBackend, error) {
	return &b, nil
}
func (b Nothing) Ls(path string) ([]os.FileInfo, error) {
	return []os.FileInfo{}, nil
}
func (b Nothing) Stat(path string) (os.FileInfo, error) {
	return nil, ErrNotFound
}
func (b Nothing) Cat(path string) (io.ReadCloser, error) {
	return NewReadCloserFromReader(strings.NewReader("")), ErrNotImplemented
}
func (b Nothing) Mkdir(path string) error {
	return ErrNotImplemented
}
func (b Nothing) Rm(path string) error {
	return ErrNotImplemented
}
func (b Nothing) Mv(from string, to string) error {
	return ErrNotImplemented
}
func (b Nothing) Touch(path string) error {
	return ErrNotImplemented
}
func (b Nothing) Save(path string, file io.Reader) error {
	return ErrNotImplemented
}
func (b Nothing) LoginForm() Form {
	return Form{
		Elmnts: []FormElement{
			{
				Name:  "type",
				Type:  "hidden",
				Value: "nothing",
			},
		},
	}
}
