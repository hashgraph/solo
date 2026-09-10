---
name: solo-log-ci-failure
description: Create a GitHub bug issue in hiero-ledger/solo for a failed CI workflow run — preserves the job log, solo.log, and diagnostics as a secret gist, extracts error context, and creates a fully-tagged P0 bug linked to the current quarter initiative. Single Bash call per URL, parallelised when multiple URLs are provided.
license: MIT
metadata:
  author: Jeromy Cannon
  version: "2.2.0"
  domain: github
  triggers: log ci failure, ci failure issue, workflow failure, failed workflow run, solo-log-ci-failure
  role: developer
  scope: project-management
  output-format: url
---

# Solo Log CI Failure

Given one or more GitHub Actions workflow URLs (run, run+job, or suite/logs), create fully-configured
P0 bug issues in `hiero-ledger/solo` with **permanently preserved** log files and complete project
metadata — in exactly **one Bash call per URL**, run in parallel when multiple URLs are provided.

All executable logic lives in a single reviewable shell script in this skill directory:

| Script | Purpose |
|--------|---------|
| `log-ci-failure.sh` | Fetch metadata, download job log + artifact, extract errors, create gist + issue |

GitHub artifacts auto-purge after 7 days. The script downloads key log files and uploads them as a
**secret gist** (never expires, not publicly listed). The issue body links directly to the gist.

> **Prerequisite:** the `gh` token must have the `gist` scope (for log preservation) and the
> `project` scope (for the board additions in step 7). Verify with `gh auth status`.
> If missing, run: `gh auth refresh -h github.com -s gist -s project`

---

## Reducing permission prompts

The script is the single point of review. Once you have read and approved its content, you
can allowlist it by exact path so Claude can run it without per-call prompts:

```
/update-config add to project allowlist:
  Bash(bash *solo-log-ci-failure/log-ci-failure.sh *)
```

This allowlists only that specific named script — not `gh` broadly — so the scope of trust
matches exactly what was reviewed.

---

## Supported URL formats

| Format | Example |
|--------|---------|
| Run + job | `https://github.com/hiero-ledger/solo/actions/runs/30336845771/job/90203561367` |
| Run only | `https://github.com/hiero-ledger/solo/actions/runs/30336845771` |
| Suite/logs | `https://github.com/hiero-ledger/solo/suites/82215623504/logs?attempt=1` |

---

## Usage (one Bash call per URL)

When multiple URLs are given, launch all calls **in parallel** in a single message.

```bash
bash ~/.claude/skills/solo-log-ci-failure/log-ci-failure.sh "<workflow-url>" [<parent-issue-id>]
```

`parent-issue-id` is optional; defaults to the Q3 2026 Developer Experience initiative
(`I_kwDOLMTWdc8AAAABIo7dFw`). Override when the failure belongs to a different initiative.

The script:
1. Fetches run and job metadata
2. Downloads job log and best-matching artifact
3. Finds the first step with `conclusion: "failure"` and slices the job log to that step's time
   window — every extraction below reads from that slice, not the whole job log
4. Extracts SOLO error codes, full exception stack traces (including `Caused by` chains), error boxes, and failed commands
5. Auto-generates issue title and body from extracted error data
6. Creates a secret gist with all log files
7. Creates the GitHub issue (Bug, P0-🔥)
8. Adds to both project boards at Ready/P0
9. Links as sub-issue of the initiative
10. Cleans up `/tmp/solo-ci-<RUN_ID>`

### Why extraction is scoped to the failed step

A job's raw log interleaves every step. Steps that run after the real failure — most commonly a
best-effort diagnostics collector invoked with `... || true` — can print their own SOLO-NNNN error
box even though that step itself reported `success`. Grepping the whole log for the first match used
to surface that later, unrelated error instead of the one that actually failed the job (and, when a
step never invoked the `solo` CLI at all, `solo.log` content from any step is ignored rather than
guessed at). The artifact auto-selection is scoped the same way: an artifact only gets attached when
it shares a real token with the job name, or is the one unambiguous candidate in the run — otherwise
none is attached, rather than guessing among artifacts that belong to unrelated jobs.

### Title auto-generation

The script generates a title in `{Job Name} > {error description}` format using this priority, all
read from the failed step's own output unless noted:

1. **SOLO error code** — `[SOLO-NNNN] <message from solo.log, if that step ran a solo command>`
2. **First meaningful `ERROR:` line** from solo.log, only when the failed step's own output shows a
   solo command actually ran there (skipping the noisy `Error executing: 'podman'` cascade)
3. **First extracted exception stack headline** from the failed step (for example `OneShotDeployFailedSoloError: ...`)
4. **`##[error]`** line from the failed step
5. Fallback: `task failed`

### Error details extraction

Issue bodies now prioritize the most informative failure context in this order:

1. **Full exception stack trace** (error class/message + `at ...` frames + `Caused by` chain)
2. **Solo error box** (`╭─ ERROR ... ╰─`)
3. **Solo `ERROR:` lines**
4. **Job-level fallback lines** (`##[error]`, failed command snippets, exit status)

For `Error: Executing command: /path/cmd --flags url`, the command and image/URL are extracted
(e.g. `crane quay.io/minio/operator:v7.1.1`) to keep the title concise.

---

## Pre-resolved IDs

| Name | ID |
|------|----|
| Repo `hiero-ledger/solo` | `R_kgDOLMTWdQ` |
| Issue type: Bug | `IT_kwDOCq2Q984BY34w` |
| Label: Bug | `LA_kwDOLMTWdc8AAAABg4dJNg` |
| Label: P0-🔥 | `LA_kwDOLMTWdc8AAAABg4dJZQ` |
| **Solo CLI Program Board** | `PVT_kwDOCq2Q984BQs6I` |
| &nbsp;&nbsp;Status field | `PVTSSF_lADOCq2Q984BQs6Izg-vs_E` |
| &nbsp;&nbsp;Status: Ready | `61e4505c` |
| &nbsp;&nbsp;Priority field | `PVTSSF_lADOCq2Q984BQs6Izg-vtZ0` |
| &nbsp;&nbsp;Priority: P0 | `79628723` |
| **Solo X Team** | `PVT_kwDOCq2Q984A6EW6` |
| &nbsp;&nbsp;Status field | `PVTSSF_lADOCq2Q984A6EW6zguwhjU` |
| &nbsp;&nbsp;Status: Ready | `36d4dfb8` |
| &nbsp;&nbsp;Priority field | `PVTSSF_lADOCq2Q984A6EW6zguwhkA` |
| &nbsp;&nbsp;Priority: P0-🔥 | `95df2dcd` |

## Current quarter initiative issues

Default to **#5004** for CI / test / developer tooling failures.

| Initiative | # | Node ID |
|-----------|---|---------|
| 2026 Q3 — Address Developer Experience Issues *(default for CI failures)* | 5004 | `I_kwDOLMTWdc8AAAABIo7dFw` |
| 2026 Q3 — Address User Experience Issues | 5002 | `I_kwDOLMTWdc8AAAABIoWEfQ` |
| 2026 Q3 — Technical Debt Reduction | 5018 | `I_kwDOLMTWdc8AAAABIqZ7jQ` |
