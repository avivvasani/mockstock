package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

const (
	pyFilename      = "testing.py" // worker filename
	pythonCmd       = "python3"
	restartBackoff  = 2 * time.Second
	maxBackoff      = 30 * time.Second
	shutdownTimeout = 8 * time.Second
	logFile         = "worker.log"
	jsonFile        = "prices.json"
	healthTimeout   = 30 * time.Second // restart if JSON is stale
)

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func modTime(path string) time.Time {
	info, err := os.Stat(path)
	if err != nil {
		return time.Time{}
	}
	return info.ModTime()
}

func rotateLogs() {
	if fileExists(logFile) {
		os.Rename(logFile, logFile+".1")
	}
}

func startWorker(ctx context.Context, pyBin string, pyPath string) (*exec.Cmd, error) {
	rotateLogs()
	logOut, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, err
	}
	cmd := exec.CommandContext(ctx, pyBin, pyPath)
	cmd.Stdout = logOut
	cmd.Stderr = logOut
	cmd.Dir = filepath.Dir(pyPath)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return cmd, nil
}

func stopProcess(cmd *exec.Cmd, timeout time.Duration) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	_ = cmd.Process.Signal(syscall.SIGINT)
	done := make(chan struct{})
	go func() {
		_ = cmd.Wait()
		close(done)
	}()
	select {
	case <-time.After(timeout):
		_ = cmd.Process.Kill()
	case <-done:
	}
}

func runCheck(pyBin, pyPath string) error {
	test := exec.Command(pyBin, pyPath, "--check")
	out, err := test.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v: %s", err, string(out))
	}
	return nil
}

func main() {
	pyPath, _ := filepath.Abs(pyFilename)
	if !fileExists(pyPath) {
		fmt.Fprintf(os.Stderr, "error: %s not found\n", pyFilename)
		os.Exit(1)
	}

	// check Python presence
	if _, err := exec.LookPath(pythonCmd); err != nil {
		fmt.Fprintln(os.Stderr, "error: python3 not found in PATH")
		os.Exit(1)
	}

	// optional dry run
	if err := runCheck(pythonCmd, pyPath); err != nil {
		fmt.Fprintln(os.Stderr, "worker check failed:", err)
		os.Exit(1)
	}

	fmt.Println("[supervisor] managing", pyFilename)
	sigc := make(chan os.Signal, 1)
	signal.Notify(sigc, syscall.SIGINT, syscall.SIGTERM)

	var cmd *exec.Cmd
	var cancel context.CancelFunc
	backoff := restartBackoff
	lastMod := modTime(jsonFile)

	for {
		ctx, cancelFn := context.WithCancel(context.Background())
		cancel = cancelFn

		var err error
		cmd, err = startWorker(ctx, pythonCmd, pyPath)
		if err != nil {
			fmt.Fprintln(os.Stderr, "[supervisor] failed to start worker:", err)
			time.Sleep(backoff)
			continue
		}

		fmt.Printf("[supervisor] worker started (pid: %d)\n", cmd.Process.Pid)
		backoff = restartBackoff

		exited := make(chan error, 1)
		go func() { exited <- cmd.Wait() }()

		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

	loop:
		for {
			select {
			case sig := <-sigc:
				fmt.Printf("\n[supervisor] received %v, stopping...\n", sig)
				stopProcess(cmd, shutdownTimeout)
				cancel()
				fmt.Println("[supervisor] stopped.")
				return
			case err := <-exited:
				if err != nil {
					fmt.Printf("[supervisor] worker exited: %v\n", err)
				} else {
					fmt.Println("[supervisor] worker exited cleanly.")
				}
				break loop
			case <-ticker.C:
				newMod := modTime(jsonFile)
				if !lastMod.IsZero() && newMod.Sub(lastMod) > 0 {
					lastMod = newMod
				} else if time.Since(lastMod) > healthTimeout {
					fmt.Println("[supervisor] health check failed — restarting worker.")
					stopProcess(cmd, shutdownTimeout)
					break loop
				}
			}
		}

		cancel()
		fmt.Printf("[supervisor] restarting worker in %v...\n", backoff)
		time.Sleep(backoff)
		if backoff < maxBackoff {
			backoff *= 2
		}
	}
}
