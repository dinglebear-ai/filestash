package common

import (
	"fmt"
	slog "log"
	"os"
	"strings"
	"sync"
	"time"
)

var (
	Log     = &log{enable: true}
	logfile *os.File
	logpath string
)

const maxLogFileSize int64 = 50 << 20

func InitLogger() (err error) {
	logpath = GetAbsolutePath(LOG_PATH, "access.log")
	if info, statErr := os.Stat(logpath); statErr == nil && info.Size() >= maxLogFileSize {
		rotateLogFiles(logpath)
	}
	logfile, err = os.OpenFile(logpath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0660)
	if err != nil {
		slog.Printf("ERROR log file: %+v", err)
		return err
	}
	logfile.WriteString("")
	return nil
}

type log struct {
	mu     sync.Mutex
	enable bool
	debug  bool
	info   bool
	warn   bool
	error  bool
}

func (l *log) Info(format string, v ...interface{}) {
	if l.info && l.enable {
		message := fmt.Sprintf("%s SYST INFO ", l.now())
		message = fmt.Sprintf(message+format+"\n", v...)

		l.write(message)
		fmt.Print(strings.Replace(message, "%", "%%", -1))
	}
}

func (l *log) Warning(format string, v ...interface{}) {
	if l.warn && l.enable {
		message := fmt.Sprintf("%s SYST WARN ", l.now())
		message = fmt.Sprintf(message+format+"\n", v...)

		l.write(message)
		fmt.Print(strings.Replace(message, "%", "%%", -1))
	}
}

func (l *log) Error(format string, v ...interface{}) {
	if l.error && l.enable {
		message := fmt.Sprintf("%s SYST ERROR ", l.now())
		message = fmt.Sprintf(message+format+"\n", v...)

		l.write(message)
		fmt.Print(strings.Replace(message, "%", "%%", -1))
	}
}

func (l *log) Debug(format string, v ...interface{}) {
	if l.debug && l.enable {
		message := fmt.Sprintf("%s SYST DEBUG ", l.now())
		message = fmt.Sprintf(message+format+"\n", v...)

		l.write(message)
		fmt.Print(strings.Replace(message, "%", "%%", -1))
	}
}

func (l *log) Stdout(format string, v ...interface{}) {
	message := fmt.Sprintf("%s ", l.now())
	message = fmt.Sprintf(message+format+"\n", v...)

	l.write(message)
	fmt.Print(strings.Replace(message, "%", "%%", -1))
}

func (l *log) now() string {
	return time.Now().Format("2006/01/02 15:04:05")
}

func (l *log) Close() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if logfile != nil {
		_ = logfile.Close()
		logfile = nil
	}
}

func (l *log) write(message string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if logfile == nil {
		return
	}
	if info, err := logfile.Stat(); err == nil && info.Size()+int64(len(message)) >= maxLogFileSize {
		_ = logfile.Close()
		rotateLogFiles(logpath)
		var openErr error
		logfile, openErr = os.OpenFile(logpath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0660)
		if openErr != nil {
			logfile = nil
			return
		}
	}
	_, _ = logfile.WriteString(message)
}

func rotateLogFiles(path string) {
	_ = os.Remove(path + ".3")
	_ = os.Rename(path+".2", path+".3")
	_ = os.Rename(path+".1", path+".2")
	_ = os.Rename(path, path+".1")
}

func (l *log) SetVisibility(str string) {
	switch str {
	case "WARNING":
		l.debug = false
		l.info = false
		l.warn = true
		l.error = true
	case "ERROR":
		l.debug = false
		l.info = false
		l.warn = false
		l.error = true
	case "DEBUG":
		l.debug = true
		l.info = true
		l.warn = true
		l.error = true
	case "INFO":
		l.debug = false
		l.info = true
		l.warn = true
		l.error = true
	default:
		l.debug = false
		l.info = true
		l.warn = true
		l.error = true
	}
}

func (l *log) Enable(val bool) {
	l.enable = val
}
