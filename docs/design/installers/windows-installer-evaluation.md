# Windows Installer: Install Mechanism and MSYS2 Package Set

## 1. Context

Solo currently ships on Windows only as the npm package `@hiero-ledger/solo`, which requires Node.js ≥ 22.
Part of epic [#5714](https://github.com/hiero-ledger/solo/issues/5714) (native OS installers, no runtime pre-install required). This document covers:

- the MSYS2 audit for [#5718](https://github.com/hiero-ledger/solo/issues/5718), and
- the install-mechanism choice that feeds [#5723](https://github.com/hiero-ledger/solo/issues/5723)
  (NSIS installer) and the shell-call migration in
  [#5726](https://github.com/hiero-ledger/solo/issues/5726).

The Linux installer (`installers/linux/install.sh`) is a `curl | sh` script: it downloads the SEA binary
from GitHub Releases, verifies it against `SHA256SUMS`, installs to `~/.solo/bin`, edits the shell profile's
PATH block, and runs `solo cache image pull`. See
[linux-installer-evaluation.md](linux-installer-evaluation.md).

## 2. Goals

- Define the minimal set of MSYS2 tools Solo needs on a Windows host, and how they are bundled.
- Keep every installed file inside Solo's own directory. Nothing is installed globally.

## 3. Non-Goals

- Building the NSIS installer or the Authenticode signing pipeline (#5723, #5717).
- Designing `solo upgrade` / `solo uninstall`. Neither command exists yet (§6.3).
- Migrating existing PowerShell calls to MSYS2 (#5726).

---

## 4. MSYS2 Audit

### 4.1 What MSYS2 is

MSYS2 provides POSIX-style tools on Windows. The tools are recompiled from source against a runtime DLL
(`msys-2.0.dll`) that emulates POSIX calls (`fork`, `/usr/bin` paths, permissions) on top of the Windows
API. The result is ordinary Windows `.exe` files that need their DLLs beside them. Linux binaries
(ELF) cannot run this way.

### 4.2 Method

Audited `src/**/*.ts` for `ShellRunner.run`, `spawn`, `execFileSync` and `execContainer` calls.

### 4.3 Findings

Nearly every `bash`, `sh`, `curl`, `chmod`, `chown`, `cat`, `grep` and `unzip -t` call goes through
`execContainer`, so it runs **inside a container** with the image's own tools. None of these need MSYS2.

Host-side tools:

| Tool                                                 | Location                                              | Needed on Windows via MSYS2?               |
| ---------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| `zip` (`-rX -P`)                                     | `src/commands/backup-restore.ts` (backup compression) | **Yes**                                    |
| `unzip` (`-o -P`)                                    | `src/commands/backup-restore.ts` (restore)            | **Yes**                                    |
| `which` / `where`                                    | `helm-software-loader.ts`, `diagnostics-reporter.ts`  | No. Already uses `where` on Windows.       |
| `ps`                                                 | `src/core/lock/lock-holder.ts`                        | No. Runs on macOS only; Windows skips it.  |
| `curl`, `bash`                                       | `brew-package-manager.ts`                             | No. Homebrew installer, macOS/Linux only.  |
| `git`, `iptables`                                    | `cluster-task-manager.ts`                             | No. Linux package-manager path.            |
| `sudo`                                               | `podman-client.ts`                                    | No. POSIX only.                            |
| `openssl`                                            | In-container hash fallback only                       | No.                                        |
| `kubectl`, `helm`, `kind`, `podman`, `docker`, `net` | various                                               | No. Managed binaries or Windows built-ins. |

### 4.4 Minimal package set

| Package                                                                                         | Why                                |
| ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| `zip`                                                                                           | Password-protected backup          |
| `unzip`                                                                                         | Password-protected restore         |
| Their runtime dependencies (expected: `msys2-runtime`, `bzip2`/`libbz2`, `libiconv`, `libintl`) | DLLs the two tools load at runtime |

`bash`, `curl` and `openssl` are **not** required. `bash` becomes required only if #5726 moves host-side
scripts onto a shell.

The exact dependency list must be confirmed with `pacman -Si zip unzip` and a dependency walk, or by running
`ldd` on the two executables in an MSYS2 shell. The names above are expected, not verified.

### 4.5 Why MSYS2

Today the only hard host-side requirement is ZipCrypto password-protected zip. Two alternatives would cover
that alone without MSYS2:

- a standalone Info-ZIP `zip.exe` / `unzip.exe` bundled directly, or
- a Node library with ZipCrypto support, replacing the subprocess calls entirely.

We still choose MSYS2, because Solo is expected to need additional external tools on Windows hosts in the
future. A general package source with a package manager (`pacman`) avoids sourcing, pinning and bundling each tool
separately, and gives host-side scripts a single POSIX environment (the direction of #5714 and #5726). The
bundled set is deliberately limited to what Solo uses today (§4.4), and grows only when a concrete need appears.

Cost to accept: `msys-2.0.dll` and POSIX path conversion (§4.6) are added to the Windows install for what is
currently two tools.

### 4.6 Fetching and bundling

| Option                                                         | Pros                                                              | Cons                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| A. Download prebuilt `.pkg.tar.zst`, extract only needed files | Smallest, simple, reproducible with pinned versions and checksums | Dependencies resolved by hand                         |
| B. Throwaway MSYS2 install in CI, `pacman -S`, copy files out  | Dependencies resolved automatically                               | Slower CI; depends on repo state at build time        |
| C. Own `PKGBUILD`                                              | Fully custom build                                                | Most work; only justified if we need a modified build |

Recommendation: **A or B** for the first version, with versions and SHA256 pinned. Write a `PKGBUILD` (the
form the issue names) only if a custom build is needed.

Layout, inside Solo's directory only:

```text
%USERPROFILE%\.solo\
  bin\solo.exe
  msys2\usr\bin\zip.exe
  msys2\usr\bin\unzip.exe
  msys2\usr\bin\msys-2.0.dll   (+ other required DLLs)
```

Solo invokes the tools by full path. It does not add `msys2\usr\bin` to the user's PATH, so it cannot shadow
other tools. Paths passed to these tools may need conversion (`C:\...` to `/c/...`), which is a risk for #5726.

---

## 5. Install Mechanism Options

### 5.1 Option A: PowerShell install script

```powershell
irm https://github.com/hiero-ledger/solo/releases/latest/download/install.ps1 | iex
```

Mirrors `installers/linux/install.sh`. Steps: detect architecture, download `solo.exe` and `SHA256SUMS`,
verify the checksum, install to `%USERPROFILE%\.solo\bin`, fetch and extract the pinned MSYS2 files, add the
bin directory to the **user** PATH, and run `solo cache image pull` unless `--skip-image-cache` is given.

### 5.2 Option B: NSIS installer

A `solo-setup.exe` that embeds the SEA binary and the MSYS2 files, installs to a per-user directory, runs the
cache pull post-install, registers an uninstall entry, and is signed with Authenticode (#5723, #5717).

### 5.3 Comparison

| Concern                     | Install script                                                                            | NSIS installer                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Parity with Linux/macOS     | Same model and shared logic                                                               | Windows-only artifact                                                       |
| Admin rights                | Not needed (per-user)                                                                     | Not needed if installed per-user                                            |
| Build and CI cost           | Low                                                                                       | Higher (NSIS build, CI test on a Windows runner)                            |
| Signing / SmartScreen trust | Signed `solo.exe` and script (§6.4); `iex` of a remote script can be flagged by antivirus | Signed installer, uninstaller and `solo.exe`; better SmartScreen reputation |
| Add/Remove Programs entry   | None                                                                                      | Yes                                                                         |
| Uninstall                   | Needs `solo uninstall` (not yet built)                                                    | Built in, plus the entry                                                    |
| Upgrade                     | Needs `solo upgrade` (not yet built)                                                      | Re-run installer                                                            |
| Enterprise deployment       | Awkward                                                                                   | Standard                                                                    |
| Offline / air-gapped        | Needs network unless assets are pre-staged                                                | Self-contained                                                              |
| Time to first release       | Short                                                                                     | Long (certificate, pipeline)                                                |

---

## 6. Decision

### 6.1 Start with an install script

Ship `install.ps1` first. It gives Windows the same install experience as Linux and macOS with the least work,
needs no installer pipeline, and keeps one install model across platforms. It still depends on the Authenticode
certificate from [#5717](https://github.com/hiero-ledger/solo/issues/5717), because `solo.exe` must be signed (§6.4).

### 6.2 Add NSIS later, if needed

Add the NSIS installer in #5723 only if one of these appears:

- SmartScreen or antivirus friction blocks adoption of the script.
- Enterprise or IT-managed deployment is requested.
- Offline installation is required.

The script and the installer should share the same inputs: the release assets, `SHA256SUMS` and the pinned MSYS2
file list. Choosing the script first then costs nothing later.

### 6.3 Dependency: upgrade and uninstall

`solo upgrade` and `solo uninstall` do not exist yet. Without them, a script install leaves users removing the
binary, the MSYS2 folder and the PATH entry by hand. These commands are therefore a prerequisite for a
complete Windows script install. They need a Windows branch for two reasons:

1. Windows locks a running `solo.exe`. Upgrade must rename the running binary and then swap in the new one.
2. Uninstall must remove the user PATH entry and the `msys2` directory.

This should be tracked as its own issue, or under #5721 (shared uninstall).

### 6.4 Signing

| Artifact                                         | Signing                       | Reason                                                                                            |
| ------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `solo.exe`                                       | **Authenticode, required**    | It is what Windows runs. Unsigned executables trigger SmartScreen and are more often quarantined. |
| `SHA256SUMS`                                     | cosign signature, as on Linux | Same release process. Windows has no `cosign` by default, so the script cannot rely on it.        |
| `install.ps1`                                    | **Authenticode, same cert**   | Same certificate and CI step as `solo.exe`. Lets downloaded copies run under `AllSigned` policy.  |
| `zip.exe`, `unzip.exe`, `msys-2.0.dll`           | Not signed by Solo            | Verify the pinned SHA256 of the MSYS2 packages.                                                   |
| `solo-setup.exe` and its uninstaller (NSIS only) | Authenticode, required        | Part of the NSIS option (#5723).                                                                  |

Why the script is signed too: `irm ... | iex` runs a string, not a file, so execution policy never checks a
signature on it, and the one-liner gains nothing from signing. Signing helps users who download the file and run
it (a `RemoteSigned` or `AllSigned` policy, typically on corporate machines). Since it uses the same certificate
and the same signing step as `solo.exe`, it costs almost nothing to sign both in the same release job, and doing
it later would mean reopening the release pipeline for a one-line change.

For the one-liner, trust rests on HTTPS from GitHub Releases and on what the script verifies afterwards. The
script must:

1. Check the downloaded `solo.exe` against `SHA256SUMS` (`Get-FileHash`).
2. Check `Get-AuthenticodeSignature solo.exe`: `Status` must be `Valid` and the signer subject or thumbprint
   must match Solo's certificate.

Build constraints from the SEA binary (#5716):

- The SEA payload is injected into the Node executable, so injection must happen **before** signing. Changing
  the file afterwards invalidates the signature.
- Use a timestamp server so the signature stays valid after the certificate expires.
- Sign `install.ps1` last in the release job and mark it `-text` in `.gitattributes`. Any edit after signing,
  including a line-ending change, invalidates the signature. Verify it with `Get-AuthenticodeSignature` in CI.
- EV certificates normally live on a hardware token or cloud signing service, so the CI signing step depends on
  what #5717 provisions.

## 7. NSIS Installer Design (Deferred Option)

Not part of the first release (§6.2). This section records the design so the option can be picked up without
re-research. It implements [#5723](https://github.com/hiero-ledger/solo/issues/5723).

### 7.1 What it produces

[NSIS](https://sourceforge.net/projects/nsis/) compiles a script (`solo.nsi`) with `makensis` into a single
`solo-setup.exe`. The installer embeds the signed `solo.exe` and the pinned MSYS2 files (§4.6) and lays them out
in the same per-user directory structure as the script install, so both paths produce the same result.

### 7.2 Installer behavior

| Step      | Behavior                                                                     |
| --------- | ---------------------------------------------------------------------------- |
| Elevation | `RequestExecutionLevel user`: per-user install, no admin prompt              |
| Files     | `File` for `solo.exe`; `File /r` for the staged `msys2\` tree                |
| PATH      | Add the bin directory to the **user** PATH only                              |
| Post-step | Run `solo cache image pull` after copying (skippable)                        |
| Uninstall | `WriteUninstaller`, plus an Add/Remove Programs entry (`HKCU\...\Uninstall`) |
| Silent    | `/S` for unattended installs, used by CI                                     |

The uninstall section runs the shared uninstall logic from
[#5721](https://github.com/hiero-ledger/solo/issues/5721) (`solo uninstall` once it exists, §6.3), then removes the
PATH entry and the install directory.

### 7.3 Build pipeline

1. **Stage:** an earlier job produces the signed `solo.exe` and downloads the pinned MSYS2 files into a `stage\`
   folder, uploaded as a workflow artifact.
2. **Build:** a Windows runner installs a pinned NSIS (for example `choco install nsis --version <pinned>`) and
   runs `makensis solo.nsi`.
3. **Sign:** Authenticode-sign `solo-setup.exe` and the generated uninstaller (§6.4).
4. **Test:** install silently, run a one-shot deploy and destroy against the installed binary, then uninstall and
   check nothing is left behind.
5. **Publish:** attach `solo-setup.exe` and its checksum to the release.

### 7.4 Runner requirements

- Use a pinned Windows runner image. It is needed for `signtool` and for the install test in any case.
- Install NSIS during the job with its version pinned. Pin GitHub Actions by commit hash, as the existing Windows
  workflow does.
- A Linux runner with `apt install nsis` can cross-compile, but some plugins are Windows-only and generating a
  signed uninstaller normally requires running a Windows executable during the build. Linux is therefore not used.

### 7.5 Notes

- The uninstaller is a separate executable generated at build time, so it needs its own signing step.
- NSIS owns the Add/Remove Programs entry, so `solo uninstall` and that entry must stay consistent. A machine with
  both a script install and an NSIS install must be detected.
- Sharing inputs with the script path (§6.2) keeps the installer a thin wrapper, not a second install process.

## 8. Risks

| Risk                                                 | Mitigation                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Execution policy blocks `install.ps1`                | Document `irm ... \| iex`, which is not affected by file policy                 |
| Antivirus flags the script or `msys-2.0.dll`         | Sign `solo.exe` and `install.ps1`; publish checksums; NSIS later if it persists |
| `solo.exe` signature invalidated by build order      | Inject the SEA payload first, sign last, then verify in CI                      |
| MSYS2 path conversion breaks `zip`/`unzip` arguments | Run with a working directory and relative paths; test in CI                     |
| Dependency list for `zip`/`unzip` is incomplete      | Verify with `pacman -Si` / `ldd` and a Windows runner smoke test                |
| Unpinned MSYS2 packages change between builds        | Pin versions and SHA256                                                         |
