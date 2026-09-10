// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {resetForTest} from '../../../../test-container.js';
import {BrewPackageManager} from '../../../../../src/core/package-managers/brew-package-manager.js';

/**
 * Validates Solo's Linux container-runtime bootstrap end to end: Homebrew is installed when it is
 * absent, `brew install podman` lands a podman new enough for kind's podman provider, and that
 * podman actually runs a container rootfully — the mode Solo uses on Linux (`PodmanMode.ROOTFUL`).
 *
 * Every assertion targets the brew-installed binary specifically (see {@link resolvePodmanPath}),
 * never the distribution-native podman, which is too old for kind — installing podman through
 * Homebrew instead is precisely the behaviour under test.
 *
 * This mutates the host (it installs Homebrew and podman), so it only runs on disposable CI VM
 * runners when {@link SOLO_PODMAN_RUNTIME_VALIDATION} is set; every other run skips it.
 *
 * Creating the kind cluster on top of this podman is the workflow's job
 * (`.github/workflows/flow-install-validation-runtime.yaml`), not this harness's.
 *
 * Tracked by hiero-ledger/solo#4888 (per-distro install validation epic).
 */
const SOLO_PODMAN_RUNTIME_VALIDATION: string = 'SOLO_PODMAN_RUNTIME_VALIDATION';

/** Oldest podman release kind's podman provider supports, as `[major, minor]`. */
const MINIMUM_PODMAN_VERSION: [number, number] = [3, 0];

/** Quay is used rather than Docker Hub so shared CI runners do not hit anonymous pull-rate limits. */
const HELLO_IMAGE: string = 'quay.io/podman/hello';

/** Fixed prefix `BrewPackageManager` installs into, used when `brew --prefix` cannot be consulted. */
const LINUXBREW_PODMAN: string = '/home/linuxbrew/.linuxbrew/bin/podman';

/**
 * Returns the absolute path of the podman binary Homebrew just installed — never whatever the PATH
 * happens to resolve first. Debian/Ubuntu runners ship a distribution podman in `/usr/bin` that is
 * too old for kind, and it is exactly the brew-provided one this test exists to assert. Resolution
 * mirrors the `podman-directory` lookup in `.github/workflows/flow-install-validation-runtime.yaml`:
 * `brew --prefix podman`, then the fixed linuxbrew prefix, and only then the PATH.
 */
function resolvePodmanPath(): string {
  const candidates: string[] = [];
  try {
    const brewPrefix: string = execFileSync('brew', ['--prefix', 'podman'], {encoding: 'utf8'}).trim();
    candidates.push(path.join(brewPrefix, 'bin', 'podman'));
  } catch {
    // brew is not resolvable from this process; fall through to the fixed linuxbrew prefix.
  }
  candidates.push(LINUXBREW_PODMAN);
  return (
    candidates.find((candidate: string): boolean => fs.existsSync(candidate)) ??
    execFileSync('sh', ['-c', 'command -v podman'], {encoding: 'utf8'}).trim()
  );
}

/** Parses the `[major, minor]` of the `X.Y.Z` version reported by the given podman binary. */
function readPodmanVersion(podmanPath: string): [number, number] {
  const output: string = execFileSync(podmanPath, ['--version'], {encoding: 'utf8'});
  const match: RegExpMatchArray | null = output.match(/(\d+)\.(\d+)\.(\d+)/);
  expect(match, `podman --version should report an X.Y.Z version, got: ${output}`).to.not.be.null;
  return [Number(match[1]), Number(match[2])];
}

/**
 * Runs a shell diagnostic command and prints its output with a label prefix. Failures are
 * swallowed so that a broken diagnostic never masks the real test failure.
 */
function runDiagnostic(label: string, command: string, arguments_: string[], timeoutMs: number = 15_000): void {
  console.log(`[podman-validation] === ${label} ===`);
  try {
    const output: string = execFileSync(command, arguments_, {encoding: 'utf8', timeout: timeoutMs});
    console.log(output.trim() || '(no output)');
  } catch (error: unknown) {
    // best-effort diagnostic; swallow failures so the test result is not obscured
    console.log(`(failed: ${error instanceof Error ? error.message : String(error)})`);
  }
}

// eslint-disable-next-line prefer-arrow-callback
describe('BrewPackageManager podman runtime validation', function (this: Mocha.Suite): void {
  before(function (this: Mocha.Context): void {
    if (process.env[SOLO_PODMAN_RUNTIME_VALIDATION] !== 'true') {
      // eslint-disable-next-line unicorn/no-this-outside-of-class
      this.skip();
    }
    resetForTest();
  });

  it('installs podman via Homebrew and runs a container rootfully', async (): Promise<void> => {
    // ── Step 1: Homebrew ────────────────────────────────────────────────────────
    console.log('[podman-validation] checking if Homebrew is available');
    const brewPackageManager: BrewPackageManager = new BrewPackageManager();
    if (await brewPackageManager.isAvailable()) {
      console.log('[podman-validation] Homebrew already available');
    } else {
      console.log('[podman-validation] Homebrew not found — installing');
      expect(await brewPackageManager.install(), 'Homebrew bootstrap should succeed').to.be.true;
      console.log('[podman-validation] Homebrew install complete');
    }

    // ── Step 2: podman via brew ─────────────────────────────────────────────────
    console.log('[podman-validation] running: brew install podman');
    await brewPackageManager.installPackages(['podman']);
    console.log('[podman-validation] brew install podman complete');

    // ── Step 3: verify binary ───────────────────────────────────────────────────
    const podmanPath: string = resolvePodmanPath();
    console.log(`[podman-validation] resolved podman binary: ${podmanPath}`);
    expect(fs.existsSync(podmanPath), `brew install podman should have produced ${podmanPath}`).to.be.true;

    const [major, minor]: [number, number] = readPodmanVersion(podmanPath);
    const [minimumMajor, minimumMinor]: [number, number] = MINIMUM_PODMAN_VERSION;
    console.log(
      `[podman-validation] podman version: ${major}.${minor} (minimum required: ${minimumMajor}.${minimumMinor})`,
    );
    expect(
      major > minimumMajor || (major === minimumMajor && minor >= minimumMinor),
      `podman ${major}.${minor} is older than kind's minimum of ${minimumMajor}.${minimumMinor}`,
    ).to.be.true;

    const podmanDirectory: string = path.dirname(podmanPath);
    // sudo resets PATH; brew's podman is not on root's PATH so it is passed explicitly.
    const sudoEnvironmentPath: string = `PATH=${podmanDirectory}${path.delimiter}${process.env.PATH}`;

    // ── Step 4: kernel / firewall diagnostics ───────────────────────────────────
    // nf_tables refcount: should be near 0 after stopping Docker + nft flush ruleset.
    runDiagnostic('kernel modules — nf_tables / br_netfilter / veth refcounts', 'sh', [
      '-c',
      'lsmod | grep -E "nf_tables|ip_tables|iptable_|nft_compat|br_netfilter|^veth" | sort || echo "(no matching modules)"',
    ]);
    // Tables must be empty — any residual Docker ip/ip6 tables cause netavark to deadlock.
    runDiagnostic('nftables tables (pre-run — must be empty)', 'sudo', ['nft', 'list', 'tables']);
    runDiagnostic('iptables filter chains (pre-run)', 'sudo', ['iptables', '-L', '-n', '--line-numbers']);
    runDiagnostic('iptables nat chains (pre-run)', 'sudo', ['iptables', '-t', 'nat', '-L', '-n']);
    runDiagnostic('sysctl ip_forward + bridge nf-call flags', 'sh', [
      '-c',
      'sysctl net.ipv4.ip_forward; sysctl net.bridge.bridge-nf-call-iptables 2>/dev/null || echo "(br_netfilter not loaded)"; sysctl net.bridge.bridge-nf-call-ip6tables 2>/dev/null || true',
    ]);
    runDiagnostic('/var/lib/containers/storage layout', 'sudo', [
      'find',
      '/var/lib/containers/storage',
      '-maxdepth',
      '2',
      '-ls',
    ]);
    runDiagnostic('/etc/containers/containers.conf (effective)', 'sudo', ['cat', '/etc/containers/containers.conf']);
    runDiagnostic('/root/.config/containers/containers.conf (root user config)', 'sudo', [
      'cat',
      '/root/.config/containers/containers.conf',
    ]);
    runDiagnostic('helper binaries (netavark / aardvark-dns versions)', 'sh', [
      '-c',
      '/opt/podman-helpers/netavark --version 2>&1; /opt/podman-helpers/aardvark-dns --version 2>&1',
    ]);

    // crun: verify which binary podman will actually use. The system crun (typically at
    // /usr/bin/crun or /usr/local/bin/crun) is an older version incompatible with the OCI
    // bundle that brew podman 6.x generates — it hangs inside conmon waiting for a ready
    // signal that the old runtime never sends. The brew crun must be present and selected.
    runDiagnostic('crun binaries (system vs brew — must match containers.conf)', 'sh', [
      '-c',
      [
        'for p in /usr/bin/crun /usr/local/bin/crun /home/linuxbrew/.linuxbrew/bin/crun; do',
        '  if [ -x "$p" ]; then echo "$p: $($p --version 2>&1 | head -n1)"; else echo "$p: not found"; fi;',
        'done;',
        'echo "find brew crun:"; find /home/linuxbrew/.linuxbrew -name "crun" -type f 2>/dev/null || echo "(none)";',
        'echo "root PATH crun:"; sudo env PATH=/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:/usr/bin which crun 2>&1 || echo "(not found)"',
      ].join(' '),
    ]);

    // conmon version: must be compatible with brew podman 6.x. Never appeared in prior diagnostics.
    runDiagnostic('conmon version + cgroup manager + dbus state', 'sh', [
      '-c',
      [
        'echo "conmon:"; /home/linuxbrew/.linuxbrew/bin/conmon --version 2>&1 || echo "(failed)";',
        'echo "cgroup root:"; cat /proc/1/cgroup 2>&1 | head -5;',
        'echo "cgroupfs layout:"; ls /sys/fs/cgroup/ 2>&1 | head -10;',
        'echo "systemd status:"; systemctl is-system-running 2>&1 || true;',
        'echo "dbus socket:"; ls -la /run/dbus/system_bus_socket 2>&1 || echo "(absent)"',
      ].join(' '),
    ]);

    // AppArmor: Ubuntu 24.04 has AppArmor enabled. When seccomp=unconfined is set, podman applies
    // an AppArmor profile during spec generation before launching conmon. If AppArmor enforcement
    // stalls (e.g. kernel module busy or profile missing), podman hangs silently before conmon
    // starts — the last debug line is "No hostname set; container's hostname will default to
    // runtime default". apparmor_profile = "unconfined" in containers.conf bypasses this; this
    // diagnostic confirms AppArmor's state to verify the bypass is effective.
    runDiagnostic('AppArmor status + podman/crun profiles (may explain pre-conmon hang)', 'sh', [
      '-c',
      [
        'echo "aa-status summary:"; sudo aa-status 2>&1 | head -20 || echo "(aa-status unavailable)";',
        'echo "podman AppArmor profile:"; sudo aa-status 2>&1 | grep -E "podman|crun|conmon" || echo "(none matching)";',
        'echo "AppArmor mode:"; cat /sys/kernel/security/apparmor/profiles 2>/dev/null | wc -l || echo "(unavailable)";',
      ].join(' '),
    ]);

    // fuse-overlayfs: the system binary at /usr/local/bin/fuse-overlayfs hangs when mounting
    // container rootfs layers with brew podman 6.x. storage.conf must select native overlay
    // (no mount_program) and the overlay/.has-mount-program marker must be absent so podman
    // does not revert to fuse-overlayfs. Both are set up in the workflow's Normalize step.
    runDiagnostic('fuse-overlayfs binaries + storage.conf + overlay marker', 'sh', [
      '-c',
      [
        'for p in /usr/bin/fuse-overlayfs /usr/local/bin/fuse-overlayfs /home/linuxbrew/.linuxbrew/bin/fuse-overlayfs; do',
        '  if [ -x "$p" ]; then echo "$p: $($p --version 2>&1 | head -n1)"; else echo "$p: not found"; fi;',
        'done;',
        'echo "--- /etc/containers/storage.conf ---"; sudo cat /etc/containers/storage.conf 2>&1 || echo "(absent)";',
        'echo "--- /root/.config/containers/storage.conf ---"; sudo cat /root/.config/containers/storage.conf 2>&1 || echo "(absent)";',
        'echo "--- overlay/.has-mount-program ---"; sudo ls -la /var/lib/containers/storage/overlay/.has-mount-program 2>&1 || echo "(absent — correct)";',
        'echo "--- overlay storage layout ---"; sudo ls -la /var/lib/containers/storage/overlay/ 2>&1 || echo "(absent)"',
      ].join(' '),
    ]);

    // ── Step 5: podman version — fast binary check, no libpod init ─────────────
    // podman info initialises the full libpod runtime (opens db.sql, acquires the
    // runtime SHM lock) and consistently hangs on this runner. Killing it with SIGKILL
    // leaves the SQLite WAL/SHM in a dirty state that deadlocks subsequent podman run
    // invocations. podman version only reads compile-time version constants and never
    // touches the libpod database or locks, so it cannot corrupt state.
    console.log('[podman-validation] running: sudo podman version');
    runDiagnostic('sudo podman version', 'sudo', ['-n', 'env', sudoEnvironmentPath, 'podman', 'version'], 15_000);

    // ── Step 6: podman network ls ────────────────────────────────────────────────
    console.log('[podman-validation] running: sudo podman network ls (30 s timeout)');
    runDiagnostic(
      'sudo podman network ls',
      'sudo',
      ['-n', 'env', sudoEnvironmentPath, 'podman', 'network', 'ls'],
      30_000,
    );

    // Brew crun path: containers.conf points here; if the file is absent podman silently
    // falls back to /usr/local/bin/crun (system crun) which hangs with brew conmon 6.x.
    const brewCrun: string = '/home/linuxbrew/.linuxbrew/bin/crun';

    // ── Step 7: network=none probe with goroutine-dump diagnostic ───────────────
    // Observed behaviour across runs 11–14:
    //   • fd3=cpu.max open even with --cgroups=disabled (cgroupfs manager init)
    //   • fd4=db.sql open (libpod SQLite state DB opened after cgroup manager init)
    //   • All background libpod goroutines idle (shutdown, startWorker, eventForwarder…)
    //   • Goroutine 1 (main) in futex — the only hung goroutine, never conmon-spawning
    //   • tail -150 cuts off goroutine 1 because debug log fills the beginning of the dump
    // This run extracts goroutine 1 directly via grep+sed, adds per-thread wchan via
    // `ps -L`, and captures kernel stacks for any D-state (kernel-blocking) threads.
    console.log('[podman-validation] running network=none + SIGQUIT goroutine-dump diagnostic (45 s)');
    runDiagnostic(
      'sudo podman run --network=none + goroutine-dump (SIGQUIT)',
      'sh',
      [
        '-c',
        [
          `sudo -n env '${sudoEnvironmentPath}' 'GOTRACEBACK=all' podman --log-level=debug run --rm --network=none`,
          '  --security-opt seccomp=unconfined --security-opt apparmor=unconfined',
          `  --cgroups=disabled --runtime=${brewCrun} ${HELLO_IMAGE} >/tmp/podman-probe-out.txt 2>/tmp/podman-probe-err.txt &`,
          'BG_PID=$!;',
          'sleep 12;',
          'POD_PID=$(pgrep -P "$BG_PID" 2>/dev/null | head -1); [ -z "$POD_PID" ] && POD_PID=$BG_PID;',
          'echo "sudo_pid=$BG_PID podman_pid=$POD_PID";',
          'echo "=== open fds ==="; sudo ls -la /proc/$POD_PID/fd 2>/dev/null | tail -20 || echo "(gone)";',
          'echo "=== status ==="; cat /proc/$POD_PID/status 2>/dev/null | grep -E "State|Threads" || true;',
          // Per-thread wait-channel via ps -L: shows whether any thread is D-state (kernel blocking).
          'echo "=== all threads wchan/state ==="; ps -L -o tid,stat,wchan --no-headers -p $POD_PID 2>/dev/null || echo "(ps failed)";',
          // Kernel stack for any D-state thread (D = uninterruptible kernel wait).
          'echo "=== D-state thread kernel stacks ===";',
          "for TID in $(ps -L -o tid,stat --no-headers -p $POD_PID 2>/dev/null | awk '$2~/^D/{print $1}'); do",
          '  echo "--- tid=$TID ---"; sudo cat /proc/$POD_PID/task/$TID/stack 2>/dev/null;',
          'done;',
          // SIGQUIT → Go runtime prints all goroutine stacks to stderr (GOTRACEBACK=all).
          'echo "=== sending SIGQUIT for goroutine dump ===";',
          'sudo kill -QUIT $BG_PID $POD_PID 2>/dev/null;',
          'sleep 3;',
          'sudo kill -KILL $BG_PID $POD_PID 2>/dev/null; wait $BG_PID 2>/dev/null || true;',
          // Goroutine 1 is printed FIRST in the SIGQUIT dump (before all other goroutines).
          // The debug log fills the file, so tail -N misses it. grep+sed extracts it directly.
          // Show 250 lines from goroutine 1 to capture goroutine 1 + any low-ID sibling goroutines.
          'echo "=== goroutine 1 stack (main goroutine) ===";',
          'DUMP_LINE=$(grep -n "^goroutine 1 " /tmp/podman-probe-err.txt 2>/dev/null | tail -1 | cut -d: -f1);',
          'if [ -n "$DUMP_LINE" ]; then',
          '  sed -n "${DUMP_LINE},$((DUMP_LINE+250))p" /tmp/podman-probe-err.txt 2>/dev/null;',
          'else',
          '  echo "(goroutine 1 not found in dump — debug tail)"; tail -80 /tmp/podman-probe-err.txt 2>/dev/null;',
          'fi;',
          'rm -f /tmp/podman-probe-out.txt /tmp/podman-probe-err.txt;',
        ].join(' '),
      ],
      55_000,
    );

    // After the probe, delete the libpod SHM lock file and the SQLite state DB.
    //
    // ROOT CAUSE (confirmed by goroutine 1 stack in run 15):
    //   libpod uses a mmap'd file at /run/libpod/locks containing a pool of POSIX
    //   semaphores protected by a global sem_t allocation mutex. When the probe is
    //   SIGKILL'd while inside allocate_semaphore() (which holds that mutex), the mutex
    //   stays permanently locked — sem_t has no PTHREAD_MUTEX_ROBUST semantics, so the
    //   dead owner is never detected. Every subsequent podman run blocks indefinitely in
    //   libpod/lock/shm._Cfunc_allocate_semaphore() at the sem_wait() inside that C fn.
    //
    //   lock_type = "file" in containers.conf is the primary fix: file locks are
    //   automatically released by the kernel on process death, so no corruption is
    //   possible. The rm below is belt-and-suspenders for any residual SHM.
    //
    // db.sql is also deleted: the probe was SIGQUIT/SIGKILL'd mid-transaction, leaving
    // SQLite WAL state inconsistent. Direct removal is safe — images live in overlay-
    // images/, not db.sql, so no image data is lost.
    runDiagnostic('post-probe cleanup: wipe SHM locks + SQLite DB + overlay mounts', 'sh', [
      '-c',
      [
        'echo "--- /dev/shm before cleanup ---"; ls -la /dev/shm/ 2>/dev/null;',
        'echo "--- /run/libpod/locks before cleanup ---"; ls -la /run/libpod/locks 2>/dev/null || echo "(absent)";',
        'echo "--- overlay mounts ---"; mount | grep overlay || echo "(none)";',
        'sudo umount $(mount | grep " overlay " | awk \'{print $3}\') 2>/dev/null || true;',
        'echo "--- removing libpod SHM lock (belt-and-suspenders; lock_type=file is primary fix) ---";',
        'sudo rm -f /run/libpod/locks 2>/dev/null || true;',
        "sudo find /dev/shm -name 'libpod*' -delete 2>/dev/null || true;",
        'ls -la /run/libpod/locks 2>/dev/null || echo "(SHM lock cleared — correct)";',
        'echo "--- removing stale db.sql + WAL/SHM ---";',
        'sudo rm -f /var/lib/containers/storage/db.sql /var/lib/containers/storage/db.sql-wal /var/lib/containers/storage/db.sql-shm;',
        'ls -la /var/lib/containers/storage/db.* 2>/dev/null || echo "(db files cleared — correct)";',
        'echo "--- removing netavark network config dir (prevents stale iptables config re-read) ---";',
        'sudo rm -rf /var/lib/containers/storage/networks/ /run/containers/networks/ 2>/dev/null || true;',
      ].join(' '),
    ]);

    // ── Step 8: final podman run (--network=none) — validates container execution ──
    // Uses --network=none so networking stack (netavark/nftables) is not exercised here.
    // The kind cluster step that follows this test validates full bridge networking end-to-end.
    // Goroutine dump fired at 20 s if still hung; stderr always printed to aid debugging.
    console.log(
      '[podman-validation] running: sudo timeout --kill-after=10 120 podman run --network=none (with SIGQUIT at 20 s if hung)',
    );
    const step8Shell: string = [
      // Background run; stderr to file for goroutine-dump extraction and error reporting.
      `sudo -n env '${sudoEnvironmentPath}' GOTRACEBACK=all timeout --kill-after=10 120`,
      '  podman --log-level=debug run --rm --network=none',
      '  --security-opt seccomp=unconfined --security-opt apparmor=unconfined',
      `  --cgroups=disabled --runtime=${brewCrun} ${HELLO_IMAGE}`,
      '  >/tmp/s8-stdout.txt 2>/tmp/s8-stderr.txt &',
      'S8_BG=$!;',
      // At 20 s: thread wchan scan + SIGQUIT goroutine dump if still running.
      'sleep 20;',
      'if kill -0 $S8_BG 2>/dev/null; then',
      '  S8_PID=$(pgrep -x podman 2>/dev/null | head -1); [ -z "$S8_PID" ] && S8_PID=$S8_BG;',
      '  echo "[step8-diag] still running at 20 s — podman_pid=$S8_PID";',
      '  echo "[step8-diag] threads:"; ps -L -o tid,stat,wchan --no-headers -p $S8_PID 2>/dev/null;',
      '  echo "[step8-diag] D-state stacks:";',
      "  for TID in $(ps -L -o tid,stat --no-headers -p $S8_PID 2>/dev/null | awk '$2~/^D/{print $1}'); do",
      '    echo "--- tid=$TID ---"; sudo cat /proc/$S8_PID/task/$TID/stack 2>/dev/null;',
      '  done;',
      '  sudo kill -QUIT $S8_BG $S8_PID 2>/dev/null; sleep 3;',
      '  DL=$(grep -n "^goroutine 1 " /tmp/s8-stderr.txt 2>/dev/null | tail -1 | cut -d: -f1);',
      '  if [ -n "$DL" ]; then',
      '    echo "=== step8 goroutine 1 ==="; sed -n "${DL},$((DL+80))p" /tmp/s8-stderr.txt 2>/dev/null;',
      '  else',
      '    echo "=== step8 debug tail ==="; tail -30 /tmp/s8-stderr.txt 2>/dev/null;',
      '  fi;',
      'fi;',
      'wait $S8_BG; S8_EXIT=$?;',
      // Always print stderr so failures are visible regardless of exit code.
      'if [ $S8_EXIT -ne 0 ]; then echo "=== step8 stderr (exit=$S8_EXIT) ==="; cat /tmp/s8-stderr.txt 2>/dev/null; fi;',
      // cat stdout last — execFileSync captures it; we check it for "Podman".
      'cat /tmp/s8-stdout.txt 2>/dev/null;',
      'rm -f /tmp/s8-stdout.txt /tmp/s8-stderr.txt;',
      'exit $S8_EXIT;',
    ].join(' ');
    const output: string = execFileSync('sh', ['-c', step8Shell], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 150_000,
    });
    console.log('[podman-validation] podman run completed successfully');
    expect(output, `${HELLO_IMAGE} should print its greeting`).to.contain('Podman');

    // ── Step 9: bridge-network diagnostic (graceful — does not fail the test) ─────
    // Tests that podman can set up bridge networking (netavark + nftables). The kind
    // cluster step requires this. Failures here are informational only; the assertion
    // above already validated that container execution works.
    runDiagnostic(
      'bridge-network smoke test (podman run without --network=none)',
      'sh',
      [
        '-c',
        [
          `sudo -n env '${sudoEnvironmentPath}' timeout 30 podman run --rm --network=bridge` +
            ' --security-opt seccomp=unconfined --security-opt apparmor=unconfined' +
            ` --cgroups=disabled --runtime=${brewCrun} ${HELLO_IMAGE} 2>&1;`,
          'echo "bridge-network-exit=$?";',
        ].join(' '),
      ],
      35_000,
    );
  });
}).timeout(600_000);
