# macOS Installer: Distribution Mechanism and Tool Selection

## 1. Context

Solo is a CLI tool, currently distributed as the published npm package `@hiero-ledger/solo` and, on macOS, also
installable via a Homebrew formula. The team wants to move away from Homebrew as the macOS distribution channel and
replace it with a native OS installer, while keeping the npm package as-is for developers who prefer it.

The actual requirements driving this work are:

- **Easy installation** of a CLI tool for users who may not have Node.js, Homebrew, or any dev tooling installed.
- **An install hook** that downloads additional data after installation (e.g., pulling container images into the
  local cache via `solo cache image pull`), so the first real `solo` invocation doesn't stall on a large download.
- **An uninstall hook** that cleans up afterward (Kind clusters, image caches, Solo cache/config directories) —
  scoped in detail in [#5721](https://github.com/hiero-ledger/solo/issues/5721).
- **A self-contained binary.** Solo is being built as a Node.js
  [Single Executable Application (SEA)](https://nodejs.org/api/single-executable-applications.html), which bundles
  the Node.js runtime into the binary itself — end users will not need Node.js pre-installed to run it.

[#5714](https://github.com/hiero-ledger/solo/issues/5714) tracks this OS-installer work across macOS, Windows, and
Linux. This document is the research/design task for
[#5719](https://github.com/hiero-ledger/solo/issues/5719) (macOS specifically) and feeds
[#5724](https://github.com/hiero-ledger/solo/issues/5724) (build the macOS installer), which also depends on the SEA
build pipeline ([#5716](https://github.com/hiero-ledger/solo/issues/5716)), signing infrastructure
([#5717](https://github.com/hiero-ledger/solo/issues/5717)), and the shared uninstall design
([#5721](https://github.com/hiero-ledger/solo/issues/5721)).

The original issue framed this as "evaluate DMG builder tools." Framed against the actual requirements above, that
is one layer too low: the first question is *which artifact* to distribute on macOS (a DMG, a bare `.pkg`, or a DMG
containing a `.pkg`) — the DMG-tool comparison only matters if a DMG is part of the answer. This document addresses
both layers.

## 2. Goals

- Compare macOS distribution mechanisms (DMG-wrapped `.pkg` vs. a bare `.pkg`) against the actual install/uninstall
  hook requirements, without assuming a DMG is required.
- If a DMG is used, select an open-source DMG builder tool suitable for packaging a bare CLI artifact.
- Define how the install hook (downloading additional data, e.g. `solo cache image pull`) is wired, given that
  neither a plain DMG nor a bare binary has a native "run this after copying" mechanism.
- Note what a native installer must replicate that Homebrew Cask currently provides for free (see §5.4), so nothing
  is silently lost in the migration.

## 3. Non-Goals

- Re-litigating the decision to move away from Homebrew — that is treated as settled by the team; this document
  covers what replaces it, not whether to replace it.
- Implementing the installer build ([#5724](https://github.com/hiero-ledger/solo/issues/5724)).
- Designing the full uninstall flow ([#5721](https://github.com/hiero-ledger/solo/issues/5721)) — this document only
  notes where the distribution-mechanism choice constrains that design.
- Code-signing/notarization CI wiring ([#5717](https://github.com/hiero-ledger/solo/issues/5717)) — covered here
  only to the extent it constrains tool/mechanism choice.
- Windows (NSIS) or Linux (makeself-style) installers — tracked separately under #5714. The underlying
  install/uninstall-hook requirement is cross-platform, but the mechanism is OS-specific; this document is
  macOS-only.
- Designing the self-upgrade flow ([#5722](https://github.com/hiero-ledger/solo/issues/5722)) — §9 captures research
  findings only, as background for that design task; it is not a substitute for it.

## 4. Why a Plain Drag-and-Drop DMG Doesn't Meet the Requirement

A drag-and-drop `.dmg` (the pattern used by most consumer Mac apps — Chrome, Slack) is a mounted read-only volume
containing an app icon and a symlink to `/Applications`. The user drags the icon onto the symlink; Finder performs a
plain file copy. **Nothing executes automatically when that copy finishes.** There is no DMG-level equivalent of a
Windows NSIS `postInstall` section, and no uninstall hook either — ejecting the DMG doesn't remove anything, and
there was never an installer process to register an uninstaller with in the first place.

Since Solo's actual requirement is an install *hook* (pull data) and an uninstall *hook* (clean up), a bare
drag-and-drop DMG is disqualified regardless of which DMG tool is used. The only macOS-native artifact with a real
install script hook is a `.pkg`, built with `pkgbuild` and (for multi-component installs) composed with
`productbuild`:

- `pkgbuild --scripts <dir> ...` picks up `preinstall`/`postinstall` scripts from the scripts directory by name and
  runs them around the payload write.
- `productbuild` composes one or more `pkgbuild` component packages plus a `distribution.xml` into a signed product
  archive, and `distribution.xml` can also declare a `<license file="..."/>` element that `Installer.app` shows as
  its own wizard page — independent of any DMG-level license gate.
- Apple's App Store/TestFlight submission path disallows install scripts; that restriction doesn't apply to direct,
  notarized distribution, which is what Solo needs.

This means every viable option below is built around a `.pkg`. The open question is only whether that `.pkg` is
wrapped in a DMG or downloaded directly.

## 5. Distribution Mechanism: DMG-Wrapped `.pkg` vs. Bare `.pkg`

### 5.1 Option A — DMG containing a signed `.pkg`

The DMG is the distributable artifact (custom background, icon layout, and its own mount-time license/EULA gate);
double-clicking the `.pkg` inside it launches the real installer.

- **User flow:** download `.dmg` → double-click to mount → (optional DMG-level license gate) → double-click the
  `.pkg` shown in the window → follow `Installer.app`'s wizard → eject the DMG afterward.
- **Precedent:** the classic pattern for GUI `.app` distribution (Docker Desktop, most consumer Mac software), though
  those typically drop an `.app` in the window rather than a `.pkg`.
- **Adds:** a branded first-touch surface (background image, custom layout) before the user even reaches the
  installer, and a mount-time license gate independent of the installer's own.
- **Costs:** an extra step (mount → eject) around the actual installer, a second, largely redundant license
  gate (DMG-level `SLAResources` *and* `productbuild`'s `distribution.xml` license page), and a second toolchain
  dependency (a DMG builder, see §6) alongside `pkgbuild`/`productbuild`.

### 5.2 Option B — Bare signed `.pkg` (no DMG)

The `.pkg` itself is the downloadable artifact — no disk image at all.

- **User flow:** download `.pkg` (e.g. from a GitHub Release asset) → double-click → follow `Installer.app`'s
  wizard, which shows the license page from `distribution.xml` directly → done.
- **Precedent:** this is what comparable CLI tools actually ship. **AWS CLI v2** distributes `AWSCLIV2.pkg` directly.
  **GitHub's own `gh` CLI** offers a `.pkg` as a direct-download alternative to Homebrew. **Node.js itself** installs
  via a `.pkg` on macOS. None of these wrap the `.pkg` in a DMG.
- **Adds:** one fewer artifact, one fewer license gate, no DMG toolchain dependency, and a download experience that
  matches how developer-facing CLI tools are normally shipped.
- **Costs:** no custom background/icon-layout branding surface — the user only ever sees `Installer.app`'s standard
  (Apple-styled) wizard, not a Solo-branded window.

### 5.3 Comparison

| Aspect | A: DMG-wrapped `.pkg` | B: Bare `.pkg` |
|---|---|---|
| Install/uninstall hooks | Via the `.pkg` (identical either way — see §7.2/§7.3) | Via the `.pkg` (identical) |
| Extra user steps | Mount, locate `.pkg` in window, eject after | None beyond running the installer |
| Branding surface | Custom background image + icon layout at mount time | None — standard `Installer.app` chrome only |
| License screens | Two: DMG mount-time gate + installer's own page (redundant) | One: installer's own page |
| Toolchain dependencies | DMG builder (§6) + `pkgbuild`/`productbuild` | `pkgbuild`/`productbuild` only |
| Signing/notarization surface | Both the DMG and the `.pkg` must be signed/notarized separately | Only the `.pkg` needs signing/notarization |
| Direct precedent for CLI tools | Uncommon for CLI-only tools; common for GUI `.app`s | AWS CLI v2, `gh`, Node.js |

Both options satisfy the install/uninstall hook requirement equally well, since both rely on the same `.pkg`
mechanics (§7). The difference is purely about branding surface vs. simplicity/precedent. **This document does not
resolve the choice** — it is flagged as an open decision for #5724, informed by whether the team values the branded
first-touch experience enough to justify the extra artifact, toolchain, and signing surface.

### 5.4 What Homebrew Currently Provides That a Native Installer Must Replicate

Homebrew Cask is not deficient at the specific capability being requested — it already supports both hooks
declaratively:

- A `postflight` block runs arbitrary Ruby/shell logic after install (where `solo cache image pull` could already be
  wired today).
- An `uninstall` stanza declares cleanup actions (`pkgutil`, `script`, `delete`, `launchctl`, etc.) run on
  `brew uninstall`.
- A `zap` stanza declares more thorough cleanup (caches, logs, preferences) run only on `brew uninstall --zap`.

## 6. DMG Tool Selection (Applies Only If Option A Is Chosen)

If Option A (§5.1) is selected, the DMG itself still needs a builder tool. This section evaluates that choice; it is
moot if Option B is selected.

| Tool | Maintenance | Install | Background image | Icon/window layout | License screen | Bare artifact (non-`.app`) | Verdict |
|---|---|---|---|---|---|---|---|
| [`sindresorhus/create-dmg`](https://github.com/sindresorhus/create-dmg) (npm `create-dmg`) | Active (v8.1.0, 2026-03) | `npm i -g create-dmg` | Fixed, not customizable | Fixed, not customizable | Yes, auto-detected from `license.txt`/`license.rtf` | No — requires a `.app` bundle (reads `Info.plist`) | Rejected: no layout control, wrong input shape |
| [`create-dmg/create-dmg`](https://github.com/create-dmg/create-dmg) (formerly `andreyvit/create-dmg`; Homebrew) | Active (v1.3.0, 2026-07) | `brew install create-dmg` | Configurable (PNG/GIF/JPG) | Configurable (per-icon position/size, window size/position) | Yes, via `--eula` | Yes — accepts any file/folder, including a `.pkg` | **Selected, if Option A is chosen** |
| [`appdmg`](https://github.com/LinusU/node-appdmg) (npm, aka `node-appdmg`) | Stale — last release 2023-02, 56 open issues | `npm i -g appdmg` | Configurable via JSON spec | Configurable via JSON spec | No documented support | Yes | Rejected: unmaintained, no license-screen support |
| `electron-builder`'s `dmg-builder` | Active, but Electron-specific | N/A (not standalone) | Configurable | Configurable | Configurable (`license` key) | No — Electron-only | Reference only; confirms this feature set is achievable via `hdiutil` |
| Raw `hdiutil` + AppleScript | N/A (Apple-native) | Pre-installed | Fully manual | Fully manual | Manual (`SLAResources`) | Yes | Rejected as primary tool: `create-dmg/create-dmg` already wraps this correctly and maintains it |

Note the naming collision: the issue's reference to `create-dmg` most likely means the Homebrew/Bash tool
(`create-dmg/create-dmg`, formerly `andreyvit/create-dmg`), not the unrelated npm package by Sindre Sorhus of the
same name. They share no code. Both wrap `hdiutil`/AppleScript independently.

### Why not `appdmg`

`appdmg` has had no commits or releases since early 2023 and carries 56 open issues. It has no license-screen
support at all. Its APFS support was only added in its final 2023 release, so compatibility with current macOS
toolchains and Apple Silicon CI runners is unverified — a stale dependency here is a liability that
`create-dmg/create-dmg`'s active maintenance avoids.

### Why not `sindresorhus/create-dmg`

It is well-maintained but intentionally non-configurable — no background image, no icon positioning — and it
expects a `.app` bundle as input (it reads the bundle's `Info.plist` for name/version and icon). Solo's SEA-derived
`.pkg` is not a bundle, so this tool would require an unnecessary synthetic-`.app` wrapping step.

## 7. Shared Design (Applies to Either Option)

### 7.1 Layout and License (Option A only)

If Option A is chosen, the DMG is built with `create-dmg/create-dmg` (Homebrew-installed in CI) against a build
directory containing the signed `.pkg` (see §7.2), with no `/Applications` symlink (not applicable — there's no
`.app`):

```bash
create-dmg \
  --volname "Solo Installer" \
  --background "assets/dmg-background.png" \
  --window-size 660 400 \
  --icon-size 128 \
  --icon "Solo.pkg" 330 200 \
  --eula "LICENSE.rtf" \
  --hide-extension "Solo.pkg" \
  "dist/Solo-Installer.dmg" \
  "build/dmg-root/"
```

`--eula <path>` embeds an `SLAResources`-style agreement: the volume won't mount until the user clicks "Agree." This
runs once, at DMG-mount time, before the `.pkg` is even reachable — separate from (and, per §5.3, redundant with) the
installer's own license page.

If Option B is chosen, there is no DMG-level layout or license gate at all; the only license screen is the one
`productbuild`'s `distribution.xml` `<license file="LICENSE.rtf"/>` element renders inside `Installer.app`.

### 7.2 Install Hook Wiring

Identical for both options, since it lives entirely in the `.pkg`:

1. `pkgbuild` packages the SEA binary (installed to, e.g., `/usr/local/bin/solo` or a versioned
   `/usr/local/lib/solo/<version>/solo` with a symlink) together with a `--scripts build/pkg-scripts/` directory
   containing a `postinstall` executable script.
2. The `postinstall` script invokes the just-installed binary to pull the additional data, e.g.
   `/usr/local/bin/solo cache image pull` (exact command/flags finalized in #5724; should be non-interactive and log
   to the standard Solo log location so failures are diagnosable without blocking install completion).
3. `productbuild` composes the component `.pkg`(s) plus a `distribution.xml` (which also carries the license page,
   per §7.1) into the final installer package.
4. The resulting `.pkg` is signed with the **Developer ID Installer** certificate (distinct from the **Developer ID
   Application** certificate used for the binary itself — both come from #5717) and notarized via `notarytool`, with
   the ticket stapled via `stapler`.
5. **Option A only:** the signed, notarized `.pkg` is placed into the `create-dmg` build root, and the DMG is built
   and separately signed/notarized as a `Developer ID Application`-signed disk image. **Option B:** the signed,
   notarized `.pkg` is the final release asset — no further packaging step.

### 7.3 Uninstall Hook Interaction

**macOS has no native pre/post-uninstall hook**, for either option — `pkgbuild`/`productbuild`/`/usr/sbin/installer`
only support `preinstall`/`postinstall` scripts. If a package with the same identifier is installed again, those same
scripts run once more (so they double as pre/post-*upgrade* hooks), but there is no removal-time counterpart: flat
`.pkg` installs have no built-in "uninstall" action at all. This is the exact capability Homebrew Cask's `uninstall`
and `zap` stanzas gave for free (§5.4) and that a native `.pkg` must reimplement manually. `pkgutil` only tracks a
receipt of what was installed:

- `pkgutil --pkgs` lists installed package identifiers.
- `pkgutil --files <package-id>` lists the files a given package wrote.
- `pkgutil --forget <package-id>` deletes the receipt.

None of these delete files, unload LaunchAgents, or run any script — they are bookkeeping only. Anything the
`postinstall` script registers (e.g., a LaunchAgent for the self-upgrade check in #5714) has to be torn down
explicitly by whatever performs the uninstall.

This is why uninstall behavior is scoped as its own design task
([#5721](https://github.com/hiero-ledger/solo/issues/5721)): Solo must supply its own uninstall path, most naturally
a `solo uninstall` CLI subcommand (rather than a separate script/app dropped alongside the binary, since Solo is
already the CLI users would reach for) that:

1. Reads `pkgutil --files <solo-pkg-id>` to enumerate installed files instead of hardcoding paths.
2. Deletes any Kind clusters, image caches, and Solo cache directories per the #5721 design.
3. Unloads/removes any LaunchAgent registered during install (`launchctl bootout`, then delete the plist).
4. Removes the enumerated files and finishes with `pkgutil --forget <solo-pkg-id>` to clear the receipt.

Third-party GUI packaging tools (e.g., Whitebox Packages, or Jamf in MDM-managed environments) sometimes layer a
"post-removal" convention on top of `pkgbuild` output, but this is not part of Apple's native format and would add a
tooling dependency the `solo uninstall` subcommand approach doesn't need. This is called out here only because it
depends on the `.pkg`-based approach chosen in §5; the full uninstall behavior itself is designed in #5721.

## 8. Risks / Open Questions

- **Distribution mechanism is not resolved here (§5).** Per stakeholder direction, this document presents Option A
  and Option B side by side rather than picking one; #5724 (or a follow-up decision) needs to close this before
  implementation.
- **Reason for moving off Homebrew is not confirmed (§5.4).** Homebrew Cask already provides both requested hooks
  declaratively; worth confirming the actual motivation (no Homebrew dependency for end users, cross-platform
  installer parity, or distribution control) since it doesn't change *this* design but may affect whether the
  Homebrew formula/cask is deprecated immediately or kept as a parallel channel during a transition period.
- **macOS 26 (Tahoe) notarization flakiness:** there are open Apple Developer Forum reports of `spctl --type install`
  intermittently rejecting properly signed/notarized `.pkg` files downloaded from the internet
  ([forum thread](https://developer.apple.com/forums/thread/817887)). Not yet resolved upstream; #5724 should budget
  time for retry logic / Apple support escalation if CI notarization checks flake.
- **Binary install location:** whether the SEA binary should install to `/usr/local/bin` directly or to a versioned
  path with a symlink (to support the self-upgrade goal in #5714) is deferred to #5724, since it affects the
  `pkgbuild` component layout but not the mechanism or tool choice.
- **CI headless AppleScript step (Option A only):** `create-dmg/create-dmg` (like all `hdiutil`/AppleScript-based
  tools) needs a logged-in GUI session to set Finder window/icon layout. GitHub Actions macOS runners provide this,
  so it works today, but it's a soft dependency on the runner image worth re-verifying at implementation time; the
  tool's `--skip-jenkins`/`--sandbox-safe` flags exist for CI accommodation.

## 9. Related: Self-Upgrade Mechanism Research (#5722)

The parent goal in #5714 includes self-upgrade ("inform the user there is a new version and prompt them if they
would like to install it/upgrade now"), designed separately in
[#5722](https://github.com/hiero-ledger/solo/issues/5722). It is captured here only because the `.pkg`-based install
in §7.2 and the versioned-binary-location question in §8 both constrain it. This section is research background, not
the design itself.

**Version-check strategy.** Unauthenticated GitHub REST calls are capped at 60 requests/hour per IP — easily
exhausted for a widely-used CLI shared behind a NAT or CI runner, so relying on `ETag`/`If-None-Match` alone is not
enough (conditional requests only reliably avoid the rate-limit cost when authenticated). The observed real-world
pattern (`update-notifier`, and GitHub's own `gh` CLI) is a background check on a ~24h cadence, with the last-check
timestamp cached locally, and the check never blocking the current invocation.

**UX.** `update-notifier` (the standard npm library for this, used historically by npm and Yeoman) is stale — no
release in ~2 years, flagged as an unhealthy release cadence by dependency-health scanners despite having listed
maintainers. It also only *notifies*; it has no binary-replacement capability. Modern practice favors a silent
background check plus a terse one-line notice on the next invocation, never an interactive blocking prompt, with an
easy opt-out.

**Atomic binary replacement.** On POSIX (macOS/Linux), `rename()` over a running executable's file is safe — the
kernel keeps the old inode alive via the running process's open reference until it exits, so the standard pattern is
"download to a temp file on the same filesystem, then `rename()` over the target." On Windows, a running `.exe`'s
file is locked but can still be *renamed*; the standard workaround (implemented by Rust's `self-replace` crate, used
by `rustup self update`) is: rename the current exe aside (e.g. `.old`), move the new binary into place, then have a
helper process delete the `.old` file (via `FILE_FLAG_DELETE_ON_CLOSE`) after the parent exits. Deno's `deno upgrade`
follows the same shape, adding binary diffing and a `.old.exe` rename step on Windows. Bun's `bun upgrade` overwrites
its own binary directly but explicitly defers to the OS package manager for package-manager-installed copies.
Notably, **GitHub's own `gh` CLI does not self-update at all** — it only checks and notifies, deferring upgrades
entirely to Homebrew/WinGet/Scoop/Chocolatey. No mature generic Node.js library exists for the actual binary-swap
step (only for the notification half).

**Integrity verification.** Rigor varies across the precedents: rustup trusts HTTPS transport only (PGP/TUF support
exists but is warn-only, not enforced); Deno verifies SHA-256 on every downloaded artifact and supports an explicit
checksum-pinning flag; the Rust `self_update` crate verifies GitHub's auto-published SHA256 digests by default;
Electron's Squirrel-based updaters go furthest, re-validating both checksum and code signature before installing.
Given Solo's SEA binaries will already be signed/notarized (per #5717), re-verifying the downloaded binary's
signature before swap — not just a checksum — is the strongest option available and worth carrying into #5722.

**Rollback.** The consistent pattern across all of the above: never touch the currently-running binary until the new
one is fully downloaded and verified, and keep the old binary recoverable (renamed aside, not deleted) until the new
one is confirmed to launch successfully; only clean up the old copy after that confirmation.

## 10. References

- [`create-dmg/create-dmg`](https://github.com/create-dmg/create-dmg)
- [`sindresorhus/create-dmg`](https://github.com/sindresorhus/create-dmg)
- [`LinusU/node-appdmg`](https://github.com/LinusU/node-appdmg)
- [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html)
- [`pkgbuild` man page](https://keith.github.io/xcode-man-pages/pkgbuild.1.html)
- [Building simple packages with scripts (scriptingosx.com)](https://scriptingosx.com/2019/01/build-simple-packages-with-scripts/)
- [Apple: Notarizing macOS software before distribution](https://developer.apple.com/macos/distribution/)
- [`electron-builder` DMG options](https://www.electron.build/dmg.html) (reference only)
- [AWS CLI v2 macOS installation (`AWSCLIV2.pkg`)](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [GitHub CLI macOS installation options](https://github.com/cli/cli/blob/trunk/docs/install_linux.md)
- [Homebrew Cask Cookbook — `uninstall`/`zap` stanzas](https://docs.brew.sh/Cask-Cookbook)
- [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) (§9)
- [`update-notifier` (npm)](https://www.npmjs.com/package/update-notifier) (§9)
- [`self-replace` crate (Rust, used by rustup)](https://github.com/mitsuhiko/self-replace) (§9)
- [`self_update` crate (Rust)](https://crates.io/crates/self_update) (§9)
- [Deno upgrade system (DeepWiki)](https://deepwiki.com/denoland/deno/2.8-upgrade-system) (§9)
- [`electron-builder` auto-update docs](https://www.electron.build/docs/features/auto-update/) (§9)
