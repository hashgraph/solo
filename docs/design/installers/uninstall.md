# Uninstall: What `solo uninstall` Removes on Each OS

> **Status: draft outline.** Section headings and the decisions to make are in place; the prose is not final.
> Sections marked _Decided_ restate what the merged installer designs already settled.

## 1. Context

Part of epic [#5714](https://github.com/hiero-ledger/solo/issues/5714). This is the design task for
[#5721](https://github.com/hiero-ledger/solo/issues/5721): define what an uninstall removes on each OS, so every
install channel implements the same behavior.

Every installer design defers uninstall to this document:

- [Linux installer design](linux-installer-evaluation.md): uninstall is "designed once, shared across OSes" (§3).
  One `solo uninstall`, run as the real user (§7.2), is a prerequisite for a complete install-script channel (§8,
  note 2). Until it exists, removal is "a printed instruction" (§9).
- [macOS installer design](macos-dmg-installer.md) (§7.2): "Same shared `solo uninstall`". On the install-script
  channel it removes `~/.solo/bin/solo`, the `PATH` line it added and `~/.solo/sea-resources/`.
- Windows installer design (draft, [#6196](https://github.com/hiero-ledger/solo/pull/6196), §6.3): uninstall must
  also remove the user `PATH` entry and the MSYS2 folder, and Windows cannot delete a running `solo.exe`.

Earlier implementation issues [#6088](https://github.com/hiero-ledger/solo/issues/6088) (ownership record) and
[#6089](https://github.com/hiero-ledger/solo/issues/6089) (`solo uninstall`) were closed without code. Their sketch
is the starting point here, updated for the merged designs: the binary lives in `~/.solo/bin`, which is on `PATH`,
and macOS uses the install script, not a `.pkg`.

### 1.1 What exists today

- No uninstall command, and nothing records which resources Solo created.
- `solo one-shot single destroy` removes the network, the deployment and `~/.solo/one-shot-<deployment>/`. It leaves
  the kind cluster, its kube context, helm repositories, the podman machine and everything else in `~/.solo`.
- Measured after `one-shot single deploy` and `destroy` with the v0.94.0 install script (Ubuntu 24.04, arm64):
  kind cluster `solo-cluster` and context `kind-solo-cluster` still present, `~/.solo` about 390 MB (`bin/` 243 MB,
  `cache/` 132 MB, `sea-resources/` 17 MB), and seven helm repositories added to the user's own helm config.
  `cache/` holds no image archives: no release publishes `cache-manifest.json` yet
  ([#5747](https://github.com/hiero-ledger/solo/issues/5747)). Once one does, a one-shot deploy or an opt-in pull
  adds several GB under `cache/images/`.

## 2. Goals

- One `solo uninstall` for every install channel, run as the user who installed Solo.
- Delete only what Solo created. Never touch the user's own clusters, images, tools or configuration.
- Ask before deleting anything in an interactive run; a non-interactive mode for scripts and future installers.
- When something cannot be removed, say exactly what is left and the command to remove it.

## 3. Non-Goals

- Destroying networks inside clusters Solo did not create (`solo one-shot ... destroy` does that).
- Removing tools the user installed: Docker, an OS podman, Homebrew, Node.js.
- Native package channels (deb/rpm, NSIS). Only the hook they would call is defined here (§7).
- Self-upgrade ([#5722](https://github.com/hiero-ledger/solo/issues/5722), [#6104](https://github.com/hiero-ledger/solo/pull/6104)).

## 4. What Solo Creates

### 4.1 Files under `SOLO_HOME` (default `~/.solo`)

- `bin/`: helm, kind, kubectl, podman and `podman-helpers/`, plus the `solo` binary on the install-script channel.
- `config/`: podman's `containers.conf`, `registries.conf` and runtime override.
- `cache/`: templates, node keys, platform build zips, values files, image and chart archives, `update-check.json`.
  Image and chart archives always use `$SOLO_HOME/cache`, even when `SOLO_CACHE_DIR` points elsewhere.
- `logs/`, `local-config.yaml` and `one-shot-<deployment>/`.
- `image-cache-warm-up.json`: the first-run warm-up marker (#6094, still open).
- `sea-resources/<version>/`: always under `os.homedir()/.solo`, even when `SOLO_HOME` is set
  (`sea/sea-main.template.cjs`). One folder per version, never pruned.

### 4.2 Outside `SOLO_HOME`

- Install script: the `# >>> solo installer >>>` block in `~/.bashrc` or `${ZDOTDIR:-$HOME}/.zshrc`
  (`~/.bash_profile` on macOS), or `~/.config/fish/conf.d/solo.fish`. With `--prefix`, the binary is in that folder.
- kube contexts: `kind-<cluster>` in `$KUBECONFIG` or `~/.kube/config`, written by kind.
- Helm: repositories added to the user's global helm config (Solo sets no `HELM_*` variables). A v0.94.0 one-shot run
  added `hedera-json-rpc`, `mirror`, `kube-prometheus-stack`, `operator`, `metrics-server`, `haproxy-ingress` and
  `prometheus-operator-crds`.
- `solo config ops backup` writes `./solo-backup` in the current folder.

### 4.3 Container resources and processes

- kind clusters: `solo-cluster` from one-shot deploys; `kind` on the rootful Linux podman path; one per backup context
  from `solo config ops restore-clusters`.
- Podman machine `podman-machine-default` (macOS and Windows, when Docker is missing or `FORCE_PODMAN=true`).
- Persistent port-forward workers. They exit on their own once the namespace or cluster is gone.
- Left alone in any case: the `kindest/node` image and other images in the Docker or Podman store.

## 5. Ownership Record (_to decide_)

- Proposal from #6088: `SOLO_HOME/owned-resources.yaml` lists each kind cluster and podman machine Solo created, with
  the provider (docker or podman) and creation time. Written only after creation succeeds; reused resources add
  nothing. Kept out of `local-config.yaml`, so no schema migration.
- Installs from before the record have none. Interactive runs ask about a `solo-cluster` or `podman-machine-default`
  found by name (default no); `--quiet-mode` never deletes them and prints the command instead.
- Open: whether to record helm repositories too (§10).

## 6. What `solo uninstall` Removes

| Item | Default | Notes |
|------|---------|-------|
| Recorded kind clusters | delete | `kind delete cluster` also removes its kube context. Same provider and privileges that created them. |
| Recorded podman machine | delete | After the clusters, because it uses the binaries in `~/.solo/bin`. |
| Port-forward workers | stop | Before the clusters, or let them exit when the clusters go (to decide). |
| `SOLO_HOME` | delete | Whole folder at the default path. With `SOLO_HOME` or `SOLO_CACHE_DIR` overridden, only the entries Solo creates, so `SOLO_HOME=$HOME` can never delete a home folder. |
| `~/.solo/sea-resources/` | delete | Separate step, because it ignores `SOLO_HOME`. |
| Binary and `PATH` lines | delete | Per channel (§7). |
| Helm repositories | _to decide_ | §10. |
| User's own clusters, images, kubeconfig entries, tools | never | |

- `--keep-config` (from #6089): keep `local-config.yaml`, keys and `one-shot-<deployment>/` for deployments on
  clusters that survive; drop deployments whose clusters were deleted.

## 7. Install Channels

| Channel | Program location | How uninstall starts | Who removes the program |
|---------|------------------|----------------------|-------------------------|
| Install script, Linux and macOS (_Decided_) | `~/.solo/bin/solo`, or the `--prefix` folder | `solo uninstall` | `solo uninstall`: the binary and the marked `PATH` block or `solo.fish` |
| Install script, Windows ([#6196](https://github.com/hiero-ledger/solo/pull/6196)) | `%USERPROFILE%\.solo\bin\solo.exe` and the MSYS2 folder | `solo uninstall` | `solo uninstall` removes the data and the user `PATH` entry; the running `.exe` needs a deferred delete (to decide) |
| npm | npm global prefix | `solo uninstall` | Solo removes the data, then prints `npm uninstall -g @hiero-ledger/solo` |
| Homebrew (deprecated) | Cellar | `solo uninstall` | Solo removes the data, then prints `brew uninstall solo` |
| Future NSIS or native packages | installer-owned | the package's uninstaller | it calls `solo uninstall --quiet-mode --keep-binary` and removes the program itself |

- Detect the channel from `isSea()` and `process.execPath`, the way `HomebrewDeprecationNotifier` detects Homebrew.
  Share this with `solo update` (#6104 §6.1).
- Nothing records a `--prefix` folder or which startup file the script edited, so uninstall looks for the marker
  block and `solo.fish` itself.

## 8. Command and Flow

```text
solo uninstall [--quiet-mode] [--keep-config] [--keep-binary] [--force]
```

1. Preflight: read the ownership record, check each resource is reachable, list deployments on clusters that stay.
2. Interactive only: show the plan and ask to confirm. Suggest `solo one-shot single destroy` for deployments on
   clusters Solo did not create.
3. Stop port-forward workers, then delete clusters, then the podman machine.
4. Delete files, then the binary and `PATH` lines last.
5. Report what is left. Exit `0` only when everything was removed.

- Unreachable resource (Docker stopped): interactive runs stop before deleting anything; `--quiet-mode` removes what
  it can, prints the leftover commands and exits non-zero. `--force` continues in an interactive run.

## 9. Related Work

- [#6273](https://github.com/hiero-ledger/solo/issues/6273) and
  [#6276](https://github.com/hiero-ledger/solo/issues/6276): the install script and `npm install -g` download images
  only on request. `solo one-shot single deploy` still caches them unless `ENABLE_IMAGE_CACHE=false`. Either way the
  archives land in `$SOLO_HOME/cache/images/`, which uninstall removes with `SOLO_HOME`.
- [#6094](https://github.com/hiero-ledger/solo/issues/6094): the first-run warm-up marker lives in `SOLO_HOME` (§4.1).
- The manual removal steps on the solo-docs Linux Install Script page are replaced by `solo uninstall` once it ships.

## 10. Open Questions

1. Helm repositories: remove the ones Solo added? The names are generic and Solo overwrites a user repository with the
   same name, so removing them can break the user's own helm setup. Proposal: leave them and list them in the report.
2. Recorded clusters that still run deployments: delete after confirmation, and in `--quiet-mode` as well?
3. Rootful Linux podman path: Solo merges `kind-kind` into `/home/<user>/.kube/config` itself. Clean it up, or fix that
   path first?
4. Windows: how to remove a running `solo.exe` (rename and delete on next start, or print the last step).
5. What exactly `--keep-config` keeps (keys under `cache/keys/`, staging builds).
6. Old `sea-resources/<version>/` folders: prune them in `solo update`, and remove all of them here?

## 11. Implementation Issues (after agreement)

- Ownership record (replaces #6088, updated to this design).
- `solo uninstall` command (replaces #6089, updated channel table).
- Docs: replace the manual removal steps with `solo uninstall`.

## 12. References

- [Linux installer design](linux-installer-evaluation.md) (§3, §5.1, §5.2, §7.2, §8, §9)
- [macOS installer design](macos-dmg-installer.md) (§5, §7.2)
- [Windows installer design, draft](https://github.com/hiero-ledger/solo/pull/6196) (§5.1, §6.3)
- [Self-upgrade design, draft](https://github.com/hiero-ledger/solo/pull/6104) (§6.1, §10)
- [#6088](https://github.com/hiero-ledger/solo/issues/6088), [#6089](https://github.com/hiero-ledger/solo/issues/6089)
