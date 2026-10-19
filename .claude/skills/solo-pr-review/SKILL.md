---
name: solo-pr-review
description: Review a Solo pull request the way the Solo Team reviews — enforce Solo's TypeScript style guide, DRY/SOLID, class-with-static-methods discipline, generic CLI flag descriptions, error-handling consistency (KubeApiResponse.throwError), backwards compatibility, default-storage-class style fallbacks, cross-platform (Windows) safety, user-experience-first defaults, and root-cause-over-workaround thinking. Use when the user asks to review a PR, a branch, a diff, or a file change set in the hiero-ledger/solo repo. Triggers on "review this PR", "PR review", "review the diff", "review my branch", "look at PR #N".
license: Apache-2.0
allowed-tools: Bash, Read, Grep, Glob, WebFetch
metadata:
  version: "0.1.0"
  domain: code-review
  scope: hiero-ledger/solo
  triggers: review PR, review this PR, PR review, review the diff, review my branch
  related-skills: code-reviewer, security-review, review
---

# Solo PR Review

Review pull requests in `hiero-ledger/solo` the way the Solo Team reviews them. This skill encodes the conventions
enforced repeatedly across the project so reviews stay consistent whether they're authored by a human or generated here.

## When to use

- The user supplies a PR number, PR URL, branch name, commit range, or file list and asks for a review.
- The user asks "what would you flag in this change?", "review my branch", or similar.
- The user is the PR author preparing to push and wants a self-review pass.

Do **not** use for: greenfield architecture proposals (use `architecture-designer`), security-only audits (use
`security-review`), or generic non-Solo TypeScript reviews (use `code-reviewer`).

## Required reading before reviewing

Open these before writing any feedback. They are the rulebook — the review must cite them when something is off.

| File                                         | What it owns                                                      |
|----------------------------------------------|-------------------------------------------------------------------|
| `docs/contributing/typescript-code-style.md` | The full TS style guide (DRY/SOLID, naming, imports, types, etc.) |
| `CLAUDE.md`                                  | Project-level conventions and gotchas (flags, env vars, etc.)     |
| `eslint.config.mjs`                          | Enforced lint rules (errors, not warnings)                        |
| `.prettierrc.json`                           | Formatting (120 col, single quotes, etc.)                         |

## Core workflow

1. **Establish intent.** Read the PR description (and any linked issue) and state the goal in one sentence. If the goal
   is unclear, stop and ask the author — do not guess.
2. **Inventory the diff.** List every file changed and group them: source, tests, workflows, docs, examples, generated.
   Note the size of each group. Big diffs that touch many groups warrant a structural pass before a line pass.
3. **Structural pass.** Walk the checklist in `references/solo-review-checklist.md`. This catches the recurring issues (
   DRY violations, exported functions, generic-flag wording, error-handling drift, missing Windows support, etc.) before
   getting into line-by-line nits.
4. **Line pass.** Read the actual diff. For each finding, decide:
   - **Critical** — bug, security issue, data loss, broken backwards compatibility, build/CI break.
   - **Major** — design/architecture issue, DRY/SOLID violation, missing default behavior, cross-platform regression,
     drift from existing patterns.
   - **Minor** — naming, comment hygiene, suggestion-block one-liners.
   - **Question** — something that looks off but might have a reason. Ask before claiming.
5. **Comment-to-implementation pass.** For every changed behavioral comment, JSDoc, test name/comment, example,
   documentation claim, and PR-description assertion, trace the claim to the final source and test behavior. Confirm
   that APIs, control flow, process boundaries, logging, configuration propagation, and claimed coverage are exactly
   what the text says. Treat wording left over from an earlier commit or implementation as a finding — not as reliable
   context — and distinguish a documentation-only mismatch from behavior that is actually broken or concealed by the
   stale wording.
6. **Test pass.** Are there tests? Are they unit (cheap, fast) or did the author reach for E2E/nightly when a unit test
   would do? Do the tests execute the behavior their names and the PR description claim they cover? Flag missing or
   overstated unit coverage explicitly.
7. **Verification ledger.** Before writing anything, tag every Critical and Major with the evidence actually behind it:
   - **executed** — you ran a command and read its output. Quote the load-bearing lines in the finding itself.
   - **read-in-full** — you read the entire file, issue, or rule the claim depends on.
   - **inferred** — you reasoned from the diff without running or fully reading anything.

   Verify or demote every `inferred` finding. A Question the author can answer costs a round-trip; an assertion they
   can refute costs the whole review its credibility. Evidence attaches to an individual claim, never to the report —
   a "what I verified locally" section does not vouch for the claims next to it. Traps that have each produced a
   retracted finding:
   - **Negative claims** ("issue N does not cover this", "this env var is undocumented", "the rule bans this here")
     require reading the whole source. A positive claim needs one witness; a negative claim needs an exhaustive read.
     Never assert what a document does not say from a truncated read.
   - **Suggestion blocks are one-click-appliable.** Type-check any non-trivial code before posting it. A suggestion
     that fails `tsc`, or an invented API that fails open rather than erroring, is worse than no comment.
   - **Line numbers** come from the source file at the head SHA, never from a saved diff — the coordinate systems
     differ, and a wrong anchor makes a correct finding look careless.
   - **Contaminated environments.** A worktree with a symlinked or stale `node_modules`, a warm cache, or a
     non-default toolchain invalidates any finding about dependency resolution, caching, or build behavior.
     Reproduce cleanly or drop it.
   - **Rule citations.** Re-read the scope line of every rule you cite — which paths it covers, whether it is an
     error or a warning. Citing a rule you have misread is worse than citing nothing.
8. **Write the report.** Use the template in §Output. Lead with the critical/major findings; line-level suggestion
   blocks come after.

> **Checkpoint:** before delivering the report, re-read it and ask: *"If I were the author, would I be able to act on
> every comment without another round-trip?"* If not, tighten the wording or add a code example. Then ask: *"Which
> findings would survive the author pushing back with a command output?"* Anything that would not survive is not
> ready to post.

## Reference guide

Load these on demand — don't paste them into the report.

| Topic                          | File                                           | Load when                                                     |
|--------------------------------|------------------------------------------------|---------------------------------------------------------------|
| Solo-specific review checklist | `references/solo-review-checklist.md`          | Always — this is the structural-pass driver                   |
| Feedback voice and format      | `references/solo-maintainer-feedback-style.md` | Always — covers tone, suggestion blocks, root-cause questions |

## How to fetch the diff

```bash
# Metadata only — small, cheap, do this first
gh pr view <number> --json title,body,headRefName,baseRefName,headRefOid,files,additions,deletions,author,state,url

# Full diff (large for big PRs — paginate via Read once it's persisted)
gh pr diff <number>

# Per-file diff (preferred when you already know which files matter)
gh pr diff <number> -- <path>

# By branch (when working locally on the author's branch)
git diff origin/main...HEAD
git diff origin/main -- <path>
```

For URL-only inputs, parse the PR number out of the URL and use `gh pr view` / `gh pr diff`.

**Token-efficiency tips:**

- `gh pr view --json files` returns the file list with line counts — use it to decide which files to fetch full diffs
  for, instead of pulling the whole PR diff up front.
- For exact line numbers in *inline-comment-anchor positions*, prefer `gh pr diff <num> -- <path>` over fetching the
  entire file via `gh api .../contents/...`. The diff already shows line numbers on the RIGHT side.
- Only fetch a full file via `gh api 'repos/<owner>/<repo>/contents/<path>?ref=<sha>' --jq '.content' | base64 -d` when
  you genuinely need surrounding context the diff doesn't show.
- When iterating over multiple lookups, batch them into a single Bash call (one shell, multiple `gh api` invocations)
  rather than separate tool calls.

## How to post the review

**Always post feedback as a single PR review — never as standalone PR or issue comments.** Every
finding (summary verdict and inline line comments) must be attached to one review so the author can
resolve them in one round-trip.

**Critical behavior: leave the review in PENDING state. Never submit it.** The human reviewer
will read the queued comments in the GitHub UI, edit if needed, and submit themselves. Submitting
automatically would post a review attributed to the human without giving them a chance to vet it.

### The single-POST flow (preferred)

POST one review with all inline comments embedded and **no `event` field** — that creates the review
in `PENDING` state with every comment attached. This is one HTTP call and avoids the
"user_id can only have one pending review per pull request" failure that hits the multi-step flow
when a pending review already exists.

1. **Check for an existing pending review.** If one exists for the current reviewer, delete it
   before starting fresh (the single-POST flow can't merge into an existing pending review):

   ```bash
   existingId=$(gh api "repos/<owner>/<repo>/pulls/<number>/reviews" \
     --jq '.[] | select(.user.login == "'"$(gh api user --jq .login)"'" and .state == "PENDING") | .id')
   if [[ -n "${existingId}" ]]; then
     gh api -X DELETE "repos/<owner>/<repo>/pulls/<number>/reviews/${existingId}"
   fi
   ```

2. **Write the review payload to a file.** JSON shape:

   ```json
   {
     "commit_id": "<head SHA from gh pr view headRefOid>",
     "body": "<§Output-template summary as a single markdown string>",
     "comments": [
       {
         "path": "<file path>",
         "line": <line number on RIGHT side of the diff>,
         "side": "RIGHT",
         "body": "<comment, suggestion blocks OK>"
       }
     ]
   }
   ```

   **Do not include an `event` field.** Its absence keeps the review in `PENDING` state.

3. **POST the review:**

   ```bash
   gh api -X POST "repos/<owner>/<repo>/pulls/<number>/reviews" --input review-payload.json
   ```

   The response includes `"state": "PENDING"` and an `html_url` pointing to the review on GitHub.

4. **Tell the user what to do next.** End the turn with a short message that:

- Links to the pending review (`html_url` from the response).
- States that the review is queued in PENDING state with N inline comments + summary.
- Asks them to open it in GitHub, vet/edit the comments, and choose **Comment**,
  **Approve**, or **Request changes** themselves.
- Does **not** call any API to submit, dismiss, or otherwise change the review state.

### What never to do

- **Never** POST `/reviews/<id>/events` with `event=COMMENT`/`APPROVE`/`REQUEST_CHANGES` —
  that submits the review. The user submits, not the skill.
- **Never** include an `event` field on the initial review POST for any value other than
  omitting it. (`event=PENDING` is rejected as an invalid enum value.)
- **Never** use `gh pr comment`, `gh pr review --body`, or POST to `/issues/<n>/comments` —
  those create orphan comments outside the review thread.
- **Never** start a second pending review when one already exists. Delete the old one first
  (step 1) or the POST fails with HTTP 422.

## Output template

```markdown
## Intent

<one-sentence recap of what the PR is trying to do>

## Verdict

<Approve | Request changes | Comment>

## Critical

- <issue> — `path/to/file.ts:LINE` — <why it blocks merge> <code example if useful>

## Major

- <issue> — `path/to/file.ts:LINE` — <why> <suggestion>

## Minor

- <issue> — `path/to/file.ts:LINE` — <suggestion>

## Questions for the author

- <question that needs an answer before this can be Approved>

## Comment and description consistency

- <State that each changed behavioral claim was checked against the final implementation, or list the stale/mismatched
  claims with their source and actual behavior.>

## Positive

- <specific thing done well — be concrete, not generic>

## Companion work

- solo-docs PR: <linked / missing / N/A>
- solo-containers PR: <linked / missing / N/A>
```

Use GitHub suggestion blocks (` ```suggestion ` … ` ``` `) for any single-line or small-block edit — they let the author
one-click apply.

## Constraints

### MUST

- Post the review as a single PR review in **PENDING** state, with every inline finding attached
  as a review comment and the summary verdict as the review body.
- End the turn by linking the pending review and asking the user to vet and submit it themselves.
- Cite the rule being applied (style-guide section, eslint rule, or prior PR convention) for every Critical and Major
  finding, having re-read that rule's scope line rather than recalling its gist.
- Run the verification ledger (workflow step 7) before writing the report: tag every Critical and Major `executed`,
  `read-in-full`, or `inferred`, and verify or demote to a Question everything left `inferred`.
- Read the whole source — issue body, rule, file — before making any claim about what it does **not** say or cover.
- Type-check every non-trivial suggestion block before posting it.
- Take line numbers from the source file at the head SHA, not from a saved diff.
- Verify every changed behavioral comment and claim — including JSDoc, test names/comments, examples, documentation,
  and the PR description — against the final source and test execution before reporting. Never rely on text that may
  describe an earlier revision; report the actual final behavior and identify stale wording explicitly.
- Prefer fixing existing methods over adding new ones when they overlap (DRY).
- Push back when a CLI flag description leaks command-specific context — flags belong to the whole CLI.
- Ask "is this a workaround?" whenever the change adds polling loops, sleep/wait, or `kubectl exec` of imperative shell
  sequences against application state.
- Flag any `.github/` script that isn't TypeScript or lacks an SPDX header.
- Flag any binding of `main` to an `alpha` / `rc` / `-snapshot` upstream version.

### MUST NOT

- **Submit the review.** Never POST `/reviews/<id>/events` and never set `event` on the review-create
  call. The user submits. Phrasing like "Approve", "Request changes", or "Comment" belongs in the
  summary body for the user to choose from — the skill never makes the submit call itself.
- Let a report-level "what I verified locally" framing vouch for claims you did not individually test. Findings that
  rode in on a neighbouring finding's evidence are the ones that get retracted.
- Report a finding first observed in a knowingly contaminated environment without reproducing it cleanly — including
  one you already suspected was an artifact. If you wrote down the confound, that is the finding to drop.
- Block on personal style preferences when a linter or formatter already enforces (or doesn't enforce) the choice.
- Repeat the same comment on every occurrence — leave one comment with "applies in N other places" and list them.
- Demand renames or refactors in files the PR didn't otherwise touch.
- Wave through an exported **function** just because the module already has others. `export function …`
  or `export const fn = () => …` at module scope is a Major finding every time — cite §10.3.1 and the
  `solo/no-exported-function` lint rule (a hard **error** under `src/integration/**`, a warning elsewhere).
  The "local pattern" leniency applies **only** to exported **constants, types, and simple factories**
  (pure data), which §3.4.5 explicitly permits — never to behavior functions.
- Post findings as standalone PR comments (`gh pr comment`), issue comments, or one-off review
  comments outside the pending review — every comment must ride along with the single review.
