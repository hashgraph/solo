# Solo PR Review Checklist

Project-grounded checks distilled from recurring review feedback. Walk this list during the **structural pass** (
workflow step 3 in `SKILL.md`). Each section names what to look for, what to say when you find it, and the PR(s) where
the pattern was previously flagged so the citation is traceable.

---

## 1. DRY — duplicated logic, parallel APIs, copy-paste

**What to look for**

- New method that overlaps an existing one (e.g., `installManifest` vs. existing `applyManifest`).
- Same 10+ line block appearing in two or more files or branches of the same file.
- Multiple call sites computing the same value with the same inputs.
- A new `if/elseif` chain that mirrors an existing one for a parallel concept (e.g., one per component type).
- Multiple GitHub workflows whose only difference is the matrix dimensions.

**How to respond**

- "this seems like a duplicate of `<existing method>`, perhaps you should just enhance that method if needed."
- "duplicate code fragment — could make more DRY. Consider extracting `<name>` and calling it from both sites."
- "I see this a couple of times, make it DRY and create a type."
- For workflows: "I'd prefer for it to be more DRY. We have the E2E matrix set. We have the Examples matrix. Perhaps
  another matrix could consolidate these. Less redundancy to maintain and manage."
- Prefer **fixing the existing method** (e.g., add a parameter to filter pods with a `deletionTimestamp`) over adding a
  sibling method. Multiple near-identical methods cause confusion about which to call.

**Prior precedent:** PR #4230 (`installManifest` vs `applyManifest`), PR #4363 (returning-truthy helper duplicated), PR
#3939 (`helm-values-helper.ts` 27-line duplicate, scheduled-job sprawl), PR #3546 (`getNewestReadyPod` vs fixing
`waitForReadyStatus`).

---

## 2. No exported functions — classes with static methods only

**What to look for**

- `export function foo(...)` at module scope in `src/`.
- `export async function foo(...)` likewise.
- New class whose only purpose is namespacing yet has a constructor with injected dependencies it doesn't use.

**How to respond**

- "we should use classes and static methods, we should not export functions."
- "no export functions, only classes with static methods."
- "if the only method is static, there is no reason for a constructor or to inject anything."
- Suggestion-block form:
  ```suggestion
  export class FooHelper {
    public static async resolveX(...): Promise<...> { ... }
  }
  ```

**Counter-balance:** §3.4.5 of the TS style guide says *don't* create container classes with static methods purely for
namespacing — `export constants and functions instead`. Reconcile: the Solo convention in practice is
class-with-static-methods for **behavior** (resolution, computation, orchestration). Pure data — constants, types,
simple factories — can stay as exports. When in doubt, follow the directory's existing pattern.

**Enforcement:** the `solo/no-exported-function` ESLint rule flags `export function` and
`export const fn = () => …` — a hard **error** under `src/integration/**`, a warning elsewhere while
legacy functions migrate. A diff that adds an exported function in `src/integration/**` will fail CI.

**Prior precedent:** PR #4230 (`resolveStorageClass` exported), PR #3870 (`GetSoloRemoteConfigMapTask` had unnecessary
constructor), PR #4568 (Copilot-authored `export function detectFatalContainerError` + module-scope helpers in
`k8-client-pods.ts` — should have been static members of `K8ClientPods`).

---

## 3. Helper methods belong as private class methods

**What to look for**

- A new top-level helper used only by one class.
- A free function defined in the same file as a class that calls it.
- Repeated arrow-function expressions inside a method body that could collapse into one private method called twice.

**How to respond**

- "Consider moving `<name>` to a private class method for consistency with the other extracted helpers and to keep
  `<caller>` a bit easier to scan."
- "consider making this a private method to be cleaner."
- "make private method and move into class."

**Prior precedent:** PR #4363 (`isExplicitFlag` should be private method), PR #3870 (`remote-config-collector.ts`).

---

## 4. CLI flag descriptions stay generic

**What to look for**

- A flag description that references a single command, sub-command, or component (e.g., "the consensus node version to
  deploy for **one-shot**").
- A flag description that contains environment-specific guidance ("for CI", "when running locally").

**How to respond — suggestion-block form**

````
```suggestion
        'Consensus node version to deploy (e.g. v0.73.0 or 0.73.0).',
```
keep generic, flags should be designed for the entire CLI
````

**Prior precedent:** PR #4363 (3 separate flags in `flags.ts`).

---

## 5. Use `flags.<flag>.constName` / `flags.<flag>.name`, never the string literal

**What to look for**

- `argv['deployment']`, `argv['nodeAliasesUnparsed']`, `'--deployment'`, etc. anywhere a `flags` constant exists.
- `config['deployment']` instead of `config[flags.deployment.constName]`.

**How to respond**

- "Use `flags.deployment.constName` (or `.name` for argv) instead of the string literal. Style guide §5.2.6."

**Prior precedent:** Documented in `typescript-code-style.md` §5.2.6.

---

## 6. Match existing error-handling patterns

**What to look for**

- New `try/catch` that throws `new Error(...)` instead of `SoloError`.
- New K8s client wrapper that doesn't go through `KubeApiResponse.throwError`.
- A new error path that doesn't wrap the underlying cause.

**How to respond**

- "match K8 error handling logic."
- "we need to wrap the error. Instead use `KubeApiResponse.throwError`."
- "Instead use `KubeApiResponse.throwError`."

**Prior precedent:** PR #4230 (storage class lister), PR #3390 (RBAC client).

---

## 7. Backwards compatibility — the default path must keep working

**What to look for**

- A new required flag that the user previously didn't need to set.
- A new default behavior that changes what happens when the flag is omitted.
- Removal of a flag, alias, or output line that scripts may depend on.

**How to respond**

- "We want to maintain backwards compatibility as much as possible. If the user does not supply `<flag>`, match the
  existing behavior of `<old behavior>`."
- Ask: "what happens for users who upgrade and run this without setting the new flag?"

**Prior precedent:** PR #4230 (storage class default behavior).

---

## 8. Defaults / cascading fallback chains must be complete

**What to look for**

- A resolver that handles N-1 of N reasonable inputs and falls off a cliff for the last one.
- A "user supplied or default" path with no auto-detection middle step.
- A new install/provision step that doesn't first check whether the thing already exists.

**How to respond**

- "I think you are missing to check for `<the default>` and if none exists set this one as the default."
- "if no `<X>` is passed, default to `<sensible value>`."
- Spell out the cascade explicitly when responding: user-supplied → cluster default → auto-detect → bootstrap.

**Prior precedent:** PR #4230 (storage class resolution order), PR #3546 (Taskfile defaults).

---

## 9. Naming — words that don't add information are noise

**What to look for**

- Names where one word repeats a property already encoded in the type (e.g., `getNewestPod` returning a single `Pod` — "
  Pod" is in the return type; `getNewest(...)` is clearer).
- Adjectives that aren't terms of art in the surrounding domain (e.g., `valid` for a K8s status — K8s uses `phase`,
  `status.conditions[].type`, etc.).
- Helpers prefixed with `do-` or `handle-` that don't describe the action.
- File names using banned abbreviations (`env-var`, `opts`, `cfg`) — see TS style guide §5.1.2.

**How to respond**

- "`newest` and `pod` implies singular, so no need to be redundant. `ready` implies stable. Suggest renaming to
  `getNewestReadyPod`."
- "I don't see that `valid` is adding any value here. It isn't a Kubernetes term (status/phase/etc.)."

**Prior precedent:** PR #3546 (`getNewestPodsForLabel` / `valid` parameter).

---

## 10. Comments that decay — no "now", "currently", "TODO later"

**What to look for**

- Comments anchored to a moment in time: `// now we use X`, `// currently the same as Y`.
- Block comments describing transient state ("about to be deleted", "this is temporary").
- Comments that re-state what the code already says.

**How to respond — suggestion-block form**

````
```suggestion
    // TSS wraps extraEnv is handled via generateExtraEnvironmentValuesFile()
```
Would be a bit odd if this comment survives for several years and it says 'now'.
````

**Prior precedent:** PR #3939 (3 occurrences of "now" comments), PR #4363 (`currently it is the same` comment).

---

## 11. Cross-platform — Windows must work

**What to look for**

- Shell-out via `sh`, `bash`, `/usr/bin/env`, `\`, `&&` patterns embedded in `Taskfile.yml`.
- Path manipulation with hard-coded `/`.
- `chmod`, `ln -s`, `find -exec` in scripts the user is expected to run.
- New `node:path` imports — should be `PathEx` from `src/business/utils/path-ex.ts`.

**How to respond**

- "this will not work on Windows. <pointer to alternative — e.g. `examples/consensus-node-jvm-parameters` solved this
  without this logic>."
- "Use `PathEx` instead of `node:path`. Style guide §3.3.5."

**Prior precedent:** PR #3390 (5 different Taskfile.yml files).

---

## 12. User experience comes first

**What to look for**

- Documentation or examples that say "run this from `<this specific directory>`".
- Required env vars the user must set before running an example.
- CI shortcuts (e.g., `npm run solo-test`) leaking into user-facing docs.

**How to respond**

- "The default should be to be able to run from any directory. We should enhance our CI to do a local build and set env
  variables as needed. User experience must come first over our Solo developer experience."

**Prior precedent:** PR #3390 (17 example READMEs — leave one consolidated comment, don't repeat it).

---

## 13. Question workarounds — find the root cause

**What to look for**

- New polling loops (`while sleep 1; do …`) against state the container should expose.
- `kubectl exec` chains that touch supervisor files (`/run/service/.../down`), package internals, or override init
  scripts.
- Application code that compensates for a misconfigured upstream image, chart, or service.
- Passwords or secrets passed on the command line.

**How to respond**

- "it seems like this is a workaround. Do we not have our `<upstream>` configured correctly? Should we be updating our
  `<upstream>` containers? This would be hard for our SREs and end-users to intuitively grasp if we don't have our
  `<upstream>` logic coded correctly."
- "are there other options that can avoid passing the password through the command line?"
- When suggesting an upstream fix, link to the upstream repo and propose a concrete change (image command, chart value,
  helm flag) — see PR #3546 s6-overlay example for the depth and shape.

**Prior precedent:** PR #3546 (s6-overlay lifecycle hacks), PR #3390 (haproxy ingress uninstall).

---

## 14. Question whether the code is needed at all

**What to look for**

- New code paths that exist "just in case".
- Unused parameters or callers.
- New nightly jobs whose value isn't articulated.
- Re-running tests against already-released code with no clear failure mode being guarded against.

**How to respond**

- "what is the use case scenario for running our examples against already tagged/released code?"
- "I could not figure out a reason why `<X>` would need to `<Y>`. In my PR I killed this."

**Prior precedent:** PR #3390 (mirror-node destroy loading node client, examples against released code).

---

## 15. Test strategy — push down the pyramid

**What to look for**

- New behavior covered only by an E2E or nightly test.
- A new scheduled workflow that runs on a cron the author hasn't justified.
- Tests that hit real clusters when a unit test against a mocked client would suffice.

**How to respond**

- "We should also be looking for opportunities for catching as much as possible inside of unit testing which can run far
  faster, more frequently, and with less costs."
- "I'm concerned about this pattern of creating all of these scheduled nightly jobs."

**Prior precedent:** PR #3939 (nightly extended tests).

---

## 16. TypeScript-only — no Python, no shell-language sprawl

**What to look for**

- New `.py`, `.sh` (beyond `.github/workflows/script/`), or other-language files in the source tree.
- `.github/` TypeScript files missing the SPDX header (the `.github` directory is excluded from ESLint, so the rules
  must be applied manually).

**How to respond**

- "we should not be adding python to solo repository."
- "We've excluded the `.github` directory from eslint. This file does not follow our coding conventions at all. The
  first line should be our license."
- For LLM-authored `.github` scripts: "Ask Copilot/Claude why it is not following `CLAUDE.md` and its reference to
  `docs/contributing/typescript-code-style.md`. Then update accordingly and include those changes in this PR."

**Prior precedent:** PR #3939 (jdwp_tester.py, jdwp-tester.ts missing license).

---

## 17. Use existing constants and registries

**What to look for**

- Inline option objects that duplicate `constants.LISTR_DEFAULT_OPTIONS.DEFAULT`.
- Direct `path.join(...)` / `path.resolve(...)` instead of `PathEx`.
- Inline default values that duplicate exported defaults in `src/core/constants.ts`.

**How to respond — suggestion-block form**

````
```suggestion
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
```
````

**Prior precedent:** PR #3390 (LISTR_DEFAULT_OPTIONS in 3 files).

---

## 18. New CLI flag registration is complete

When the diff adds a new `CommandFlag` in `src/commands/flags.ts`, verify all five steps in CLAUDE.md "Adding CLI
Flags":

1. Static field defined.
2. Added to `Flags.allFlags`.
3. Added to the command-specific list (e.g., `src/commands/node/flags.ts`).
4. Added to special registry if applicable (`nodeConfigFileFlags`, `integerFlags`).
5. `test/unit/commands/flags.test.ts` still passes.

Missing any of these = Critical (the flag is half-registered).

---

## 19. Env var docs are in sync

When the diff adds/removes/renames anything read via `getEnvironmentVariable()` in `src/**/*.ts` or `version.ts`, OR
adds/removes/renames an `@Expose()` field on `SoloConfigSchema` (or nested), verify `docs/site/content/en/docs/env.md`
was updated. See CLAUDE.md "Environment Variable Documentation" for the SOLO_* naming convention.

> Caveat: PR #4363 noted env.md is moving to `solo-docs` — but until that move lands, the in-repo file is still the
> source of truth.

---

## 20. One exported class/interface per file (§3.5)

**What to look for**

- More than one `export class` / `export interface` in a single file — split each into its own file.
- A file whose name doesn't match the exported class/interface it contains (kebab-case, all lowercase,
  e.g. `class KubeValidation` → `kube-validation.ts`).
- Exported behavior functions colocated in the same file as the class that consumes them — usually a
  symptom of the §2 violation (they should be `static`/`private static` members of that class).

**How to respond**

- "Each exported class/interface should be in its own file named in kebab-case to match it (§3.5). Split
  `<name>` into `<kebab-name>.ts`."
- "These module-scope helpers belong inside `<ClassName>` as `private static` members rather than living
  alongside it in the same file."

**Rationale (cite §3.5):** one type per file prevents circular dependencies and makes items easy to find.

**Note:** there is no off-the-shelf ESLint rule for this yet (`unicorn/filename-case` enforces kebab-case
but not the one-type-per-file or name-match halves), so it relies on review. Catch it here.

**Prior precedent:** PR #4568 (exported function + helper colocated in `k8-client-pods.ts`).

---

## 21. No @kubernetes/client-node types outside src/integration/kube

**What to look for**

- `import ... from '@kubernetes/client-node'` anywhere outside `src/integration/kube/**`.
- A public method or interface signature that uses `V1Pod`, `V1ContainerStatus`, `CoreV1Api`, or any
  other `@kubernetes/client-node` type — even if the file itself is inside `src/integration/kube`.
- A `Pods` / `Pod` interface method whose parameter or return type is a K8s library type.

**How to respond**

- "the `@kubernetes/client-node` types must stay within `src/integration/kube`. Use the Solo domain
  types (`Pod`, `ContainerStatus`, etc.) instead — see the `no-restricted-imports` ESLint rule added
  with this change."
- "the interface signature leaks a K8s library type. Add the information you need to the `Pod` (or
  appropriate domain) interface and populate it in `K8ClientPod.fromV1Pod`."

**Enforcement:** the `no-restricted-imports` ESLint rule in `eslint.config.mjs` flags any import of
`@kubernetes/client-node` in files outside `src/integration/kube` as a hard **error**. This rule was
added alongside the `ContainerStatus` domain type that made `detectFatalContainerError` K8s-free.

**Prior precedent:** PR #4568 (`pods.ts` interface had `detectFatalContainerError(pod: V1Pod)` — V1Pod
leaked through the public interface boundary; fixed by adding `ContainerStatus` to the `Pod` domain type
and changing the signature to `detectFatalContainerError(pod: Pod)`).

---

## 22. No new circular dependencies

**What to look for**

- Any PR that moves an interface or class to a new file, splits a barrel file, or adds a new import
  between files — these are the most common ways circular dependencies are introduced.
- A new import where file A already (transitively) imports from file B.

**How to verify**

Run `npx dpdm --no-warning --no-tree --exit-code circular:1 ./solo.ts`. It exits non-zero if any
cycle is detected and prints the offending chains.

**How to respond**

- "This introduces a circular dependency: `A → B → A`. Extract a minimal shared interface (e.g.
  `renewable-lock.ts`) that both files can import from without forming a cycle, rather than having
  them import each other."
- Tip: two interfaces that are genuinely mutually recursive (each references the other as a type) can
  often be decoupled by extracting the *minimal shape* one side actually needs — usually a subset of
  fields and methods — into a third file.

**Prior precedent:** interface-extraction work in PR #4805 introduced two cycles:
- `flag-types.ts ↔ command-flag.ts` — fixed by moving `PromptFunction` into `command-flag.ts`.
- `lock.ts ↔ lock-renewal-service.ts` — fixed by extracting `RenewableLock` with only
  `durationSeconds` and `tryRenew()`, which `LockRenewalService` uses instead of the full `Lock`.

---

## 23. Every thrown error must be a registered `SoloErrors` subclass

**What to look for**

- `throw new SoloError(message)` — bare base-class throw, missing `code` and `troubleshootingSteps`.
- `throw new Error(message)` — native Error instead of `SoloError` at all.
- `new SoloError({message, code})` with no `troubleshootingSteps`.
- A catch block that re-wraps with `new SoloError(...)` instead of the registered type.

**How to respond**

- "we should not throw `new SoloError(message)` directly — every error must be a dedicated subclass registered in `SoloErrors`."
- Spell out the three steps:
  1. Create `src/core/errors/classes/<category>/<name>-solo-error.ts` extending `SoloError` with `message`, `code` (new entry in `ErrorCodeRegistry`), and `troubleshootingSteps`.
  2. Register it in `SoloErrors.<category>` in `solo-errors.ts`.
  3. Replace the raw throw with `throw new SoloErrors.<category>.<methodName>(params)`.
- Name the nearest sibling error class as a shape reference (e.g. "see `backup-no-log-files-solo-error.ts` for the shape to follow").

**Counter-check before flagging**

- `KubeApiResponse.throwError` is the correct pattern for K8s client wrappers — do not flag it.
- Catch blocks that *translate* a foreign error by calling `SoloErrors.*` are fine.

**Prior precedent:** PR #5358 (`backup-restore.ts:1187` threw `new SoloError(message)` directly; the rest of the file used `SoloErrors.validation.*` correctly).

---

## 24. Pin all container image tags and package.json dependencies

**What to look for**

- Any `image: busybox`, `image: alpine`, `image: ubuntu`, or other image reference without an explicit
  version tag (e.g. `busybox` instead of `busybox:1.36.1`).
- Images pinned only to a mutable tag like `latest`, `stable`, or a branch name.
- Image references in TypeScript-generated YAML (init-container spec objects in `block-node.ts`,
  `deploy-argv-builders.ts`, etc.) as well as in shell-script heredocs and Helm values files checked
  into the repo.
- Any `package.json` dependency with a floating version (e.g., `^1.2.3`, `~1.2.3`, `*`, or no version at all).

**How to respond — suggestion-block form**

````
```suggestion
      image: busybox:1.36.1
```
pin to an exact version — floating tags can pull a different image on every deploy (supply-chain risk).
````

**How to handle pre-existing unpinned images not in the diff**

- Note them in the review summary under Major (not as an inline comment, since GitHub can't anchor
  comments on unchanged lines).
- Recommend a follow-up PR that pins them; do not block merge on pre-existing issues.

**Prior precedent:** PR #5358 (`busybox` unpinned in `launch_network.sh` and `block-node.ts`).

---

## 25. Changed comments, docs, tests, and PR claims describe the final implementation

**What to look for**

- A changed `//` comment, block comment, JSDoc, log explanation, or code example that describes an API shape,
  callback, control flow, configuration source, process lifetime, error path, logging behavior, or security property
  differently from the final code.
- Test names, test comments, or PR text claiming coverage such as “every spawn”, “all call sites”, “end-to-end”, or
  platform support when the test calls only a helper, skips a branch, or does not cross the relevant process boundary.
- Documentation that promises an exact command, prerequisite, output, default, or fallback which differs from the
  current implementation.
- Text that is internally contradictory, or appears to describe a previous design after a refactor changed the
  signature, ownership, execution model, or configuration flow.

**How to verify**

1. Enumerate each changed behavioral claim in the diff, including the PR description and companion documentation.
2. Trace the claim through the final version of the relevant source and tests — not merely the changed hunk or an
   earlier commit. Check the actual signature, callers, branches, emitted output, and configuration values.
3. When a claim spans a subprocess, worker, container, or CI platform, verify the behavior crosses that boundary in
   the implementation and test. Process-local globals, callbacks, loggers, and environment allowlists do not
   automatically propagate to a separately started process.
4. Compare examples and documented output with the invoked task or command. Conditional skips and helper-only tests
   must not be presented as full integration coverage.

**How to respond**

- State the claim, the actual final behavior, and the precise code/test location that disproves it. For example:
  “This comment appears left over from the earlier callback design: `forCommand()` no longer accepts that callback;
  the reporter is configured separately. Please update or remove the comment so future changes do not preserve the
  wrong contract.”
- If the mismatch conceals a real defect, assign severity based on the defect, not the fact that its explanation is
  stale. A documentation-only discrepancy is normally Minor; an inaccurate coverage or security claim can be Major
  or Critical when it risks unsafe operation or an untested regression.
- Do not dismiss a mismatch as “comments only” until the final implementation and test behavior have been verified.

---

## Quick decision aids

**"Should this be a class with statics or a module of functions?"**

- Has multiple methods that share state or call each other → class.
- Single static method, no shared state → still class per Solo convention; flag if exported as function.
- Pure data (constants, types, factories returning literals) → exports are fine.

**"Is this DRY enough?"**

- One occurrence: fine.
- Two occurrences: leave a note for the author to consider extracting.
- Three or more: insist on extraction.

**"Is this a workaround?"**
Ask: "If I describe the fix to an SRE who has never seen Solo, will they say 'why does Solo know about that?'" If yes —
push the fix upstream.
