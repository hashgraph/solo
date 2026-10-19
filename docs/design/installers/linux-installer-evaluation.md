# Linux Installer: Packaging Format and Tool Selection

## 1. Context

Solo currently ships only as the npm package `@hiero-ledger/solo`, which requires Node.js ≥ 22.
Homebrew on Linux (Linuxbrew) is already covered by `HomebrewDeprecationNotifier`'s prefix-agnostic
`HOMEBREW_CELLAR_PATTERN` — nothing Linux-specific needed there. npm stays as a developer channel,
matching the macOS document's decision.

Part of epic [#5714](https://github.com/hiero-ledger/solo/issues/5714) (native OS installers, no
runtime pre-install required). This is the research task for
[#5720](https://github.com/hiero-ledger/solo/issues/5720), feeding
[#5725](https://github.com/hiero-ledger/solo/issues/5725) (build the installer), which also
depends on the SEA build ([#5716](https://github.com/hiero-ledger/solo/issues/5716)), signing
([#5717](https://github.com/hiero-ledger/solo/issues/5717)), and shared uninstall
([#5721](https://github.com/hiero-ledger/solo/issues/5721)).

Requirements from the parent epic:

1. Warm the image cache (`solo cache image pull`) around install time.
2. Clean up on removal (Kind clusters, image caches, residual files) — scoped in
   [#5721](https://github.com/hiero-ledger/solo/issues/5721).
3. Generate as a CI release artifact without excessive pipeline complexity.

Requirement 1 is the *outcome* (cache warmed near install), not "call it from `postinst`" — that
specific mechanism is unsafe (§7.1).

### Distribution target matrix

From `.github/workflows/flow-install-validation.yaml`:

| Distribution  | Image tested |
|---------------|--------------|
| Ubuntu        | 24.04        |
| Debian        | 12           |
| Fedora        | 44           |
| Rocky Linux   | 9            |
| AlmaLinux     | 9            |
| Oracle Linux  | 9            |
| openSUSE Leap | 16.0         |
| Arch Linux    | latest       |
| Alpine        | 3.21         |

Alpine runs musl libc and needs its own SEA build — the glibc binary can't execute there
(`flow-install-validation.yaml:92`).

---

## 2. Goals

- Select an install mechanism, justified on install/uninstall UX, CI complexity, and distribution
  breadth ([#5720](https://github.com/hiero-ledger/solo/issues/5720)).
- Define an install layout consistent with how the SEA build
  ([#5810](https://github.com/hiero-ledger/solo/pull/5810)) resolves runtime resources.
- Redesign the cache-warm-up requirement around something that doesn't depend on a package
  manager's root/no-TTY/sometimes-no-network lifecycle-script constraints.
- Scope signing to only what the chosen mechanism actually needs
  ([#5717](https://github.com/hiero-ledger/solo/issues/5717)).

## 3. Non-Goals

- **Uninstall behavior** — designed once, shared across OSes, in
  [#5721](https://github.com/hiero-ledger/solo/issues/5721); this doc only says where Linux hooks
  into it (§7.2).
- **Self-upgrade flow** — [#5722](https://github.com/hiero-ledger/solo/issues/5722). §7.3 sketches
  the install-script mechanism as input to that design, not a final one.
- **macOS/Windows installers** — tracked under #5714.
- **musl-linked SEA binary and arm64 build** — prerequisites owned by
  [#5716](https://github.com/hiero-ledger/solo/issues/5716)/#5810 and a future arm64 leg. Once they
  land, §8's recommendation covers Alpine/arm64 the same way as every other target, no design
  change needed.
- **Publishing to the AUR** — a separately-maintained, community-reviewed channel, not something a
  CI pipeline outputs. Worth its own issue if wanted.

---

## 4. Candidates

|                                    | makeself                                                     | AppImage                                                                                    | .deb/.rpm (separate)                                                  | nfpm / FPM (multi-format)                                           | Install script (`curl \| sh`)                                                                                                             |
|------------------------------------|--------------------------------------------------------------|---------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| **What it is**                     | Self-extracting shell archive (`.run`)                       | Portable squashfs + runtime, no install step                                                | Native packages per distro family                                     | One declarative source → `deb`/`rpm`/`apk`/`archlinux`              | POSIX shell script that detects OS/libc/arch, downloads the matching SEA binary from GitHub Releases, verifies it, and drops it on `PATH` |
| **Install**                        | `sudo ./solo.run`                                            | `./solo.AppImage`                                                                           | `apt install ./solo.deb` / `dnf install ./solo.rpm`                   | Same as .deb/.rpm                                                   | `curl -fsSL https://<install-host>/install.sh \| sh`                                                                                      |
| **Post-install / uninstall hooks** | Yes (setup script)                                           | **No**                                                                                      | Yes (`postinst`/`prerm`)                                              | Yes (`postinstall`/`preremove`)                                     | **None needed** — runs synchronously as the invoking user, so there's no root/no-TTY/wrong-`$HOME` boundary to design around (§7)         |
| **Package manager integration**    | None                                                         | None                                                                                        | Full                                                                  | Full (with hosted repo)                                             | None                                                                                                                                      |
| **CI build complexity**            | Very low (shell + tar)                                       | Low–medium (`appimagetool`, no cross-build)                                                 | High — two independent pipelines (`dpkg-deb`/`debhelper`, `rpmbuild`) | Low — single static binary (nfpm) or Ruby gem + `rpmbuild` (FPM)    | Very low — one script plus the raw SEA binaries already attached to the GitHub Release; no packaging step                                 |
| **Distro coverage**                | All non-Alpine (glibc/x64-bound)                             | 8/9, glibc only, no Alpine                                                                  | 7/9 (no Arch, no Alpine)                                              | 9/9 reachable; `apk` ships once musl SEA binary exists              | 9/9 — no packaging format to be excluded from; limited only by which SEA binaries exist                                                   |
| **Upgrade path**                   | Re-run new `.run`                                            | Delta patch via AppImageUpdate — can't re-run post-install hook                             | `apt upgrade`/`dnf upgrade` w/ hosted repo; manual otherwise          | Same as .deb/.rpm                                                   | `solo update` self-replaces the binary in place (§7.3)                                                                                    |
| **Verdict**                        | Documented fallback (no-sudo path), superseded by the script | **Ruled out** — no lifecycle hooks, can't satisfy either requirement without a wrapper tool | Two pipelines for the coverage nfpm gets from one                     | Solid secondary channel if repo-based installs are ever needed (§8) | **Recommended primary channel** (§8)                                                                                                      |

### Why the install script over native packages

The two epic requirements — warm the cache, clean up on removal — don't need a package manager at
all: §7 shows that `postinst`/`preremove` can't safely do either one (root, no TTY, sometimes no
network, wrong `$HOME`), so the real logic already has to live in Solo itself — a first-run check
and a `solo uninstall` subcommand. A package's lifecycle hooks end up doing nothing more than
printing a notice and invoking that subcommand — thin payoff for four repo formats' worth of
hosting and signing infrastructure (§6).

An install script gets the same outcome for a fraction of the cost, because it runs as the
installing user by construction:

- No repository hosting or per-format signing (§6) — a checksum manifest, keyless-signed via
  `cosign` (§6.1), is enough.
- No dependency on the musl/arm64 SEA legs landing before Alpine/Arch users are covered (§3) — it
  serves whichever binary exists for the detected `(os, libc, arch)` triple.
- One uniform upgrade command (`solo update`, §7.3) instead of five different package-manager verbs.
- Direct precedent: `rustup`, Deno, Bun, uv, and the OpenAI Codex CLI all ship single, no-system-
  dependency binaries this exact way.

Trade-off: no `apt`/`dnf`/`pacman` search-and-install, no passive `apt upgrade`-style updates
without `solo update` running, and some organizations flag `curl | sh` on principle (§9). None of
that is in the epic's actual requirements — it's what a *hosted repository* adds on top, which
nfpm-built packages remain available to provide later, as a secondary channel, if there's real
demand for it (§8). **nfpm over FPM**, if that channel is ever built: a single static Go binary
with 17 open issues vs. FPM's Ruby+`rpmbuild` dependency and 791, and first-class `apk`/`archlinux`
support.

---

## 5. Install Layout

### 5.1 What ships in the payload

Per [#5810](https://github.com/hiero-ledger/solo/pull/5810), there is **no `resources/` directory
to package** — `sea/build.ts` embeds everything as SEA assets baked into the binary, and
`sea/sea-main.template.cjs` extracts them to `~/.solo/sea-resources/<version>/` at first run,
per-user. This is exactly why a root `postinst` can't do the cache warm-up or uninstall cleanup
(§7.1/§7.2) — it runs in the wrong user's `$HOME`.

### 5.2 Install script layout (primary)

The install script should **not** target `/usr/bin` or `/usr/local/bin` by default:

```
~/.solo/bin/solo    # the SEA binary; ~/.solo/bin added to PATH via the shell's rc file
```

A per-user location is what makes `solo update` (§7.3) work without `sudo` — the invoking user
already owns every byte from the binary up to `$HOME`. Landing in `/usr/bin` would reintroduce the
same root-owned-file problem §7.1/§7.2 exist to avoid, just moved into the script. This mirrors
rustup's (`~/.cargo/bin`) and Deno's (`~/.deno/bin`) default, non-`sudo` location.

The script: (1) detects `(os, libc, arch)` — `uname`, plus `ldd --version`/`/etc/os-release` to
distinguish glibc from musl; (2) downloads the matching SEA binary and checksum manifest from the
GitHub Release (§6.1); (3) verifies the checksum/signature before executing anything downloaded;
(4) writes it to `~/.solo/bin/solo`, `chmod +x`, appends `~/.solo/bin` to `PATH` idempotently;
(5) prints the first-run cache-warm-up notice (§7.1) inline, since there's no `postinst`-equivalent
hook to defer it to.

A `--prefix`/`SOLO_INSTALL_DIR` override should exist for a system-wide, `sudo`-run install to
`/usr/bin` — accepting that `solo update` then needs elevated privileges for that install only.

### 5.3 Native package layout (deferred)

If the nfpm secondary channel (§8) is ever built: `/usr/bin/solo` directly is the FHS-compliant
target — `/usr/local` is reserved for the local admin and `lintian`/`rpmlint` flag it there; no
`resources/` tree to place, same as §5.1. Limited to `x86_64`/glibc until the musl/arm64 SEA legs
land (§3). makeself (`sudo ./solo.run` + a bundled `uninstall.sh`) is a documented no-sudo
fallback if that infrastructure proves too heavy, but the install script already gets the same
no-`sudo` outcome with more familiar UX, so it isn't carried forward as a parallel design.

---

## 6. Integrity and Signing

### 6.1 Install script (primary) — keyless signing, no key custody

Linux has no OS-level gate requiring a binary or script to be signed to execute, unlike the
macOS/Windows legs of this epic — so signing here defends against a compromised release-hosting
step, not an OS requirement. TLS on `curl -fsSL https://.../install.sh | sh` already gives
transport integrity; a checksum/signature on top guards against tampering *after* CI publishes,
not a compromised build pipeline (which would just sign its own malicious binary).

CI publishes, alongside every SEA binary on the GitHub Release:

- A `SHA256SUMS` manifest covering every platform's binary.
- A **keyless `cosign`/sigstore signature** over that manifest, bound to the GitHub Actions
  workflow's OIDC identity and logged to the public Rekor transparency log — no key to generate,
  rotate, or protect, so nothing for [#5717](https://github.com/hiero-ledger/solo/issues/5717) to
  scope for this channel. Needs `id-token: write` in the release workflow; unverified against
  Solo's existing pipeline (§9).

The script verifies the checksum unconditionally and runs `cosign verify-blob` when `cosign` is
available locally (best-effort — a missing local `cosign` warns, doesn't block install).

**Gap:** the script itself, fetched via the one-line `curl | sh`, runs with no verification before
execution — only the binary it subsequently downloads is checked. Closing that needs the
"download, inspect, then run" two-step noted in §9, which gives up the one-command convenience
that's the point of this channel.

### 6.2 Native packages (deferred) — repo hosting and per-format signing

If the nfpm channel is built: host via JFrog Artifactory (already used for npm), which has native
repo types for apt/dnf/apk and auto-signs their metadata on reindex; pacman has no native repo
type there, so it's a generic repo with CI running `repo-add --sign`. Every format is also attached
to the GitHub Release regardless, so `apt install ./solo.deb` works before a client adds any repo.
Two kinds of key material: one OpenPGP identity, reusable across apt/dnf/pacman, and one RSA
keypair for Alpine (`abuild-sign` doesn't speak OpenPGP). Both are self-generated, unlike the
purchased/CA-issued macOS/Windows certs — [#5717](https://github.com/hiero-ledger/solo/issues/5717)
should scope them explicitly, but only if this channel ships.

---

## 7. Lifecycle Hook Design

### 7.1 Image-cache warm-up is not a safe `postinst` action

A `postinst` hook cannot call `solo cache image pull` directly: it runs as root, non-interactively,
with no TTY and sometimes no network; a non-zero exit fails the whole install; and per §5.1 it
would populate `/root/.solo/cache`, not the actual invoking user's.

**Recommendation:** move the warm-up into a first-run check inside Solo itself — a per-user marker
under `~/.solo/`, checked on first invocation regardless of install channel. On the native-package
channel, `postinst`'s only job becomes printing a one-line notice (optionally a preseed flag like
`--with-image-cache` for non-interactive provisioning). The install script has no separate hook to
design — it just runs the same first-run logic inline (§5.2). Exact mechanism is an implementation
decision for [#5725](https://github.com/hiero-ledger/solo/issues/5725).

### 7.2 Uninstall hooks defer to a `solo` subcommand, not a package script

`apt remove solo` running as root and silently deleting a user's Kind clusters is surprising,
unrecoverable, and doesn't know whose clusters to look for (same `$HOME`-scoping problem as §7.1).
The macOS document reaches the same conclusion via a different route (`pkgutil` has no uninstall
hook at all) and lands on a `solo uninstall` subcommand run as the actual user.

One shared uninstall implementation ([#5721](https://github.com/hiero-ledger/solo/issues/5721))
behind `solo uninstall`, invoked differently per channel: `preremove` invokes or prompts for it on
the native-package channel; on the install-script channel, `solo uninstall` itself removes
`~/.solo/bin/solo` and the `PATH` entry it added, since there's no separate hook to do that for it.
`~/.solo/sea-resources/<version>/` (§5.1) needs to be in that cleanup scope either way.

### 7.3 Self-upgrade (`solo update`)

The install script needs its own upgrade command, since there's no package manager on this
channel. This sketches the mechanism as input to
[#5722](https://github.com/hiero-ledger/solo/issues/5722), which owns the final cross-channel
design.

**Mechanism — atomic self-replace.** `solo update` resolves the latest version and
per-`(os, libc, arch)` download URL from the GitHub Releases API (the same source §6.1 already
publishes to — `VersionUpdateNotifier`'s existing 24-hour-cache pattern can be reused here, pointed
at GitHub Releases instead of the npm registry); downloads the new binary into a temp file in the
**same directory** as the current one (`~/.solo/bin/`); verifies its checksum/signature (§6.1);
then renames the temp file over the current binary path. Renaming over a running executable is
safe on Linux — the running process keeps its already-open inode until it exits.

**Channel detection matters more than the swap itself.** `solo update` must never touch a binary it
doesn't own — extend `HomebrewDeprecationNotifier`'s existing path-sniffing to branch: install
script (`~/.solo/bin/`, or `SOLO_INSTALL_DIR`) self-replaces; npm-installed shells out to
`npm install -g @hiero-ledger/solo@latest` rather than touching the file directly; a native package
(if built) delegates to its package manager; a system-wide install-script run
(`SOLO_INSTALL_DIR=/usr/bin`) detects the missing write permission and re-execs with `sudo` or
prints the manual command.

**Naming.** The CLI architecture doc already uses `upgrade` as a per-resource operation
(`block-node upgrade`, node `upgrade` — a *network component*), so reusing that word for Solo
itself would be ambiguous. `solo update`, a bare top-level command with no resource, avoids the
collision.

---

## 8. Recommendation

**Ship a curl-pipe-to-shell install script as the primary Linux distribution channel, with the
nfpm-built native packages (`deb`/`rpm`/`apk`/`archlinux`) as an optional secondary channel for
users or environments that specifically need repo-based installs.** The install script alone
already satisfies every requirement in the parent epic (§1) at a fraction of the infrastructure
the native-package channel needs, because it sidesteps the root/no-TTY/wrong-`$HOME` constraints
that package-format lifecycle hooks exist to work around in the first place (§7).

- **Install script (primary):** one shell script (§5.2), no packaging format, no repository, no
  signing infrastructure beyond a checksum manifest with a keyless `cosign` signature (§6.1).
  Covers all 9 distros immediately for whichever `(libc, arch)` SEA binaries exist, with no
  packaging-config changes as new binaries land. `solo update` (§7.3) gives one uniform,
  no-`sudo`-by-default upgrade command.
- **Native packages via nfpm (secondary, if/when built):** hosted via JFrog Artifactory (§6.2),
  every format also attached to the GitHub Release for local-file install. Justified by real
  demand for `apt`/`dnf`/`pacman` search-and-install and passive updates — not built speculatively
  ahead of that demand.
- **Lifecycle hooks stay thin on the native channel, and don't exist as a separate concept on the
  install-script channel** (§7): neither calls `solo cache image pull` or deletes clusters
  directly; both defer to Solo-owned mechanisms (first-run check, `solo uninstall`).

**Implementation notes for #5725:**

1. Write the install script (§5.2): OS/libc/arch detection, download + checksum/`cosign`
   verification (§6.1), install to `~/.solo/bin/solo`, `PATH` setup, first-run notice (§7.1).
   Publish it at a stable URL alongside the SEA binaries and `SHA256SUMS`/`.sig` on the release.
2. Implement `solo update` (§7.3) and `solo uninstall`'s install-script branch (§7.2) — both are
   prerequisites for the script to be a complete, self-sufficient channel rather than a one-way
   install.
3. Defer the nfpm native-package channel (§4, §6.2) until there's a concrete ask for repo-based
   installs.
4. Coordinate sequencing with [#5716](https://github.com/hiero-ledger/solo/issues/5716) (musl SEA
   binary), the arm64 SEA leg, and
   [#5722](https://github.com/hiero-ledger/solo/issues/5722) (self-upgrade — §7.3 is input, not a
   substitute). [#5717](https://github.com/hiero-ledger/solo/issues/5717) (signing) is needed only
   if the native-package channel is built — the install script's `cosign` step has no key for it
   to scope.

### Alternatives ruled out

- **AppImage** — no install/uninstall lifecycle at all (§4).
- **makeself** — superseded by the install script, which gets the same no-`sudo` outcome with more
  familiar UX (§5.3).
- **Raw `.deb`/`.rpm` built independently** — two pipelines for the coverage nfpm gets from one (§4).
- **FPM** — viable, but heavier CI dependency and larger issue backlog than nfpm (§4).

---

## 9. Risks / Open Questions

- **Pipe-to-shell trust perception.** Some organizations flag `curl | sh` on principle. §6.1's
  checksum/signature covers the binary the script downloads but not the script itself as it
  executes; documenting a "download, inspect, then run" alternative
  (`curl -fsSL ... -o install.sh && less install.sh && sh install.sh`) addresses both the gap and
  the policy objection without changing the primary flow.
- **No OS-native "installed software" listing on the install-script channel.** If that
  discoverability turns out to matter to users, it's the concrete signal to prioritize building
  the nfpm secondary channel (§8).
- **First-run warm-up and `solo uninstall` don't exist yet.** §7.1/§7.2 state the direction; the
  trigger, marker location, and opt-in/opt-out UX are implementation decisions for #5725, and until
  [#5721](https://github.com/hiero-ledger/solo/issues/5721) lands, removal has nothing to hand off
  to but a printed instruction.
- **`solo update`'s self-replace is proposed here, not designed end-to-end.** §7.3 is input to
  [#5722](https://github.com/hiero-ledger/solo/issues/5722); Windows's inability to rename over a
  running `.exe` needs that document's attention once a Windows equivalent exists (§3).
- **`cosign` keyless signing is unverified against Solo's release pipeline** — confirm the
  `id-token: write` permission and public Rekor logging (the signature and workflow identity are
  logged, not the binary) are acceptable during #5725's implementation.
- **Native-package hosting/signing details (JFrog's `pacman` support, nfpm's built-in signing
  coverage, #5717's scope) are unverified** — relevant only if/when that secondary channel is built.

---

## 10. References

- [makeself](https://github.com/megastep/makeself) · [AppImage](https://appimage.org/)
- [`nfpm`](https://github.com/goreleaser/nfpm) — native-package secondary channel (§8) ·
  [`fpm`](https://github.com/jordansissel/fpm) — ruled-out alternative (§4)
- [Filesystem Hierarchy Standard](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/index.html) —
  `/usr/local` reservation (§5.3)
- [`sigstore`/`cosign` keyless signing](https://docs.sigstore.dev/) — install-script integrity
  verification without key custody (§6.1)
- [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html) ·
  [#5810 — feat: add Node.js SEA build pipeline](https://github.com/hiero-ledger/solo/pull/5810) (§5.1)
- Install-script precedent for single-binary CLIs — `rustup` (`sh.rustup.rs`), Deno
  (`deno.land/install.sh`), Bun (`bun.sh/install`), uv (`astral.sh/uv/install.sh`), and the
  OpenAI Codex CLI (`chatgpt.com/codex/install.sh`) (§4)
- [macOS installer design document](macos-dmg-installer.md) — house style and shared
  uninstall/self-upgrade reasoning (§7.2, §3)

---

*Last updated: 2026-09-04 (streamlined; install script promoted to primary, native packages
deferred to a secondary channel; cosign/sigstore keyless signing replaces OpenPGP for this
channel)*
