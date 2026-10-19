---
name: solo-prepare-release
description: Prepare a Solo release PR — compute the next version from conventional commits since the last tag, cut a chore-prepare-release branch off main, add the new release row to the README "Current Releases" table (with dependency versions pulled from version.ts and the correct LTS/normal support window), retire expired rows into legacy-versions.md, and create a signed, signed-off commit of the two markdown files. Use when the user asks to "prepare a release", "cut a release", "do a Solo release PR", "bump the Solo version", or "create a release branch".
license: Apache-2.0
allowed-tools: Bash, Read, Edit, Write
metadata:
  version: "0.1.0"
  domain: release-management
  scope: hiero-ledger/solo
  triggers: prepare a release, cut a release, release PR, new release, bump version
  related-skills: solo-pr-review
---

# Solo Prepare Release

Prepare the documentation and branch for a new Solo release. This skill encodes the exact steps the Solo team
follows so the README release table, the legacy table, and the version math stay consistent.

Run everything from the `solo/` repo root (the directory containing `version.ts`, `README.md`, and
`legacy-versions.md`). Verify with `git rev-parse --show-toplevel` before starting.

## When to use

- The user asks to prepare/cut a release, bump the version, or open a release PR for Solo.

Do **not** use for: actually tagging/publishing the release (that is the release workflow, not this skill), or for
non-Solo repos.

## Inputs to gather first

| Fact | How to get it |
|------|----------------|
| Last released version | `npx tsx scripts/solo-release-tooling.ts get-last-tag` (e.g. `v0.93.0`) |
| Commits since last tag | `git log "${LAST_TAG}..HEAD" --pretty=%s` |
| Today's date | `date +%Y-%m-%d` |
| Dependency versions | `version.ts` constants (see mapping below) |

## Step 1 — Determine the next version

Read the current version from `package.json` (`"version"`) — confirm it matches the last Solo release tag.

Run the release tooling helper to inspect commit history since the last Solo tag:

```bash
npx tsx scripts/solo-release-tooling.ts check-release
```

Or execute the steps directly:

```bash
LAST_TAG="$(npx tsx scripts/solo-release-tooling.ts get-last-tag)"
git log "${LAST_TAG}..HEAD" --pretty=%s
```

Decide the bump by inspecting commit subjects since the last tag:

- **TCK-only isolation:** Commits with the exact scope `tck` (e.g. `feat(tck):`, `fix(tck):`, `feat(tck)!:`)
  belong to the TCK test harness and must **not** trigger or prepare a Solo release.
  If **all** commits since the last Solo tag are TCK commits, stop immediately — report that only TCK changes
  exist and no Solo release is needed. Skip every step below.
- If **any** subject contains a Solo feature or breaking change (starts with `feat:` or `feat(scope):` or carries `!:` where scope is **not** `tck`), bump the **minor** version and reset patch to 0 → `0.93.0` becomes `0.94.0`.
- Otherwise bump only the **patch** version → `0.93.0` becomes `0.93.1`.

Detection one-liner (`NEXT` ends up as the bare version, no leading `v`):

```bash
LAST_TAG="$(npx tsx scripts/solo-release-tooling.ts get-last-tag)"
CUR="$(node -p "require('./package.json').version")"   # e.g. 0.93.0
IFS=. read -r MAJ MIN PAT <<< "${CUR}"

COMMITS="$(git log "${LAST_TAG}..HEAD" --pretty=%s)"
TCK_ONLY=false
if [[ -n "${COMMITS}" ]] && ! echo "${COMMITS}" | grep -Eiqv '^[a-zA-Z0-9_.-]+\(tck\)!?:'; then
  TCK_ONLY=true
fi

if [[ -z "${COMMITS}" ]]; then
  echo "No commits since last release tag. No Solo release needed."
elif [[ "${TCK_ONLY}" == "true" ]]; then
  echo "TCK-only changes detected. No Solo release needed."
elif echo "${COMMITS}" | grep -Eiv '^[a-zA-Z0-9_.-]+\(tck\)!?:' | grep -Eq '^([a-zA-Z0-9_.-]+(\([^)]+\))?!:|feat(\([^)]+\))?:)'; then
  NEXT="${MAJ}.$((MIN + 1)).0"
  echo "Next version: ${NEXT}"
else
  NEXT="${MAJ}.${MIN}.$((PAT + 1))"
  echo "Next version: ${NEXT}"
fi
```

State the computed version and the reason (feat found → minor / none → patch / tck-only → stop) before proceeding.

> **TCK-only, No-commit, and Patch-only short-circuit:** if there are no commits since the last tag, if the commits are
> **TCK-only**, or if the bump is a **patch** (no Solo `feat:` or breaking commits since the last tag), there is
> **nothing to prepare** — do **not** create a branch, edit any files, or commit. Report the status and stop. Skip
> every step below. Only continue when the bump is a **minor** Solo release.

## Step 2 — Classify the release (LTS vs normal)

The minor number decides the support policy:

- **Even minor** (e.g. `0.80.x`) → **LTS**: row label gets a ` (LTS)` suffix, support window is **3 months**.
- **Odd minor** (e.g. `0.81.x`) → **normal**: no suffix, support window is **1 month**.

Patch releases inherit the parity of their minor (e.g. `0.79.1` is odd → normal).

## Step 3 — Create the release branch off main

```bash
git fetch origin
git switch -c "chore-prepare-release-${NEXT}" origin/main
```

The branch name is exactly `chore-prepare-release-<next-version>` (no `v` prefix), e.g.
`chore-prepare-release-0.80.0`.

## Step 4 — Build the new README row

The "Current Releases" table in `README.md` has these columns:

```
| Solo Version | Node.js | Consensus Node | Kubernetes | Docker Resources | Release Date | End of Support |
```

Fill the new row (insert it as the **first** data row, directly under the header separator):

| Column | Value | Source |
|--------|-------|--------|
| Solo Version | `<NEXT>` plus ` (LTS)` if even minor | Step 1/2 |
| Node.js | carry forward from the current top row | matches `package.json` `engines.node` (`>= 22.0.0 (lts/jod)`) |
| Consensus Node | `HEDERA_PLATFORM_VERSION` value verbatim | `version.ts` (e.g. `v0.74.0`) |
| Kubernetes | `>= ` + `KUBECTL_VERSION` | `version.ts` (e.g. `>= v1.32.2`) |
| Docker Resources | carry forward from the current top row | `Memory >= 12GB, CPU cores >= 6` |
| Release Date | today | `date +%Y-%m-%d` |
| End of Support | release date + 1 month (normal) or + 3 months (LTS) | see below |

Read the dependency versions from `version.ts` rather than assuming — they change between releases. If a
`version.ts` value differs from the carried-forward row, use the `version.ts` value.

End-of-support date (macOS BSD `date`):

```bash
RELEASE_DATE="$(date +%Y-%m-%d)"
# normal release: +1 month
date -j -v+1m -f "%Y-%m-%d" "${RELEASE_DATE}" +%Y-%m-%d
# LTS release: +3 months
date -j -v+3m -f "%Y-%m-%d" "${RELEASE_DATE}" +%Y-%m-%d
```

Keep the markdown column alignment consistent with the existing rows (pad cells to the same widths). Use Edit to
insert the row so surrounding rows are untouched.

## Step 5 — Retire expired rows into legacy-versions.md

A release is expired when its **End of Support** date is strictly before today.

1. From the README "Current Releases" table, collect every row whose End of Support `< today`.
2. Remove those rows from `README.md`.
3. Prepend them to the table in `legacy-versions.md`, keeping that table's **descending order** (newest version /
   date at the top of the legacy table).

> **Formatting note:** the legacy table uses its own column widths and even has a header typo (`Consenus Node`).
> Do **not** "fix" it — reformat each moved row to match the legacy table's existing alignment so the diff stays
> minimal and the table renders cleanly.

If no rows are expired (common — newest releases are still supported), skip the legacy move and only update README.
Say so explicitly rather than touching `legacy-versions.md`.

## Step 6 — Commit (signed + signed-off)

Stage and commit **only** the two markdown files. The commit must carry a DCO sign-off (`-s`) and a cryptographic
signature (`-S`):

```bash
git add README.md legacy-versions.md
git commit -s -S -m "chore(release): update readme and legacy versions for release ${NEXT}"
```

If signing fails (no GPG/SSH key configured), stop and tell the user — do **not** commit unsigned. The repo
requires "Verified" commits. If the user has `commit.gpgsign=true` globally, `-S` is redundant but harmless.

Verify the commit is signed and signed-off before finishing:

```bash
git log -1 --show-signature --pretty=full | grep -iE 'Signed-off-by|gpg|Good signature'
```

## Step 7 — Push and open the PR

A commit was made, so this step is **required** — push the branch and open the PR (do not wait for confirmation):

```bash
git push -u origin "chore-prepare-release-${NEXT}"
gh pr create --base main \
  --title "chore(release): update readme and legacy versions for release ${NEXT}" \
  --body "Prepares documentation for the \`${NEXT}\` release."
```

The PR title is a **Conventional Commit** with a `release` scope and must match the commit subject exactly:
`chore(release): update readme and legacy versions for release <next-version>`
(e.g. `chore(release): update readme and legacy versions for release 0.80.0`). Never use a `feat:`/`fix:` prefix
for the release-prep PR — it only touches docs, so `chore(release):` is correct.

Then report: the computed version, LTS/normal classification, the new README row, how many rows were moved to legacy
(if any), the branch + commit, and the PR URL.

## Constraints

### MUST

- Stop immediately with no branch, no file edits, and no commit when commits are **TCK-only** or the bump is **patch-only**.
- Select only valid Solo release tags (`v[0-9]*`), never selecting TCK tags (e.g. `tck-v*`, `*tck*`) or non-version tags.
- Exclude TCK commits (exact scope `tck`) from inflating Solo feature counts or triggering minor release preparation.
- Read dependency versions from `version.ts` (`HEDERA_PLATFORM_VERSION`, `KUBECTL_VERSION`), never assume them.
- Insert the new release as the first data row of the "Current Releases" table.
- Apply the even=LTS/3-month, odd=normal/1-month rule from the **minor** version number.
- Move only rows whose End of Support is before today, preserving legacy-table descending order and formatting.
- Commit with both `-s` (sign-off) and a valid signature; stop if signing is unavailable.
- Whenever a commit is made, push the branch and open the PR — with a Conventional Commit title that matches the
  commit subject (`chore(release): update readme and legacy versions for release <next>`).

### MUST NOT

- Treat TCK-specific commits (e.g. `feat(tck):`, `fix(tck):`, `feat(tck)!:`) as Solo features or release triggers.
- Mistake TCK tags (e.g. `tck-v*`, `*tck*`) for Solo release tags.
- Commit anything other than `README.md` and `legacy-versions.md`.
- "Fix" the existing legacy-table header typo or reflow unrelated table rows.
- Make any file change or commit for a patch-only or TCK-only bump.
- Bump major version — this skill only does minor/patch bumps.
