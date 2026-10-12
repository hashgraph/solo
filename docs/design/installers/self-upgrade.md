# Self-Upgrade: Version Check and Binary Swap

## 1. Context

Part of epic [#5714](https://github.com/hiero-ledger/solo/issues/5714), which asks for "self upgrades like we see
in other products, where we inform the user there is a new version and prompt them if they would like to install
it/upgrade now". This is the design task for [#5722](https://github.com/hiero-ledger/solo/issues/5722). It feeds
[#5728](https://github.com/hiero-ledger/solo/issues/5728), which builds it.

It finishes the sketch in the [Linux installer evaluation](linux-installer-evaluation.md) (§7.3) and uses the
research in the macOS installer proposal ([#5873](https://github.com/hiero-ledger/solo/pull/5873), §9).

### 1.1 What exists today

| Piece                                                    | Where                                                       | What it does                                                                                                                                                                                                                                          |
|----------------------------------------------------------|-------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `VersionUpdateNotifier`                                  | `src/core/version-update-notifier.ts`, called from `index.ts` | After a command succeeds, in a TTY only, reads `registry.npmjs.org/@hiero-ledger/solo/latest` (2 s timeout), caches the answer in `SOLO_CACHE_DIR/update-check.json` and prints a banner. It never prompts. The "24 hour" cache interval is `Duration.ofHours(24).toMinutes()`, which is 1440 ms, so in practice it calls npm on almost every command. |
| `HomebrewDeprecationNotifier`                            | `src/core/homebrew-deprecation-notifier.ts`                 | Detects a Homebrew install from the executable path (`Cellar/solo`). The same kind of path check tells the install channels apart (§6.1).                                                                                                             |
| SEA binaries                                             | `sea/build.ts`, `.github/workflows/flow-build-sea.yaml`     | `solo-<platform>-<arch>[.exe]` for `linux-x64`, `darwin-arm64`, `darwin-x64`, `win32-x64`. None is on a GitHub Release yet. [#6102](https://github.com/hiero-ledger/solo/pull/6102) publishes the Linux one with a `SHA256SUMS` manifest.              |
| Release signing                                          | [#5901](https://github.com/hiero-ledger/solo/pull/5901) (draft) | Signs every release asset with cosign keyless signing and uploads `<asset>.sigstore.json`, including `SHA256SUMS.sigstore.json`.                                                                                                                  |
| Linux install script                                     | [#6093](https://github.com/hiero-ledger/solo/pull/6093)     | Picks `solo-linux-<arch>[-musl]`, checks it against `SHA256SUMS`, copies it into the target folder, runs `--version` on the copy, then renames it over `solo`. The binary swap in §7 repeats these steps so both paths behave the same.               |
| Unpacked SEA resources                                   | `sea/sea-main.template.cjs`                                 | Each version unpacks into `~/.solo/sea-resources/<version>/` on its first run. Nothing removes old versions.                                                                                                                                          |

---

## 2. Goals

- Tell the user when a newer release exists and offer to install it, once per release.
- One `solo update` command for every install channel. Solo never replaces a binary it does not own.
- The user always ends with a working `solo`. The new binary is verified and run before anything is replaced, and
  any failure leaves the current binary untouched.
- No background process, and no more network calls per command than today.

## 3. Non-Goals

- Building the installers ([#5723](https://github.com/hiero-ledger/solo/issues/5723),
  [#5724](https://github.com/hiero-ledger/solo/issues/5724), [#5725](https://github.com/hiero-ledger/solo/issues/5725)),
  publishing their assets ([#5727](https://github.com/hiero-ledger/solo/issues/5727)) or signing them
  ([#5717](https://github.com/hiero-ledger/solo/issues/5717), [#5900](https://github.com/hiero-ledger/solo/issues/5900)).
- The install layout ([#5721](https://github.com/hiero-ledger/solo/issues/5721)). `solo update` replaces the file the
  running binary was started from, wherever that is (§6.2).
- Updating without asking. Solo only installs a release after the user says yes or runs `solo update`.
- Upgrading deployed networks (`consensus network upgrade` and the other per-resource `upgrade` commands).

---

## 4. Version Check

### 4.1 Where the latest version comes from

Each channel asks the source it installs from, so Solo never offers a version it cannot install.

| Channel             | Source                                                                                                    |
|---------------------|-----------------------------------------------------------------------------------------------------------|
| SEA binary (any OS) | The GitHub Release that `https://github.com/hiero-ledger/solo/releases/latest` redirects to (steps below) |
| npm                 | The npm registry's `latest` dist-tag, as today                                                            |
| Homebrew            | None. The existing deprecation banner already tells these users to switch                                 |

For a SEA binary:

1. Request `https://github.com/hiero-ledger/solo/releases/latest` without following the redirect. The `Location`
   header names the tag (`.../releases/tag/v0.91.0`).
2. Download that tag's `SHA256SUMS` and look for this machine's asset name (§7.1). Offer the release only if the
   asset is listed.

Why not npm for SEA installs: the npm package and the SEA assets are published by different jobs, and #6102 lets
the Linux assets publish when the macOS or Windows build fails. npm can therefore name a version with no binary for
this machine. Step 2 catches that.

Why not `api.github.com`: unauthenticated REST calls are limited to 60 per hour per IP address, which a team behind
one NAT or a CI runner pool uses up. The `releases/latest` redirect is not part of that limit, and the install script
already depends on it (`releases/latest/download/install.sh`).

The redirect points only at the release GitHub marks as latest. That is never a draft or a prerelease, and Solo's
release flow does not mark patch releases of old lines as latest (v0.72.1 was published after v0.84.1 and is not
latest). A version is offered only when it is strictly newer than the running one (`SemanticVersion.greaterThan`).

### 4.2 When the check runs

Where it runs today: in `index.ts`, after `ArgumentProcessor.process` returns. A command that fails never reaches it.

- At most one check every 24 hours. The cached answer is reused in between. This fixes the interval to
  `Duration.ofHours(24).toMillis()`.
- 2 s timeout per request. Offline, timed out or any other error: no banner and no prompt, only a debug log line.
- Off by default for SEA binaries until the `enableUpdateCheck` feature flag is removed (§4.4).
- Skipped when stdin or stdout is not a TTY, when `CI` is set, when `--quiet-mode` is set, when
  `SOLO_NO_UPDATE_CHECK=true`, and for `solo update` itself. While the flag exists, setting it also runs the
  request without a TTY and with `CI` set (§4.4). `SOLO_NO_UPDATE_CHECK` is the lasting off switch for users. The
  flag is only for the rollout.
- No LaunchAgent, scheduled task or other background job. The macOS proposal mentioned one. It would need its own
  entry in the uninstall design, and the check on the next command does the same job.

### 4.3 Cache file

`SOLO_CACHE_DIR/update-check.json` gains three fields:

```json
{
  "channel": "sea",
  "lastCheckEpochMilliseconds": 1790000000000,
  "latestVersion": "0.92.0",
  "skippedVersion": "0.92.0",
  "lastPromptEpochMilliseconds": 1790000000000
}
```

- `channel` (`sea` or `npm`): one user can have both an npm install and a SEA binary, and they share
  `SOLO_CACHE_DIR`. A cache entry written by the other channel is treated as stale.
- `skippedVersion`: the version the user said no to (§5).
- `lastPromptEpochMilliseconds`: when Solo last asked (§5).

### 4.4 Rollout behind a feature flag

The `releases/latest` redirect is not part of the REST API limit (§4.1), but GitHub does not document a limit for
it either. So the automatic check on SEA binaries starts behind a feature flag that is off by default, and Solo's
own workflows turn it on first to see if GitHub rate limits it.

The flag uses the feature-flag mechanism from [#6021](https://github.com/hiero-ledger/solo/pull/6021):

| Item             | Value                                                                                              |
|------------------|----------------------------------------------------------------------------------------------------|
| Flag             | `enableUpdateCheck` on `FeatureFlagsSchema`, default `false`                                       |
| Read at          | `VersionUpdateNotifier`, before it makes the GitHub request                                        |
| Turn on (env)    | `SOLO_FF_ENABLE_UPDATE_CHECK=true`, or the generated `SOLO_FEATURE_FLAGS_ENABLE_UPDATE_CHECK=true` |
| Turn on (config) | `featureFlags.enableUpdateCheck: true` in `~/.solo/solo-config.yaml`                               |

- **Flag off (the default):** a SEA binary makes no automatic request to GitHub and never prompts (§5). npm installs
  keep today's npm registry banner. It never calls GitHub, so it is not gated.
- **Flag on:** the check in §4.2 runs. It also runs without a TTY and with `CI` set, so CI jobs make the request.
  The banner and the prompt still need a TTY and no `CI`.
- **CI.** Every Solo workflow that runs a SEA binary sets `SOLO_FF_ENABLE_UPDATE_CHECK=true`
  (`flow-build-sea.yaml` and `flow-linux-install-script.yaml` today). A fresh runner has no cache, so each job
  makes one request. A failed check logs the HTTP status, so a `403` or `429` from github.com shows in the job log.
- **`solo update` is not gated.** The user asked for the lookup, and it is one request per run (§6).

Removing the flag: once the flag has been on in those workflows for two releases with no `403` or `429` from
github.com, and the check has not slowed or failed a command, a follow-up deletes the flag as the "Retiring" steps in
`docs/contributing/feature-flags.md` describe. The check is then on by default, with the skips in §4.2.

---

## 5. Prompt

When the check finds a newer version and Solo can install it on this channel (SEA binary, macOS `.pkg`, Windows
installer), Solo asks after the command's own output. The prompt needs the automatic check, so there is no prompt
while the `enableUpdateCheck` flag is off (§4.4):

```text
Solo 0.92.0 is available (you have 0.91.0).
Release notes: https://github.com/hiero-ledger/solo/releases/tag/v0.92.0
Update now? (y/N)
```

- **Yes:** runs the same code as `solo update` (§6) for that version, then exits.
- **No (the default, also Enter):** records `skippedVersion`. Solo does not ask about or show a banner for that
  version again. `solo update` still installs it, and the next release asks again.
- **No answer in 30 seconds:** treated as "not now". Nothing is recorded as skipped, but `lastPromptEpochMilliseconds`
  is, and Solo asks at most once every 24 hours. Without this, a script that runs several `solo` commands in a
  terminal (the `examples/` Taskfiles do) would stop at every command. The timeout uses the `signal` option of
  `@inquirer/prompts`, which Solo already uses.

npm installs keep today's banner and never prompt, because Solo cannot update an npm install itself (§6.1). The
banner adds the exact command: `npm install -g @hiero-ledger/solo@0.92.0`.

---

## 6. `solo update`

```text
solo update [--version <tag>] [--quiet-mode]
```

| Flag              | Effect                                                                                                                                                                                                               |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| (none)            | Look up the latest release (§4.1, ignoring the cache), show the current and the new version, ask to confirm, then install.                                                                                         |
| `--version <tag>` | Install exactly this release, newer or older. This is how a user goes back from a bad release. Going back prints a warning that the older version may not read config written by the newer one.                  |
| `--quiet-mode`    | No confirmation.                                                                                                                                                                                                     |

`solo update` does not depend on the `enableUpdateCheck` flag (§4.4). It works the same with the flag off.

On the latest release already, it prints `Solo 0.91.0 is the latest release` and exits with `0`. Any failure is a
coded `SoloError` with a non-zero exit code.

The name follows the [Linux installer evaluation](linux-installer-evaluation.md) (§7.3) and the uninstall design
(#5721), which both use `solo update`. `update` and `upgrade` are both per-resource verbs already
(`consensus node update`, `block node upgrade`), so neither word is free, but a top-level command with no resource
does not clash with either.

### 6.1 Install channels

| Channel                              | Detected by                                                                                                     | What `solo update` does                                                                                                                                                 |
|--------------------------------------|-----------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Linux install script                 | `isSea()` on Linux                                                                                              | Replaces the binary in place (§7). No `sudo`.                                                                                                                           |
| macOS `.pkg` (#5724)                 | `isSea()` on macOS, and `pkgutil --file-info <binary>` names Solo's package ID                                  | Downloads the new `.pkg`, verifies it (§8), runs `installer -pkg <file> -target /` through the existing `sudoRun` prompt (§9.1).                                         |
| Windows installer (#5723)            | `isSea()` on Windows, and Solo's NSIS `Uninstall.exe` is next to `solo.exe`                                     | Downloads the new installer, verifies it (§8), runs it silently and waits for it (§9.2).                                                                                |
| Other SEA binary on macOS            | `isSea()` on macOS, no package receipt                                                                          | Replaces the binary in place (§7), the same as Linux.                                                                                                                   |
| Other SEA binary on Windows          | `isSea()` on Windows, no `Uninstall.exe`                                                                        | Prints the release download URL. A bare `solo.exe` is not a supported channel (it has no MSYS2 bundle).                                                                 |
| npm                                  | not `isSea()`, not Homebrew                                                                                      | Prints `npm install -g @hiero-ledger/solo@<version>`. Changes nothing.                                                                                                  |
| Homebrew                             | `HomebrewDeprecationNotifier.isInstalledViaHomebrew()`                                                          | Prints the deprecation banner's switch instructions. Changes nothing.                                                                                                  |

Installer packages update through their own installer, not by swapping `solo.exe` or `/usr/local/bin/solo`
directly, so the package receipt, the MSYS2 bundle next to `solo.exe` and the version in Settings > Apps stay
correct.

### 6.2 Which file is replaced

`fs.realpathSync(process.execPath)`. Following symlinks means a user who linked `~/.local/bin/solo` to the real
binary keeps a working link, and the real file is the one replaced. This is also why the open install-layout
question in #5721 (`~/.solo/bin` or `~/.local/bin`) does not block this design.

---

## 7. Binary Swap (Linux, and SEA binaries on macOS)

The same steps as `install_binary` in the install script, in the same order:

1. **Check the folder.** If the binary's folder is not writable (`fs.access(folder, W_OK)`), stop before downloading
   anything. Print the install-script command for that folder, for example
   `curl -fsSL .../install.sh | sudo sh -s -- --prefix /usr/local/bin --version v0.92.0`, and exit non-zero.
2. **Get the manifest.** Download `SHA256SUMS` and `SHA256SUMS.sigstore.json` for the target tag and verify the
   signature (§8). Find the line for this machine's asset.
3. **Download** the asset to `<folder>/.solo.update.<pid>`. The same folder means the rename in step 6 never crosses
   a filesystem, so it is atomic.
4. **Check** its SHA-256 against the verified line.
5. **Run it.** `chmod 0755`, then run `<staged file> --version` with stdin closed. It must exit `0` and report the
   target version. This catches a binary built for the wrong CPU or libc before anything is replaced. It also unpacks
   the new version's `sea-resources`, so the first real command after the update starts at normal speed.
6. **Swap.** `fs.renameSync(<staged file>, <binary>)`. Processes still running the old binary (this one, other
   terminals, the persist port-forward workers from [#6090](https://github.com/hiero-ledger/solo/pull/6090)) keep
   the old file open until they exit.
7. **Clean up** old `sea-resources` (§10), print `Updated Solo 0.91.0 to 0.92.0`, and exit.

### 7.1 Asset name

`solo-${process.platform}-${process.arch}`, plus `-musl` on a musl Linux and `.exe` on Windows. Node reports glibc
in `process.report.getReport().header.glibcVersionRuntime`; when that field is missing, the system uses musl. This
matches the names the install script and `sea/build.ts` use.

### 7.2 Failures

Before step 6 the current binary is never touched, and step 6 is a single rename. So no failure can leave a partly
written `solo`.

| Failure                                             | Result                                                                                                                                                             |
|-----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Offline, DNS failure or timeout                     | From the prompt: there is no prompt. From `solo update`: a coded error that names the URL.                                                                         |
| The release has no asset for this machine           | `Release v0.92.0 has no Solo binary for this machine (solo-linux-arm64)`, plus the npm command. Same wording as the install script.                               |
| Missing or invalid signature                        | Refused (§8). Only the manifest was downloaded.                                                                                                                    |
| Download interrupted, disk full, checksum mismatch  | The staged file is deleted. The error says what failed.                                                                                                            |
| Ctrl-C                                              | A signal handler deletes the staged file. A file left by a killed process (`.solo.update.<pid>` whose process is gone) is deleted by the next `solo update`.       |
| The staged binary does not run                      | Deleted. The error says the release does not run on this machine, with the output of `--version`.                                                                 |
| The rename fails                                    | The staged file is deleted. The error includes the system error.                                                                                                  |
| Folder not writable                                 | Stopped at step 1, before any download.                                                                                                                            |

### 7.3 No backup copy

Solo does not keep the old binary as `solo.old`. The new binary has already run (step 5) before it replaces
anything. A release that runs but misbehaves is undone with `solo update --version <previous tag>`, which goes
through the same verified steps.

---

## 8. Integrity

Every download is verified before it is used, and a missing signature refuses the update:

1. Download `SHA256SUMS` and `SHA256SUMS.sigstore.json`.
2. Verify the bundle inside Solo with the [`sigstore`](https://www.npmjs.com/package/sigstore) npm package (the code
   npm uses for package provenance): `verify(bundle, manifestBytes, {certificateIssuer:
   'https://token.actions.githubusercontent.com', certificateIdentityURI:
   '^https://github\\.com/hiero-ledger/solo/\\.github/workflows/'})`. This pins the same signer identity as the
   install script's `cosign verify-blob`.
3. Check the downloaded file's SHA-256 against its line in the verified manifest.

- **Stricter than the install script on purpose.** A shell script can only run `cosign` when the user has it, so it
  warns when the signature cannot be checked. Solo carries the verifier itself, so it always checks. A checksum alone
  only catches a corrupted download: it comes from the same place as the binary, so whoever can replace one can
  replace the other.
- **Trust root.** `sigstore` downloads Sigstore's TUF trust root and caches it. The default cache folder is outside
  `~/.solo`, so Solo sets `cachePath` to a folder under `SOLO_CACHE_DIR`, where uninstall removes it.
- **Installer packages** (`.pkg`, the Windows installer) go through the same three steps, so they must be listed in
  `SHA256SUMS`. On top of that, macOS `installer` checks the `.pkg`'s Developer ID signature itself.
- **Cost.** `sigstore` and its `@sigstore/*` packages become dependencies, bundled into the SEA binary by esbuild.
  #5728 records the size change.

This makes [#5901](https://github.com/hiero-ledger/solo/pull/5901) (or whatever signs the assets) a hard
prerequisite: every release that `solo update` can install must carry `SHA256SUMS.sigstore.json`.

---

## 9. Installer Packages

### 9.1 macOS `.pkg` ([#5724](https://github.com/hiero-ledger/solo/issues/5724))

`solo update` downloads the new `.pkg`, verifies it (§8), and runs `sudo installer -pkg <file> -target /` through
`sudoRun`. The package's `postinstall` runs again, as it does on any install over an existing one, and the receipt
records the new version.

Requirements for #5724:

- Publish the bare `.pkg` as a release asset with a fixed name pattern, listed in `SHA256SUMS`, even if the
  user-facing download is a DMG that wraps it (option A in #5873). Mounting a DMG to reach the `.pkg` is not needed.
- Use one package ID for every version, so `pkgutil --file-info` identifies the channel.

### 9.2 Windows installer ([#5723](https://github.com/hiero-ledger/solo/issues/5723))

`solo update` downloads the new installer, verifies it (§8), runs it with `/S` (silent, per-user, no UAC prompt),
waits for it to exit, and reports its exit code.

Requirements for #5723:

- `/S` over an existing install upgrades in place and keeps the `PATH` entry and the uninstall registry key, with
  the new `DisplayVersion`.
- Windows cannot overwrite a running `.exe`, and `solo.exe` is always running at that moment: the `solo update` that
  started the installer, other terminals, and the persist port-forward workers. Windows does allow renaming a running
  `.exe`, so the installer renames the old `solo.exe` to `solo.exe.old` before it writes the new one. Solo deletes
  `solo.exe.old` when it next starts, and ignores a failure (another old process may still hold it).
- The installer replaces the MSYS2 bundle in `msys64\` in the same run.

---

## 10. Unpacked SEA Resources

Each version unpacks into `~/.solo/sea-resources/<version>/`, and nothing removes the old ones. After a successful
update (step 7 in §7, or after the installer exits in §9), Solo deletes every version folder except the version it
replaced and the new one. The replaced version stays because processes still running it may read it. The next
update removes it. At most two versions stay on disk.

---

## 11. Delivery

1. This document closes #5722.
2. #5728 builds it, in this order:
   1. **Version check and prompt** (§4, §5): the channel-aware source, the cache fields, the 30-second prompt and the
      24-hour interval fix, behind the `enableUpdateCheck` flag (§4.4), which needs #6021 merged. This part needs no
      release with SEA assets: npm installs only get the improved banner, and a SEA build finds no assets and stays
      quiet until the first release has them.
   2. **`solo update` with the binary swap** (§6, §7, §8, §10) for Linux and macOS SEA binaries. Blocked until
      #6093 and #6102 merge, #5901 merges, and one release ships with signed SEA assets. Before that, tests can serve
      the assets from a local folder, the way the install script's `--base-url` does.
   3. **macOS `.pkg` path** (§9.1). Blocked on #5724, which still has to choose between a `.pkg` and a DMG.
   4. **Windows installer path** (§9.2). Blocked on #5723.
   5. **Remove the `enableUpdateCheck` flag** when the exit criteria in §4.4 are met.

---

## 12. Risks / Open Questions

- **Scripts run in a terminal.** The prompt can pause a script that runs `solo` in a TTY for up to 30 seconds, at
  most once a day. `CI=true` or `SOLO_NO_UPDATE_CHECK=true` turns it off.
- **Going back to an older version.** `solo update --version` can install a release older than the local config it
  finds. This is the same risk as installing an older npm version today. Solo warns but does not block.
- **The `releases/latest` redirect is not a documented API.** It has been stable for years, and the install script
  already depends on it. If it changes, the check finds nothing and stays quiet. It does not fail the command.
- **GitHub may rate limit the redirect** even though it is not part of the REST API limit. The check starts behind
  the `enableUpdateCheck` flag and runs in Solo's own CI first (§4.4). A rate-limited check acts like an offline one:
  no banner, no prompt, the command still succeeds.
- **The two `latest` values can disagree for a short time** during a release (npm published, GitHub assets still
  uploading). Each channel reads its own source, so each one only offers what it can install.
- **Shared macOS binary.** A `.pkg` update changes the binary for every user on the machine. Other users' unpacked
  resources for the old version stay until they run `solo update` themselves.
- **System-wide Linux installs** (`--prefix /usr/local/bin` with `sudo`) are not updated in place. Solo prints the
  install-script command (§7 step 1) instead of running `sudo` itself.

---

## 13. References

- [Linux installer evaluation](linux-installer-evaluation.md): §6.1 (`SHA256SUMS` and keyless signing), §7.3 (first
  sketch of `solo update`)
- [#5873](https://github.com/hiero-ledger/solo/pull/5873): macOS installer proposal, §9 (self-upgrade research:
  rate limits, Windows rename-aside, rollback)
- [#6093](https://github.com/hiero-ledger/solo/pull/6093) (Linux install script), [#6102](https://github.com/hiero-ledger/solo/pull/6102)
  (Linux release assets), [#5901](https://github.com/hiero-ledger/solo/pull/5901) (release signing)
- [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [`sigstore` npm package](https://github.com/sigstore/sigstore-js/tree/main/packages/client) ·
  [`@sigstore/tuf`](https://github.com/sigstore/sigstore-js/tree/main/packages/tuf)
- [`rename(2)`](https://man7.org/linux/man-pages/man2/rename.2.html): atomic replace on the same filesystem
- [NSIS silent installs](https://nsis.sourceforge.io/Docs/Chapter3.html#installerusagecommon) ·
  [`installer(8)`](https://ss64.com/mac/installer.html)

---

*Last updated: 2026-10-12*
