# macOS Installer: Distribution Mechanism

## 1. Context

Solo ships as the npm package `@hiero-ledger/solo`, which requires Node.js ≥ 22. On macOS it was also
installable via a Homebrew formula; that channel has been dropped, and `HomebrewDeprecationNotifier`
(`src/core/homebrew-deprecation-notifier.ts`) already warns Cellar-installed users ahead of the formula's
end-of-updates date. npm stays as a developer channel. This document decides what the macOS end-user channel
is.

Part of epic [#5714](https://github.com/hiero-ledger/solo/issues/5714). This is the research task for
[#5719](https://github.com/hiero-ledger/solo/issues/5719), feeding
[#5724](https://github.com/hiero-ledger/solo/issues/5724) (build the macOS installer), which also depends on
the SEA build ([#5716](https://github.com/hiero-ledger/solo/issues/5716), done), signing
([#5717](https://github.com/hiero-ledger/solo/issues/5717)), and shared uninstall
([#5721](https://github.com/hiero-ledger/solo/issues/5721)). It supersedes PR
[#5873](https://github.com/hiero-ledger/solo/pull/5873), which evaluated DMG and `.pkg` formats and was
auto-closed as stale before merging.

The Linux design ([`linux-installer-evaluation.md`](linux-installer-evaluation.md), merged via
[#5841](https://github.com/hiero-ledger/solo/pull/5841)) chose a `curl | sh` install script as its primary
channel, plus Solo-owned mechanisms for everything a package lifecycle hook would otherwise do: a first-run
cache warm-up (its §7.1), `solo uninstall` (§7.2), and `solo update` (§7.3). This document applies the same
test to macOS and reaches the same answer. It only specifies what differs on macOS; everything else is
inherited from the Linux design unchanged.

Requirements from the parent epic:

1. No Node.js (or Homebrew, or other dev tooling) prerequisite.
2. Warm the image cache (`solo cache image pull`) around install time.
3. Clean up on removal (Kind clusters, image caches, residual files).
4. Self-upgrade.

## 2. Goals

- Select the macOS distribution mechanism, justified against the requirements above rather than against what
  consumer Mac software typically ships.
- Decide whether macOS reuses the Linux install script or needs its own, and specify the macOS-specific
  deltas either way.
- Scope macOS code signing and notarization to what the chosen mechanism actually requires
  ([#5717](https://github.com/hiero-ledger/solo/issues/5717)).
- Identify macOS-specific constraints on the shared `solo update` and `solo uninstall` mechanisms.

## 3. Non-Goals

- Re-litigating the Homebrew removal.
- Implementing the installer ([#5724](https://github.com/hiero-ledger/solo/issues/5724)).
- The full uninstall flow ([#5721](https://github.com/hiero-ledger/solo/issues/5721)) and self-upgrade design
  ([#5722](https://github.com/hiero-ledger/solo/issues/5722), PR
  [#6104](https://github.com/hiero-ledger/solo/pull/6104)). §7 only lists macOS-specific constraints on them.
- Windows — tracked separately under #5714.

---

## 4. Candidates

|                                | Install script (`curl \| sh`)                                                    | Bare signed `.pkg`                                                                        | DMG containing a signed `.pkg`                               |
| ------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Install**                    | `curl -fsSL https://<install-host>/install.sh \| sh`                             | Double-click → `Installer.app` wizard, or `sudo installer -pkg solo.pkg -target /`        | Mount → double-click the `.pkg` → wizard → eject             |
| **Runs as**                    | The invoking user, in their real `$HOME`                                         | `postinstall` runs as **root**, no TTY                                                    | Same as `.pkg`                                               |
| **Cache warm-up hook**         | None needed — Solo's first-run check (§7.1)                                      | Unsafe in `postinstall` (root, wrong ownership in `~/.solo`, Docker may not be running)   | Same as `.pkg`                                               |
| **Uninstall hook**             | None needed — `solo uninstall` (§7.2)                                            | **None exists** — `pkgutil` only tracks receipts; no removal-time script                  | Same as `.pkg`                                               |
| **Install location**           | `~/.solo/bin/solo`, user-owned — `solo update` needs no `sudo`                   | Root-owned (e.g. `/usr/local/bin`) — `solo update` needs `sudo`                           | Same as `.pkg`                                               |
| **Scriptable (CI, AI agents)** | Yes — one command                                                                | Yes, with `sudo`                                                                          | **No** — mounting and opening a DMG is a GUI flow            |
| **Signing surface**            | Developer ID Application cert for the binary (§6)                                | Application cert for the binary **plus** Developer ID Installer cert; notarize the `.pkg` | All of `.pkg`, plus sign and notarize the DMG                |
| **CI build**                   | None beyond the SEA binaries already on the release, plus the shared script      | `pkgbuild` + `productbuild` + `distribution.xml`                                          | `.pkg` pipeline plus a DMG builder (`create-dmg/create-dmg`) |
| **Shared with Linux**          | Same script, same `SHA256SUMS`/`cosign` manifest, same `solo update`/`uninstall` | Nothing — macOS-only pipeline                                                             | Nothing — macOS-only pipeline                                |
| **Verdict**                    | **Recommended** (§9)                                                             | Ruled out                                                                                 | Ruled out                                                    |

### Why the install script over `.pkg`/DMG

The Linux design's main finding carries over unchanged: a package's lifecycle hooks can't safely do the two
jobs the epic wants from them. A `.pkg` `postinstall` runs as root, so `solo cache image pull` there would
either leave root-owned files in the user's `~/.solo` or populate `/var/root/.solo`. Docker Desktop, which the
pull needs, may not even be running. macOS adds a further gap Linux doesn't have: flat packages have **no
uninstall hook at all**, so the cleanup has to live in `solo uninstall` regardless. Once both jobs live in
Solo, a `.pkg` only places one binary on disk — which the install script does with no installer cert, no
`pkgbuild` pipeline, and no root-owned file for `solo update` to fight.

A DMG adds nothing on top of the `.pkg` except a branded mount window and a second licence gate. It costs a
second signing and notarization step, and it's the one format an agent or CI job can't drive.

Peer evidence points the same way. Among fifteen local-network devtools from other chains (Foundry, Solana /
Agave, Sui, Aptos, NEAR, Stellar, AlgoKit, Flow, and others), none ships a DMG or `.pkg` for macOS. Their
documented macOS default is a shell script or Homebrew. General single-binary CLIs (rustup, Deno, Bun, uv)
use the same script on macOS as on Linux.

Trade-off: no entry in an OS "installed software" view, and some organizations block `curl | sh` on principle.
Both are inherited from the Linux design (its §9) and handled the same way: a documented "download, inspect,
then run" path.

---

## 5. Install Script: Shared, With a Darwin Branch

**One `install.sh` for both platforms, not a macOS fork.** The macOS differences are small detection and
shell-integration branches. Two scripts would double the review and test surface of the one file users pipe
into a shell, and they would drift. Since `/bin/sh` on macOS is bash 3.2 in POSIX mode, the script must stay
strictly POSIX — the Linux design already requires that.

| Step (Linux §5.2) | Linux                                 | macOS delta                                                                                                                                                                                    |
| ----------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detect platform   | `uname -s/-m` + glibc vs. musl        | `uname -s` = `Darwin`; no libc branch. Under Rosetta, `uname -m` reports `x86_64` on Apple Silicon — check `sysctl -n sysctl.proc_translated` and pick the `arm64` binary when it returns `1`. |
| Verify checksum   | `sha256sum -c`                        | `sha256sum` isn't reliably present on macOS; use `shasum -a 256 -c` (ships with macOS). `cosign verify-blob` stays best-effort, as on Linux.                                                   |
| Install location  | `~/.solo/bin/solo`                    | Same. The SEA binary also extracts to `~/.solo/sea-resources/<version>/` on first run (`sea/sea-main.template.cjs`), as on Linux.                                                              |
| `PATH` setup      | Append to the shell's rc file         | zsh is the default shell: append to `~/.zshrc`. bash on macOS starts login shells, which read `~/.bash_profile`, not `~/.bashrc`. Same idempotency rule as Linux.                              |
| Gatekeeper        | n/a                                   | None needed: `curl` doesn't set the `com.apple.quarantine` attribute, so Gatekeeper never assesses the binary. The binary still has to carry a valid signature to run on Apple Silicon (§6).   |
| Homebrew conflict | n/a                                   | If `brew list solo` succeeds, warn that the Cellar copy may shadow `~/.solo/bin/solo` on `PATH` and print `brew uninstall solo` (§8).                                                          |
| First-run notice  | Print the cache warm-up notice inline | Same.                                                                                                                                                                                          |

---

## 6. Signing and Notarization

macOS is the one leg where signing is an OS requirement, not just tamper protection, but it applies to fewer
artifacts than a `.pkg` would.

- **Apple Silicon refuses to run unsigned arm64 code.** An ad-hoc signature satisfies this, and `sea/build.ts`
  already strips the stock Node signature before postject injects the SEA blob and ad-hoc re-signs afterward.
  The install-script channel therefore works today without any Apple certificate. An ad-hoc signature makes
  the binary runnable, not authentic: it carries no Team ID, and anyone can ad-hoc sign a modified binary. On
  this channel, tamper protection comes from `SHA256SUMS` + `cosign` (last bullet), as on Linux.
- **Developer ID signing and notarization are still needed** for every path that sets the quarantine
  attribute: a user downloading the binary from the GitHub Release page in a browser, or an agent fetching it
  through a quarantine-aware tool. Without them, Gatekeeper blocks the first run with no override short of
  `xattr -d`. #5717's macOS scope is therefore one **Developer ID Application** certificate for the binary.
  No Developer ID Installer certificate is needed, since there's no `.pkg`.
- **A bare Mach-O can't carry a stapled ticket.** Notarization is done by submitting the binary in a zip to
  `notarytool`. Gatekeeper then looks the ticket up online the first time a quarantined copy runs. That's
  fine for this channel, but offline first runs of a browser-downloaded binary will fail until the Mac is
  online.
- **Hardened Runtime needs JIT entitlements.** Notarization requires Hardened Runtime, which by default blocks
  the V8 JIT. The Developer ID signature must carry at least `com.apple.security.cs.allow-jit` and
  `com.apple.security.cs.allow-unsigned-executable-memory`. Start from the entitlements set Node.js ships its
  own macOS binaries with, and trim it during #5724. Signing must happen _after_ the postject injection,
  which `sea/build.ts` already orders correctly for the ad-hoc case.
- **`SHA256SUMS` + keyless `cosign`** is shared with Linux (its §6.1) and is the authenticity check on macOS
  too. Developer ID signing adds a second, OS-level check once #5717 lands; it doesn't replace this one.

---

## 7. Lifecycle

### 7.1 Cache warm-up

Same as Linux (§7.1 there): a per-user first-run check inside Solo, independent of install channel. Since the
script runs as the user, it has no hook to defer to and simply prints the notice. The first run must also
handle Docker Desktop not running yet — fail the warm-up softly and retry on a later run, rather than blocking
the command the user actually invoked.

### 7.2 Uninstall

Same shared `solo uninstall` ([#5721](https://github.com/hiero-ledger/solo/issues/5721)). On the
install-script channel it removes `~/.solo/bin/solo`, the `PATH` line it added to `~/.zshrc` or
`~/.bash_profile`, and `~/.solo/sea-resources/`. There's no `pkgutil` receipt to forget and no root-owned
file to remove.

### 7.3 Self-upgrade (`solo update`)

The Linux mechanism applies (§7.3 there; full design in PR
[#6104](https://github.com/hiero-ledger/solo/pull/6104)): download to a temp file in `~/.solo/bin/`, verify,
then `rename()` over the current binary. macOS-specific constraints:

- **Rename; never overwrite in place.** The macOS kernel caches a binary's code signature per vnode. Writing
  new bytes into the existing file (e.g. `cp` over it) makes the next launch die with `Killed: 9` (code
  signature invalid). Renaming a separate file into place creates a new vnode and avoids this. The Linux
  design's rename step is therefore required on macOS, not just preferred.
- **Authenticity comes from `SHA256SUMS` + `cosign`, as on Linux, not from the code signature.** Release
  binaries are ad-hoc signed until Developer ID signing ships (§6). An ad-hoc signature has no Team ID and can
  be produced by anyone, so `codesign` can't tell a genuine binary from a tampered one.
- **`codesign --verify --strict` on the temp file is a launchability check only.** It rejects a binary whose
  signature is broken, which would otherwise die with `Killed: 9` after the swap.
- **Team ID pinning follows Developer ID signing.** Once #5717 lands, if the running binary has a Team ID,
  require the new binary to carry the same one. Before that, there's no Team ID to compare.
- **Architecture**: resolve the download URL with the same Rosetta-aware detection as the script (§5), so an
  x86_64 shell on Apple Silicon doesn't downgrade the user to the Intel binary.
- **Non-interactive safety**: `VersionUpdateNotifier` only shows its banner when stdout is a TTY. The epic's
  "prompt them to upgrade now" must keep that gate. #6104 should also add an env var to switch off the update
  check, for CI and agent determinism; none exists today.

---

## 8. Homebrew Migration

`HomebrewDeprecationNotifier`'s banner currently tells Cellar users to switch to npm
(`brew uninstall solo && npm install -g @hiero-ledger/solo`). Once the install script ships, the macOS banner
should point at the script instead, since npm reintroduces the Node.js prerequisite this epic removes. The
script's Homebrew check (§5) covers users who run it without uninstalling the formula first.

---

## 9. Recommendation

**Use the Linux install script on macOS, extended with a Darwin branch (§5), as the macOS distribution
channel. Don't build a `.pkg` or a DMG.** It meets every epic requirement (§1) via the same Solo-owned
mechanisms Linux uses, shares its release manifest, signing, `solo update`, and `solo uninstall`, and needs
only one Apple certificate.

**Implementation notes for #5724:**

1. Add the Darwin branch to the shared `install.sh` (§5): Rosetta-aware arch detection, `shasum`, zsh/bash rc
   handling, Homebrew-conflict warning. Add a macOS leg (arm64 and x86_64 runners) to the installer-validation
   workflow.
2. Add Developer ID signing with Hardened Runtime entitlements and `notarytool` submission to the macOS SEA
   build (§6), after postject injection. Depends on #5717 provisioning the certificate.
3. Feed §7.3's macOS constraints into #5722 / PR #6104.
4. Point `HomebrewDeprecationNotifier`'s banner at the install script (§8).

### Alternatives ruled out

- **Bare `.pkg`**: its `postinstall` runs as root, it has no uninstall hook, it leaves a root-owned binary
  that `solo update` can't replace without `sudo`, and it needs a second certificate (§4).
- **DMG wrapping a `.pkg`**: all of the `.pkg` costs, plus a second signing and notarization step, and it can't
  be scripted (§4). If a DMG is ever revisited for branding, `create-dmg/create-dmg` was the strongest builder
  evaluated in PR #5873. It accepts non-`.app` payloads and supports layout and EULA options, which
  `sindresorhus/create-dmg` and the unmaintained `appdmg` don't.
- **A separate macOS-only script**: the deltas are too small to justify maintaining a second file that users
  pipe into a shell (§5).

---

## 10. Risks / Open Questions

- **`curl | sh` trust perception** and **no OS "installed software" listing**: inherited from the Linux
  design (its §9), with the same mitigations.
- **Entitlements are unverified for the SEA binary.** The minimum Hardened Runtime set that lets the SEA run
  (including any native addons it loads, which may need `disable-library-validation`) has to be confirmed
  empirically in #5724 before notarization is wired into CI.
- **macOS 26 notarization flakiness**: there are open Apple Developer Forum reports of Gatekeeper
  intermittently rejecting properly notarized downloads
  ([thread](https://developer.apple.com/forums/thread/817887)). The script channel is mostly insulated because
  it doesn't set quarantine, but the browser-download path isn't. Budget time for retries in CI notarization
  checks.
- **Agent sandboxes that block pipe-to-shell** need the "download, inspect, then run" path documented, same as
  Linux.

---

## 11. References

- [Linux installer design](linux-installer-evaluation.md) — install script, first-run warm-up,
  `solo uninstall`, `solo update` (§5–§7)
- [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html) ·
  `sea/build.ts` (ad-hoc re-sign after postject)
- [Apple: Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple: Hardened Runtime](https://developer.apple.com/documentation/security/hardened-runtime)
- [`pkgbuild` man page](https://keith.github.io/xcode-man-pages/pkgbuild.1.html) — ruled-out `.pkg` mechanics
  (§4)
- [`create-dmg/create-dmg`](https://github.com/create-dmg/create-dmg) — ruled-out DMG builder (§9)
- Install-script precedent: rustup, Deno, Bun, uv (same script on macOS and Linux)
- PR [#5873](https://github.com/hiero-ledger/solo/pull/5873) — superseded DMG/`.pkg` evaluation · PR
  [#6104](https://github.com/hiero-ledger/solo/pull/6104) — `solo update` design

---

_Last updated: 2026-10-14 (§6, §7.3: authenticity relies on `SHA256SUMS` + `cosign`; Team ID pinning deferred
until Developer ID signing ships. 2026-10-06: rewritten after Homebrew removal, install script adopted as the
macOS channel, `.pkg` and DMG ruled out; supersedes PR #5873)_
