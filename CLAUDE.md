# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Solo (`@hiero-ledger/solo`) is a CLI tool for deploying and managing private Hedera Networks on Kubernetes. It orchestrates consensus nodes, mirror nodes, block explorers, and JSON-RPC relays via Helm charts and Kubernetes APIs.

- **Language:** TypeScript (ES2022, ESM)
- **Runtime:** Node.js >= 22.0.0
- **CLI Framework:** Yargs with Listr2 for task execution

## Common Commands

All task commands use [Task](https://taskfile.dev/) (`task`):

```bash
# Install dependencies
npm install

# Build (compile TypeScript + lint)
task build

# Compile only
task build:compile

# Run unit tests with coverage
task test

# Auto-fix lint/formatting issues (run before committing)
task format

# List all available tasks including E2E tests
task --list-all

# Run a specific E2E test suite
task test-e2e-integration
task test-e2e-standard

# Run solo via tsx (development mode, without building)
npm run solo-test -- <COMMAND> <ARGS>
```

To run a single unit test file directly:

```bash
npx mocha 'test/unit/path/to/test.ts'
```

Logs are written to `$HOME/.solo/logs/solo.log`. Tail with: `tail -f $HOME/.solo/logs/solo.log | jq`

## Architecture

The codebase follows a layered, command-driven architecture with dependency injection (`tsyringe-neo`):

**Entry point:** `solo.ts` → `ArgumentProcessor` (Yargs) → Command Layer

### Layer Overview

1. **`src/commands/`** — 14 CLI commands (account, deployment, network, node, cluster, block-node, explorer, mirror-node, relay, one-shot, backup-restore, rapid-fire, file). Each command extends `BaseCommand` and implements command-specific workflows.

2. **`src/core/`** — ~95 services: `account-manager.ts`, `config-manager.ts`, `chart-manager.ts`, `key-manager.ts`, `lock/` (distributed leases), `logging/` (Pino), `dependency-managers/` (installation checks and dynamic command loading).

3. **`src/integration/`** — External system clients: `kubernetes/` (K8s API wrapper), `helm/` (Helm chart execution), `kind/` (cluster provisioning), `git/`, `npm/`.

4. **`src/business/`** — Runtime state, local/remote config providers, address book management, path/crypto utilities.

5. **`src/data/`** — Configuration schema (JSON schema validation + migrations), mapper (class↔object), storage backends.

### Key Patterns

- **Dependency Injection:** Services registered via `InjectTokens` enum; `@inject()` decorators on constructors. The DI container is initialized in `src/core/dependency-injection/`.
- **Task Execution:** All long-running operations are Listr2 task arrays, enabling progress rendering and cancellation.
- **Configuration:** Local (in-memory) and Remote (Kubernetes ConfigMap) config providers; validated against JSON schemas with migration support.
- **Error Hierarchy:** `SoloError` (base), `SilentBreak` (exit without display), specialized errors in `src/core/errors/`.
- **Component Versions:** Managed in `version.ts` at the repo root.

## Environment Variable Documentation

There are two categories of environment variables to keep in sync with `docs/site/content/en/docs/env.md`. This requirement does NOT apply to variables used only in the `test/` directory.

### 1. Direct env vars

When adding, removing, or modifying environment variables consumed via `getEnvironmentVariable()` in `src/**/*.ts` or `version.ts`, update `env.md`. Each entry must include the variable name, a short description, accepted/default values, and where it is used.

### 2. Config-system env vars

The layered config system (`EnvironmentConfigSource`, prefix `SOLO`) allows environment variables to override any `@Expose()`d field on `SoloConfigSchema` and its nested schemas (`HelmChartSchema`, etc.). Keep `env.md` updated for any user-facing config fields that can be overridden this way.

**Naming convention:** Each camelCase property name segment is converted to `UPPER-KEBAB-CASE` (dashes separate words within a segment); schema object nesting levels are joined with `_`; the whole key is prefixed with `SOLO_`.

| Config property path           | Env var                               |
| ------------------------------ | ------------------------------------- |
| `helmChart.directory`          | `SOLO_HELM-CHART_DIRECTORY`           |
| `tss.readyMaxAttempts`         | `SOLO_TSS_READY-MAX-ATTEMPTS`         |
| `tss.wraps.libraryDownloadUrl` | `SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL` |

This is **not** the same as plain `UPPER_SNAKE_CASE` — dashes within a segment represent camelCase word boundaries, not underscores.

**Environment variable aliases.** Because the generated names are awkward (embedded dashes) and cannot
match legacy fixed names, a field may also declare one or more fixed alias env var names with the
`@EnvironmentAliasRegistry.alias('SOLO_TSS_READY_MAX_ATTEMPTS')` property decorator (see
`src/data/schema/decorators/environment-alias-registry.ts`). The generated `SOLO_*` name always takes
precedence; the alias applies only when the generated name is absent, and using an alias logs a notice.
Aliases may only be placed on a uniquely-typed schema field (a reused type such as `HelmChartSchema`
fails fast). When adding/removing an alias, keep this section and any env var docs in sync.

## Architecture and Design

Before implementing a new feature or undertaking a major refactor, review the architecture and
design documentation under [`docs/design/architecture/`](docs/design/architecture/) and align the
implementation with the patterns and standards described there.

For small enhancements to existing features or bug fixes, architectural alignment is not required.

## Coding Standards

Follow the project's TypeScript style guide at [`docs/contributing/typescript-code-style.md`](docs/contributing/typescript-code-style.md) for all code changes.

Before writing or modifying code, review these configuration files to avoid lint and formatting issues:

- **`.prettierrc.json`** — formatting rules (indentation, quotes, line length, etc.)
- **`eslint.config.mjs`** — linting rules and TypeScript-specific restrictions
- **`.remarkrc.mjs`** — Markdown linting rules (applies to `.md` files)

Key rules enforced as ESLint **errors** (not warnings):

- **`import type`** — When all identifiers in an import are used only as types, use
  `import type {Foo} from '...'`. For mixed imports, use the inline form:
  `import {SomeClass, type SomeInterface} from '...'`. See §3.3.4 of the TypeScript style guide.
- **Abbreviations** — `unicorn/prevent-abbreviations` bans common short names (`fn`, `vars`,
  `envVar`, `cb`, `err`, `opts`, etc.) in identifiers **and file names**. See §5.1.2 of the
  TypeScript style guide for the full substitution list.
- **Explicit types** — Every variable declaration and every callback (including `it()` / `describe()`
  callbacks in tests) must have an explicit type annotation. See §6.1 and §6.1.1 of the style guide.
- **One class/interface per file** — Each exported class or interface must be in its own file, named
  in kebab-case to match the class/interface name. See §3.5 of the style guide.
- **No exported functions** — Behavior (resolvers, orchestrators, computations) is grouped on a class
  as `static` methods; do **not** `export function`/`export const fn = () => …` at module scope. Pure
  data (constants, types, simple factories) may be exported. A helper used by only one class becomes a
  `private static` member of that class. Enforced by the `solo/no-exported-function` lint rule (an
  **error** in `src/integration/**`, a warning elsewhere while legacy functions are migrated). See
  §3.4.5 and §10.3.1–§10.3.2 of the style guide.

Run `task format` to auto-fix formatting and lint issues before committing. Note that
`task format` fixes Prettier and some ESLint issues automatically, but **abbreviation violations
and missing type annotations must be fixed manually** — they appear as errors in the lint output.

### Dead Code Removal

When modifying any file, remove code that is no longer reachable or referenced as a result of your
changes. This includes methods, functions, classes, imports, constants, and type aliases that
nothing calls or imports after the edit. Do not leave orphaned code "just in case" — if it is
needed later it can be recovered from git history.

### Enhance Before Creating

Before introducing a new method, function, or class to satisfy a requirement, check whether an
existing one can be extended or generalised to cover the new case. Prefer augmenting an existing
abstraction over adding a parallel one that increases the maintenance surface. A new abstraction is
justified only when the existing one cannot cleanly accommodate the change without becoming
misleading or overloaded.

## Repository Gotchas

### Environment Variable Access — Always Use `getEnvironmentVariable()`

In `src/**/*.ts`, always read environment variables through `getEnvironmentVariable()` (exported from
`src/core/constants.ts`). **Never** use `process.env['VAR_NAME']` or `process.env[variable]`
(bracket notation) to read env vars — this is enforced as an ESLint **error** for all `src/` files
except `src/core/constants.ts` itself.

```typescript
// wrong — bypasses the utility and env.md tracking
const mirror: string = process.env['KIND_DOCKER_REGISTRY_MIRRORS'];

// correct
import {getEnvironmentVariable} from '../core/constants.js';
const mirror: string = getEnvironmentVariable('KIND_DOCKER_REGISTRY_MIRRORS');
```

Property-access reads for OS-level variables (`process.env.PATH`, `process.env.HOME`) and spreading
the environment for subprocess invocation (`{...process.env}`) are fine and are not covered by this
rule. The restriction targets application-level env var reads that must be tracked in `env.md`.

Adding `getEnvironmentVariable()` calls also triggers the documentation requirement in CLAUDE.md
"Environment Variable Documentation".

### Catch Blocks — Comment Required When Swallowing Errors

When a `catch` block does not re-throw (returns a default, returns `undefined`, or no-ops), it
**must** include a comment explaining why the error is intentionally swallowed. §4.9 of the
TypeScript style guide bans empty or unexplained catch blocks.

```typescript
// wrong — silent swallow with no explanation
} catch {
  return [];
}

// correct
} catch {
  // best-effort: fall back to empty list when kind-config is absent or unparseable
  return [];
}
```

This applies even when the catch body contains statements — the comment documents the *intent*,
not just the code.

### Error Handling — Always Use a Registered `SoloErrors` Subclass

Every error thrown in `src/` must be a dedicated subclass of `SoloError` registered in the
`SoloErrors` namespace. **Never** throw `new SoloError(message)` directly or `new Error(message)`.
The base class lacks the required `code` and `troubleshootingSteps` fields that users and operators
depend on for diagnosis.

**The three-step pattern:**

1. **Create the error class** in `src/core/errors/classes/<category>/<name>-solo-error.ts`:

```typescript
// src/core/errors/classes/validation/backup-database-dump-not-found-solo-error.ts
export class BackupDatabaseDumpNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(dumpPath: string) {
    super({
      message: `Database dump required for restore but not found at ${dumpPath}`,
      code: ErrorCodeRegistry.BACKUP_DATABASE_DUMP_NOT_FOUND,
      troubleshootingSteps:
        'Create the backup with --backup-external-database\n' +
        'Restore from the extracted backup directory, not a zip file',
    });
  }
}
```

2. **Register a new code** in `src/core/errors/error-code-registry.ts`.

3. **Register and throw** via `SoloErrors.<category>` in `src/core/errors/solo-errors.ts`:

```typescript
// call site:
throw new SoloErrors.validation.backupDatabaseDumpNotFound(dumpPath);
```

See `src/core/errors/classes/validation/backup-no-log-files-solo-error.ts` as a reference for the
full class shape. The `SoloErrors` namespace in `solo-errors.ts` shows how to wire the import and
factory entry.

**Exception:** `KubeApiResponse.throwError` is the correct wrapper for K8s API errors — do not
replace it with a raw `SoloError`.

### Pin All Container Image Tags

Every container image reference in this repository — whether in TypeScript source (init-container spec
objects), shell-script heredocs, Helm values files, or Kubernetes manifests — **must** include an exact
version tag. Floating tags (`busybox`, `alpine`, `latest`, `stable`) are forbidden because they can pull
a different image on every deploy without any code change, creating a silent supply-chain risk.

```yaml
# wrong
image: busybox

# correct
image: busybox:1.36.1
```

The same rule applies to package manager dependencies in `package.json`, Helm chart versions in
`version.ts`, and any other pinned-version registry: always specify an exact version, never a range
or mutable alias, unless the project has an explicit policy permitting ranges for that dependency type.

### Shell Scripts in `.github/` — SPDX Header Required

All shell scripts under `.github/workflows/script/` must include a SPDX license identifier on the
line immediately after the shebang:

```bash
#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
```

The ESLint `headers/header-format` rule enforces this for TypeScript files but does not cover shell
scripts — it must be applied manually. Any PR that adds or significantly modifies a `.sh` file in
`.github/` should add the header if it is missing.

### CLI Architecture Documentation

`docs/design/architecture/system/presentation_layer_cli_architecture.md` is the authoritative
reference for the CLI's command/subcommand structure. It must stay in sync with the source.

**Trigger:** any edit to a file in `src/commands/command-definitions/` that adds, removes, renames,
or reorders a command, subcommand (command group), or operation (leaf subcommand).

**What to update:**

- **"Final Vision" table** — each row is `<group> | <resource> | <operations>`. Reflect any
  command name, subcommand name, or operation list change here.
- **"Example Commands" block** — update or add example invocations when the command surface changes.
- **"Resources by Group" and "Operations by Resource" sections** — add, remove, or rename the
  matching heading and table rows.
- **Table of Contents** — update anchor links to match any renamed headings.

The documentation update must be included in the same commit as the code change.

### Adding CLI Flags

When adding a new `CommandFlag` in `src/commands/flags.ts`:

1. Add the `public static readonly ...: CommandFlag` definition.
2. Add the new flag to `Flags.allFlags`. `Flags.allFlagsMap` and helpers such as
   `Flags.stringifyArgv()` are derived from `Flags.allFlags`, so an unregistered flag is incomplete.
3. Add the flag to the relevant command-specific flag list, for example `src/commands/node/flags.ts`.
4. If the flag belongs to a special registry, also update it there:
   `nodeConfigFileFlags` or `integerFlags`.
5. Run the focused flag registry unit test:
   `npx mocha 'test/unit/commands/flags.test.ts'`.

## PR Requirements

- **DCO sign-off** on all commits (`git commit -s`)
- **Cryptographically signed commits** (GPG or SSH — must show "Verified" on GitHub)
- **Conventional Commit PR titles:** `feat:`, `fix:`, `docs:`, `chore:`, etc.
