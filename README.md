# Solo

[![NPM Version](https://img.shields.io/npm/v/@hiero-ledger/solo?logo=npm)](https://www.npmjs.com/package/@hiero-ledger/solo)
[![GitHub License](https://img.shields.io/github/license/hiero-ledger/solo?logo=apache\&logoColor=red)](LICENSE)
![node-lts](https://img.shields.io/node/v-lts/@hiero-ledger/solo)
[![Build Application](https://github.com/hiero-ledger/solo/actions/workflows/flow-build-application.yaml/badge.svg)](https://github.com/hiero-ledger/solo/actions/workflows/flow-build-application.yaml)
[![Codacy Grade](https://app.codacy.com/project/badge/Grade/78539e1c1b4b4d4d97277e7eeeab9d09)](https://app.codacy.com/gh/hiero-ledger/solo/dashboard?utm_source=gh\&utm_medium=referral\&utm_content=\&utm_campaign=Badge_grade)
[![Codacy Coverage](https://app.codacy.com/project/badge/Coverage/78539e1c1b4b4d4d97277e7eeeab9d09)](https://app.codacy.com/gh/hiero-ledger/solo/dashboard?utm_source=gh\&utm_medium=referral\&utm_content=\&utm_campaign=Badge_coverage)
[![codecov](https://codecov.io/gh/hashgraph/solo/graph/badge.svg?token=hBkQdB1XO5)](https://codecov.io/gh/hashgraph/solo)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/hiero-ledger/solo/badge)](https://scorecard.dev/viewer/?uri=github.com/hiero-ledger/solo)
[![CII Best Practices](https://bestpractices.coreinfrastructure.org/projects/10697/badge)](https://bestpractices.coreinfrastructure.org/projects/10697)

An opinionated CLI tool to deploy and manage standalone test networks.

## Homebrew Deprecation Notice

**Warning: Homebrew support for Solo is being removed.** The Solo Homebrew formula will stop being updated after **August 31, 2026**; releases published after that date will only be available from npm.

Install and upgrade Solo with npm instead:

```bash
npm install -g @hiero-ledger/solo
```

If Solo is currently installed with Homebrew, switch over with:

```bash
brew uninstall solo
npm install -g @hiero-ledger/solo
```

## Installation

### Linux Install Script

Solo provides an official installation script for Linux that downloads and installs the standalone Single Executable Application (SEA) binary, with no Node.js runtime required.

#### Quick Install

To install the latest release to `~/.solo/bin`:

```bash
curl -fsSL https://github.com/hiero-ledger/solo/releases/latest/download/install.sh | sh
```

To pass flags to the installer when piping into `sh`, use `sh -s -- <options>`, for example:

```bash
curl -fsSL https://github.com/hiero-ledger/solo/releases/latest/download/install.sh | sh -s -- --skip-image-cache
```

#### Download, Inspect, and Run

For environments where piping remote scripts directly to a shell is restricted by security policy, download the script first to inspect it before executing:

```bash
curl -fsSL https://github.com/hiero-ledger/solo/releases/latest/download/install.sh -o install.sh
less install.sh
sh install.sh
```

> **Security Note:** Piping `curl | sh` executes the downloaded installer script before you can inspect it; the script itself verifies the integrity of the binary it downloads, but cannot verify itself before execution. Downloading `install.sh`, inspecting it, and then running it allows you to review the script first.

#### Installer Options and Environment Variables

The installer supports the following command-line flags:

| Option | Description | Default |
|--------|-------------|---------|
| `--version <tag>` | Solo release to install, for example `v0.92.0` | `latest` |
| `--prefix <dir>` | Directory for the `solo` binary | `~/.solo/bin` (or `SOLO_INSTALL_DIR`) |
| `--skip-image-cache` | Do not run `solo cache image pull` after installing | Disabled (cache is warmed) |
| `--base-url <url>` | Release download base URL | `https://github.com/hiero-ledger/solo/releases` |
| `-h`, `--help` | Show installer help and exit | |

The installer also recognizes the following environment variables:

- `SOLO_INSTALL_DIR`: Sets the directory for the `solo` binary when `--prefix` is omitted (default: `~/.solo/bin`).
- `SUDO_USER`: When running under `sudo`, the installer detects this variable and skips warming the image cache to avoid creating root-owned files in the user's directory.

#### Installation Location and PATH Configuration

- By default, the binary is installed to `~/.solo/bin/solo`.
- When installed to the default location (`~/.solo/bin`), the installer automatically adds `~/.solo/bin` to `PATH` in your shell configuration file:
  - **Bash**: `~/.bashrc` (bracketed by `# >>> solo installer >>>` and `# <<< solo installer <<<`)
  - **Zsh**: `${ZDOTDIR:-$HOME}/.zshrc` (bracketed by `# >>> solo installer >>>` and `# <<< solo installer <<<`)
  - **Fish**: `~/.config/fish/conf.d/solo.fish`
- **Custom Prefixes**: If `--prefix` or `SOLO_INSTALL_DIR` specifies a non-default directory (or if your shell is not recognized), the installer does not modify startup files; add the target directory to your `PATH` manually.
- After installation, restart your shell or run `export PATH="$PATH:$HOME/.solo/bin"` (or your custom directory) to start using `solo`.
- If another `solo` executable (such as one installed via npm) appears earlier on `PATH`, the installer prints a warning advising you to remove it (`npm uninstall -g @hiero-ledger/solo`).

#### Integrity and Signature Verification

- **Checksum Verification**: The installer unconditionally downloads the `SHA256SUMS` manifest from the GitHub release and computes the SHA-256 hash of the downloaded binary. If the checksum does not match, or if no binary is published for the detected architecture and C library, the installer halts and deletes temporary files.
- **Pre-execution Smoke Test**: Before replacing an existing binary, the installer executes `<staged_binary> --version` to ensure the binary runs properly on your system.
- **Keyless Signature Verification (`cosign`)**: If [cosign](https://github.com/sigstore/cosign) is installed on your system, the script automatically downloads the signature bundle (`SHA256SUMS.sigstore.json`) and verifies the signature of the checksum manifest against Solo's GitHub Actions workflow OIDC identity (`https://token.actions.githubusercontent.com`). If `cosign` is not found, signature verification is skipped with an informational message, while checksum verification proceeds unconditionally. If no signature bundle is published for the release, signature verification is skipped with a warning.

#### Container Image Cache

By default, the installer runs `solo cache image pull --quiet-mode` after installing the binary to pre-pull the container images that Solo deploys, speeding up your first deployment.
- Use `--skip-image-cache` to skip pre-pulling (useful for CI pipelines or bandwidth-constrained environments).
- If image pulling fails (for example, if Docker or Podman is not running), the installer prints a warning but exits successfully; cache failures do not prevent installation. You can pull the images later at any time by running `solo cache image pull`.

#### Platform Support and Limitations

The installer automatically detects your operating system, CPU architecture, and C library (`glibc` vs `musl`):

- **Supported Standalone Binary**: Releases currently build and publish the standalone binary for **Linux x86_64 / amd64 with glibc** (`solo-linux-x64`).
- **Platform Limitations and Upcoming Support**:
  - Standalone binaries for **Linux ARM64 / aarch64** are not yet available (tracked in [#6212](https://github.com/hiero-ledger/solo/issues/6212)).
  - Standalone binaries for **musl-based distributions (e.g., Alpine Linux)** are not yet available (tracked in [#6211](https://github.com/hiero-ledger/solo/issues/6211)).
  - Standalone installers for macOS and Windows are tracked in epic [#5714](https://github.com/hiero-ledger/solo/issues/5714).
- On platforms without standalone binary releases (including Linux ARM64, Alpine Linux, macOS, and Windows), install Solo using npm.

#### Manual Uninstallation

Automated uninstallation via `solo uninstall` is planned (tracked in [#5721](https://github.com/hiero-ledger/solo/issues/5721)). To manually uninstall Solo:

1. Remove the installed binary:
   ```bash
   rm -f ~/.solo/bin/solo
   ```
   (or `<prefix>/solo` if installed to a custom directory). To remove all user configuration, caches, and runtime data, delete the `~/.solo` directory:
   ```bash
   rm -rf ~/.solo
   ```
2. Remove the PATH entry from your shell startup file:
   - **Bash** (`~/.bashrc`) or **Zsh** (`~/.zshrc`): Delete the block between `# >>> solo installer >>>` and `# <<< solo installer <<<`.
   - **Fish**: Delete `~/.config/fish/conf.d/solo.fish`:
     ```bash
     rm -f ~/.config/fish/conf.d/solo.fish
     ```
   - For custom prefixes, remove any `export PATH=...` entries you manually added.

### npm (Cross-Platform)

Solo is also published as an npm package for all platforms supporting Node.js:

```bash
npm install -g @hiero-ledger/solo
```

Requires Node.js >= 22.0.0.

## Releases

Odd-numbered Solo releases are supported for one month after their release date. Even-numbered LTS (Long-Term Support) versions are supported for three months. Upgrade to the latest version to benefit from new features and improvements.

### Current Releases

| Solo Version | Node.js             | Consensus Node | Kubernetes | Docker Resources               | Release Date | End of Support |
|--------------|---------------------|----------------|------------|--------------------------------|--------------|----------------|
| 0.93.0       | >= 22.0.0 (lts/jod) | v0.77.2        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-10-13   | 2026-11-13     |
| 0.92.0 (LTS) | >= 22.0.0 (lts/jod) | v0.77.2        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-10-06   | 2027-01-06     |
| 0.91.0       | >= 22.0.0 (lts/jod) | v0.76.4        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-09-24   | 2026-10-24     |
| 0.90.0 (LTS) | >= 22.0.0 (lts/jod) | v0.76.4        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-09-22   | 2026-12-22     |
| 0.89.0       | >= 22.0.0 (lts/jod) | v0.75.1        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-09-15   | 2026-10-15     |
| 0.84.0 (LTS) | >= 22.0.0 (lts/jod) | v0.74.0        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-07-28   | 2026-10-28     |
| 0.82.0 (LTS) | >= 22.0.0 (lts/jod) | v0.74.0        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-07-14   | 2026-10-14     |

To see a list of legacy releases, please check the [legacy versions documentation page](legacy-versions.md).

## Documentation

Our documentation is available here: [solo.hiero.org](https://solo.hiero.org/)

## Contributing

Contributions are welcome. Please see the [contributing guide](https://github.com/hiero-ledger/.github/blob/main/CONTRIBUTING.md) to see how you can get involved.

## Code of Conduct

This project is governed by the [Contributor Covenant Code of Conduct](https://github.com/hiero-ledger/.github/blob/main/CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code of conduct.

## License

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
