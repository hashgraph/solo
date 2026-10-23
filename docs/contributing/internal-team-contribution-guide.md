# Component Version Update Guide for External Teams

This guide explains how external component teams can contribute version updates and where to make related compatibility changes when a component release affects Solo behavior.

It is intended for teams working on:
- Consensus Node
- Mirror Node
- Block Node
- Explorer
- Relay

---

## 1. Sources of truth

When you update a component version in Solo, start with these files.

### Default versions

The main default component versions are defined in:

- `version.ts`

This file contains the default versions used by Solo and also supports environment-variable overrides.
If your team is updating the default version Solo should use, this is the first file to inspect.

### Runtime constants and chart locations

Related chart URLs, chart names, values files, and upgrade migration file locations are defined in:

- `src/core/constants.ts`

Use this file when your change is not only a version bump, but also requires changing:

- Helm chart repository URLs
- chart names
- values file paths
- upgrade migration file paths

### Environment variable documentation

The public environment-variable reference is here:

- <https://github.com/hiero-ledger/solo-docs/blob/main/content/en/docs/advanced-solo-setup/using-environment-variables.md>

If you change a default version or a default chart URL, update this file too and create a solo-docs Pull Request so documentation stays aligned with the code.

### Helm Chart Values Change

Each component has its own Helm chart values file. They are all located in the `/resources` directory.

---

## 2. Where each component is wired into Solo

This section tells you where to look for each component.

---

### Consensus Node

#### Default version source

Start in:

- `version.ts`

#### Main command implementation

Consensus network deployment and upgrade-related logic is centered in:

- `src/commands/network.ts`
- `src/commands/node/*`

#### What to look for

If your release changes how Solo should deploy or upgrade Consensus Node, inspect:

- release tag handling
- feature/version gates
- generated config behavior
- any logic that depends on minimum supported versions

---

### Mirror Node

#### Default version source

Start in:

- `version.ts`

#### Main command implementation

Mirror Node behavior is implemented in:

- `src/commands/mirror-node.ts`

#### What to look for

Inspect this file when your Mirror Node release changes:

- chart version handling
- add/upgrade flags
- chart namespace behavior
- environment variable mapping
- version-specific compatibility behavior

#### Related constants

Also inspect:

- `src/core/constants.ts`

This is especially important if the chart URL or chart metadata changes.

---

### Block Node

#### Default version source

Start in:

- `version.ts`

#### Main command implementation

Block Node command logic lives in:

- `src/commands/block-node.ts`

#### Breaking upgrade handling

Block Node upgrades already use migration planning. The main files are:

- `src/commands/migrations/component-upgrade-rules.ts`
- `resources/component-upgrade-migrations.json`

#### What to look for

Inspect these when your release changes:

- chart version handling
- upgrade behavior
- stateful upgrade strategy
- migration boundaries
- recreate vs in-place upgrade behavior

---

### Explorer

#### Default version source

Start in:

- `version.ts`

#### Main command implementation

Explorer command logic lives in:

- `src/commands/explorer.ts`

#### What to look for

Inspect this file when your Explorer release changes:

- default version handling
- add/upgrade flags
- chart/image version behavior
- values passed during deployment

---

### Relay

#### Default version source

Start in:

- `version.ts`

#### Main command implementation

Relay command logic lives in:

- `src/commands/relay.ts`

This is one of the main files external teams should inspect when contributing Relay-related changes.

#### What to look for

Inspect this file when your Relay release changes:

- release/version flags
- add/upgrade behavior
- values passed to the chart
- compatibility requirements with other components

---

## 3. Minimal version bump workflow

If your component change is only a normal version bump and does not require behavior changes, follow this sequence.

### Step 1: Update the default version

Edit:

- `version.ts`

Update only the constant for your component.

### Step 2: Check whether docs need updating

If the default is documented in the environment reference, update:

- <https://github.com/hiero-ledger/solo-docs/blob/main/content/en/docs/advanced-solo-setup/using-environment-variables.md>

And, create a solo-docs Pull Request so documentation stays aligned with the code.

### Step 3: Check whether chart constants changed

If your release also changes chart location, chart metadata, or values file wiring, update:

- `src/core/constants.ts`

### Step 4: Check whether command code assumes old behavior

Inspect the component command file:

- Consensus Node: `src/commands/network.ts`
- Mirror Node: `src/commands/mirror-node.ts`
- Block Node: `src/commands/block-node.ts`
- Explorer: `src/commands/explorer.ts`
- Relay: `src/commands/relay.ts`

If the new version requires new flags, values, or compatibility logic, update the command implementation accordingly.

---

## 4. When a version bump is **not** enough

A component release often needs more than just changing the default version.

You probably need a code change in Solo when any of the following is true:

- the Helm values schema changed
- required values were renamed
- a chart repository moved
- the component changed ports, service names, or selectors
- a component now requires a new dependency or config value
- upgrade behavior breaks across a specific version boundary
- in-place upgrade is no longer safe
- Solo must pass different values depending on the component version

When this happens, update the relevant command implementation, not just `version.ts`.

---

## 5. Handling breaking upgrade behavior

If your component introduces a breaking upgrade boundary, do not stop at the default version bump.

### Block Node pattern

Solo already includes an upgrade migration mechanism that should be used as the reference pattern:

- `src/commands/migrations/component-upgrade-rules.ts`
- `resources/component-upgrade-migrations.json`

This is the right place to encode upgrade boundaries when chart versions require special migration handling.

### Important rule

If the upgrade path is different from the install path, capture that explicitly in Solo. Do not assume that changing the default version alone is enough.

---

## 6. How to find the right command file quickly

Use this mapping when contributing.

| Component      | Main Solo command file        |
|----------------|-------------------------------|
| Consensus Node | `src/commands/network.ts`     |
| Mirror Node    | `src/commands/mirror-node.ts` |
| Block Node     | `src/commands/block-node.ts`  |
| Explorer       | `src/commands/explorer.ts`    |
| Relay          | `src/commands/relay.ts`       |

Use this second mapping for shared sources of truth.

| Concern                                         | File                                                 |
|-------------------------------------------------|------------------------------------------------------|
| Default component versions                      | `version.ts`                                         |
| Chart URLs / constants / values file references | `src/core/constants.ts`                              |
| Upgrade migration rules implementation          | `src/commands/migrations/component-upgrade-rules.ts` |
| Upgrade migration rule data                     | `resources/component-upgrade-migrations.json`        |
| Environment variable docs                       | solo-docs repo (see above)                           |
| Contributor/developer guide                     | `DEV.md`                                             |

---

## 7. Recommended implementation workflow for external teams

Follow this exact order.

### Step 1: Identify the kind of change

Decide whether your change is:

- only a default version bump
- a version bump plus command behavior changes
- a breaking upgrade requiring migration logic

### Step 2: Update the default version

Edit:

- `version.ts`

### Step 3: Update command behavior if needed

Inspect and update the relevant command file:

- `src/commands/network.ts`
- `src/commands/mirror-node.ts`
- `src/commands/block-node.ts`
- `src/commands/explorer.ts`
- `src/commands/relay.ts`

### Step 4: Update chart/config constants if needed

If chart repo, chart name, or values wiring changed, edit:

- `src/core/constants.ts`

### Step 5: Add migration handling if upgrade behavior changed

If your upgrade is not safe across a version boundary, update:

- `src/commands/migrations/component-upgrade-rules.ts`
- `resources/component-upgrade-migrations.json`

### Step 6: Update documentation

Keep docs aligned with the change:

- <https://github.com/hiero-ledger/solo-docs/blob/main/content/en/docs/advanced-solo-setup/using-environment-variables.md>. And, create a solo-docs Pull Request so documentation stays aligned with the code.
- `DEV.md`

### Step 7: Validate end-to-end

Run the repo validation steps before opening a PR.

---

## 8. Validation and testing

Before you submit a change, validate both code and docs.

### Repo-wide checks

Run from the repository root:

```bash
task check
task format
task test
```
