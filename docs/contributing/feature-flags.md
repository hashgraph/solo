# Feature Flags

Contributor reference for Solo's feature-flag mechanism: how to add a flag, how to read one, and why it is
wired the way it is. The user-facing environment variable reference lives in the
[solo-docs](https://github.com/hiero-ledger/solo-docs) repository, not here.

A feature flag is a boolean that turns a piece of Solo behaviour on or off without a code change. Use one
for behaviour being rolled out, benchmarked, or kept as an escape hatch. Do not use one for a per-deployment
setting — that is a CLI flag or a plain `SoloConfigSchema` field.

---

## Current flags

| Flag                          | Default | Read at                       | Aliases                                                                      |
| ----------------------------- | ------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `copyWrapsLibraryInParallel`  | `false` | `src/commands/network.ts`     | `EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL`                                    |
| `skipNodePing`                | `false` | `src/core/account-manager.ts` | `SOLO_FF_SKIP_NODE_PING`, `SKIP_NODE_PING`                                   |
| `disableBlockNodeIntegration` | `false` | `src/commands/mirror-node.ts` | `SOLO_FF_DISABLE_BLOCK_NODE_INTEGRATION`, `DISABLE_IMPORTER_SPRING_PROFILES` |
| `enableImageCache`            | `true`  | `src/commands/one-shot/`      | `SOLO_FF_ENABLE_IMAGE_CACHE`, `ENABLE_IMAGE_CACHE`                           |

Every flag also answers to its generated `SOLO_FEATURE_FLAGS_*` name. `copyWrapsLibraryInParallel` is still
experimental, so it carries only an `EXPERIMENTAL_` alias. `enableImageCache` is the one opt-out flag — it
defaults on; new flags default off.

Keep this table in the same commit as the code change.

---

## Adding a flag

1. **Declare it** on `FeatureFlagsSchema` (`src/data/schema/model/solo/feature-flags-schema.ts`): a `public`
   boolean with `@Expose()`, a constructor parameter, and a `?? false` default in the constructor body.
   Default to `false` — a flag that defaults on is an opt-out and needs a reason.
2. **Alias it** with `@EnvironmentAliasRegistry.alias(...)`: `SOLO_FF_<UPPER_SNAKE>` for a standard flag,
   `EXPERIMENTAL_<UPPER_SNAKE>` while experimental. If the behaviour was previously toggled by an ad-hoc
   environment variable, list that legacy name as an extra alias so existing scripts keep working.
3. **Add a getter** on `FeatureFlags` (`src/business/runtime-state/config/solo/feature-flags.ts`) returning
   `this.currentFlags.<flag>`.
4. **Read it** at the branch point (see below) and delete the ad-hoc `getEnvironmentVariable()` read it
   replaces, along with any now-unused constant in `src/core/constants.ts`.
5. **Document it** in the table above; open a companion solo-docs pull request if it is user-facing.
6. **Test it** in `test/unit/data/schema/model/solo/feature-flags-schema.test.ts` and
   `test/unit/data/configuration/impl/feature-flag-environment-override.test.ts`.

The flag's property name generates its environment variable name, so renaming it later is a user-visible
change. Note that `unicorn/prevent-abbreviations` is an ESLint error here — `copyWrapsLibraryInParallel`,
not `copyWrapsLibInParallel`.

---

## Reading a flag

`BaseCommand` already injects the service, so inside a command read the getter directly:

```ts
if (this.featureFlags.skipNodePing) {
  // ...
}
```

Anywhere else, inject the singleton:

```ts
import {type FeatureFlags} from '../business/runtime-state/config/solo/feature-flags.js';

public constructor(
  @inject(InjectTokens.FeatureFlags) private readonly featureFlags?: FeatureFlags,
) {
  this.featureFlags = patchInject(featureFlags, InjectTokens.FeatureFlags, this.constructor.name);
}
```

Read the flag where the behaviour branches, never into a field in a constructor. Reads are cheap, and
reading late is what keeps the value current.

---

## Why flags are not on the `SoloConfig` facade

`SoloConfig` deep-copies the schema in its constructor — it is a snapshot, taken once. `FeatureFlags` is
registered as a DI singleton, so it is constructed during container initialisation, which runs **before**
`main()` calls `ConfigProvider.config().refresh()` to load the configuration sources. A snapshot taken at
that moment would hold the schema constructor defaults forever, whatever the environment said.

`FeatureFlags` therefore holds only the `ConfigProvider` and re-reads on every property access. Memoizing it
would reintroduce the same bug: the provider returns the same `Config` object across `refresh()` with no
invalidation event, so a cache populated before the first refresh would pin every flag to its default. The
same reasoning applies to consumers — do not cache a flag value.

---

## Environment variable names

A flag answers to several names. The first match in this order wins:

| Form                               | When                                                                        | Example                                   |
| ---------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| `SOLO_FEATURE_FLAGS_<UPPER_SNAKE>` | Generated from the property path; always available, highest precedence      | `SOLO_FEATURE_FLAGS_SKIP_NODE_PING`       |
| `SOLO_FF_<UPPER_SNAKE>`            | Readable alias for a standard flag                                          | `SOLO_FF_SKIP_NODE_PING`                  |
| `EXPERIMENTAL_<UPPER_SNAKE>`       | Alias while the flag is experimental                                        | `EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL` |
| legacy name                        | `legacyAlias` preserved when a flag replaces an ad-hoc environment variable | `SKIP_NODE_PING`                          |

The generated form uses `_` for both camelCase word boundaries and schema nesting levels, so every name is a
valid POSIX identifier and can be set with `export`. A name therefore cannot be taken apart again, so the
environment is read forwards: `EnvironmentKeyRegistry` generates the name for every config key the schema
declares and looks each one up, failing fast if two keys would generate the same name. A `SOLO_*` variable
matching no declared key is left alone. The shorter `SOLO_FF_*` aliases remain for convenience.

Never add an alias that merely repeats the generated name — `test/unit/data/key/environment-key-registry.test.ts`
rejects it, along with any name containing a dash.

Aliases resolve in `EnvironmentConfigSource` from `EnvironmentAliasRegistry.aliasMap()`. Declare a supported
spelling with `@EnvironmentAliasRegistry.alias(...)` and a backwards-compatibility-only name with
`@EnvironmentAliasRegistry.legacyAlias(...)`; the table above is ordered by precedence, and that order is
applied explicitly rather than taken from decorator declaration order. An alias may only sit on a
uniquely-typed schema field — a reused type such as `HelmChartSchema` fails fast at startup. Setting two
spellings at once logs a warning naming the one that won.

---

## Flag values

Every config source parses a flag against the type its schema field declares, so a flag holds a real
boolean rather than whatever `JSON.parse` made of the string. Accepted, case-insensitively and ignoring
surrounding whitespace: `true`, `false`, `1`, `0`. Anything else — `yes`, `off`, `2` — is rejected at load
with an error naming the variable or file, rather than being read as truthy.

So `SOLO_FF_SKIP_NODE_PING=false` and `=FALSE` and `=0` all genuinely mean "off", unlike the
`Boolean('false')` reads these flags replaced. An empty or whitespace-only value counts as unset and falls
through to the default. Precedence, lowest to highest: the `FeatureFlagsSchema` constructor default, then a
`resources/config/*.yaml` entry (there is no feature-flag file today), then `~/.solo/solo-config.yaml`,
then the environment variable.

The same rule applies to a flag set in a YAML file, and it matters more there: the `yaml` package reads
YAML 1.2, where `off`, `no` and `yes` are **strings**, not booleans. `skipNodePing: off` is therefore
rejected rather than read as the truthy string `"off"` — which would have switched the flag _on_. Write
`false` (or quote a value the rule accepts, `"0"`).

```yaml
featureFlags:
  skipNodePing: false # correct
  enableImageCache: off # rejected at load: not a valid boolean
```

The check lives in `DeclaredTypeCoercer` (`src/data/key/declared-type-coercer.ts`) and is applied by both
`EnvironmentConfigSource` and `LayeredModelConfigSource`, so a flag cannot mean one thing in the
environment and another in a file.

---

## The `withDefaults()` gotcha

A configuration source carries only the flags actually set, and `class-transformer` blanks every other
`@Expose()`d property to `undefined` rather than keeping the constructor's value. Without
`FeatureFlagsSchema.withDefaults()`, setting any one flag would make every other flag read falsy — so
`SKIP_NODE_PING=true` would also switch the image cache off.

`FeatureFlags.currentFlags` routes every read through `withDefaults()`. If you add a code path that builds a
`FeatureFlagsSchema` from configuration, route it through `withDefaults()` too. Never read the flags
straight off a `plainToInstance` result.

Do not fix this by setting `exposeDefaultValues` globally in `ClassToObjectMapper`: config sources merge by
ordinal and `ReflectAssist.merge` skips only `undefined`/`null`, so a source returning defaults instead of
`undefined` would clobber every value set in `helm-chart-config.yaml` and `tss-config.yaml`.

---

## Promoting and retiring a flag

Experimental to standard:

1. Add a `SOLO_FF_<UPPER_SNAKE>` alias alongside the existing `EXPERIMENTAL_` one.
2. Keep the `EXPERIMENTAL_` alias — developer scripts and CI jobs depend on it.
3. Update the flag table above and the companion solo-docs page.

Retiring: delete the schema property, its constructor parameter, the `FeatureFlags` getter, the aliases, and
the branch the flag guarded, then remove its row above. There is no `resources/config/*.yaml` file for
feature flags, so there is no defaults file to clean up.
