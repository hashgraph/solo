# TypeScript Code Style

This document branches from:

- **Google TypeScript Style Guide**: https://google.github.io/styleguide/tsguide.html

It is intended to be a single, standalone reference.

---

## 1. Authority and applicability

### 1.1 Terminology

This guide uses RFC 2119 terminology:

- **must / must not**: required
- **should / should not**: recommended
- **may**: optional
- **prefer / avoid**: correspond to should / should not

### 1.2 Scope

Applies to all source code written in TypeScript and developed with intent to be part of Hiero-Ledger Solo projects.

---

## 2. Source file basics

### 2.1 File encoding: UTF-8

Source files are encoded in UTF-8.

#### 2.1.1 Whitespace characters

Aside from the line terminator sequence, the ASCII horizontal space character (0x20) is the only whitespace character that appears anywhere in a source file. This implies that all other whitespace characters in string literals are escaped.

#### 2.1.2 Special escape sequences

For any character that has a special escape sequence (`\'`, `\"`, `\\`, `\b`, `\f`, `\n`, `\r`, `\t`, `\v`), that sequence is used rather than the corresponding numeric escape (e.g `\x0a`, `\u000a`, or `\u{a}`). Legacy octal escapes are never used.

#### 2.1.3 Non-ASCII characters

For remaining non-ASCII characters, use the actual Unicode character (e.g. `∞`). For non-printable characters, equivalent hex or Unicode escapes (e.g. `\u221e`) can be used along with an explanatory comment.

#### 2.1.4 Column limit: 120

Use **120 characters per line**.

---

## 3. Source file structure

Files consist of the following, in order:

1. Copyright information, if present
2. JSDoc with `@fileoverview`, if present
3. Imports, if present
4. The file’s implementation

Exactly one blank line separates each section that is present.

### 3.1 Copyright information

License or copyright information is **required** in all source code files.

- An **SPDX license identifier** must be present.

### 3.2 `@fileoverview` JSDoc

A file may have a top-level `@fileoverview` JSDoc. If present, it may provide a description of the file's content, its uses, or information about its dependencies. Wrapped lines are not indented.

### 3.3 Imports

There are four variants of import statements in ES6 and TypeScript:

- **module import**: `import * as foo from '...';` (TypeScript imports)
- **named import**: `import {SomeThing} from '...';` (TypeScript imports)
- **default import**: `import SomeThing from '...';` (only for other external code that requires them)
- **side-effect import**: `import '...';` (only to import libraries for their side-effects on load)

#### 3.3.1 Import paths

- TypeScript code must use paths to import other TypeScript code.
- Prefer relative imports (`./foo`) rather than absolute imports (`path/to/foo`) when referring to files within the same logical project.
- Consider limiting deep parent traversals (`../../../`).

#### 3.3.2 Namespace versus named imports

- Prefer **named imports** for frequently used symbols or clear names (e.g. `describe`, `it`).
- Prefer **namespace imports** when using many different symbols from large APIs.

#### 3.3.3 Renaming imports

Prefer resolving name collisions via namespace imports or renaming exports; renaming imports (`import {SomeThing as SomeOtherThing}`) is allowed when needed.

#### 3.3.4 Type-only imports (`import type`)

When every identifier in an import statement is used only as a type (not as a value at runtime),
the `type` modifier **must** be used. This is enforced by the
`@typescript-eslint/consistent-type-imports` ESLint rule at the `error` level.

Use the **inline** form when an import contains a mix of types and values:

```typescript
// All type-only → import type
import type {Facade} from './facade.js';

// Mixed value + type → inline type modifier on the type-only identifiers
import {SomeClass, type SomeInterface} from './some-module.js';
```

`task format` will auto-fix violations automatically.

> **Rationale:** Explicit type imports are erased completely by the TypeScript compiler and help
> bundlers with tree-shaking. They also reduce the risk of circular-dependency issues at runtime
> since modules that contain only type imports do not create a runtime dependency edge.

#### 3.3.5 Path utilities

When working with filesystem path operations in Solo code:

- Prefer `PathEx` from `src/business/utils/path-ex.ts` instead of direct `node:path` imports.
- Do not introduce new direct `path.join(...)`, `path.resolve(...)`, `path.relative(...)`, or `path.basename(...)` calls when a `PathEx` equivalent exists.
- Keep path handling centralized through `PathEx` to preserve consistency and safety guidance in one place.

### 3.4 Exports

#### 3.4.1 Use named exports

Use named exports in all code.

#### 3.4.2 Do not use default exports

Do not use default exports.

#### 3.4.3 Export visibility

Only export symbols used outside of the module. Minimize exported API surface.

Files exporting module-scope behavior functions are unwanted. Do not export implementation helpers, parser details, or
single-call-site glue functions just so another file can reach into a module; keep them private or replace
them with a deliberate, domain-level API.

#### 3.4.4 Mutable exports

Mutable exports can create hard-to-debug code; `export let` is not allowed.

If externally accessible mutable bindings are required, provide explicit getter functions.

#### 3.4.5 Container classes

Do not create container classes with static methods/properties purely for namespacing. Export constants and functions instead.

### 3.5 Exported interfaces and classes in their own file

Each exported interface and class should be in its own file with the file name in kebab-case all lowercase matching the interface/class.

Rationale: helps prevent circular dependencies and makes items easier to find.

---

## 4. Language features

### 4.1 Local variable declarations

#### 4.1.1 Use `const` and `let`

- Always use `const` or `let`.
- Use `const` by default.
- Never use `var`.
- Variables must not be used before their declaration.

#### 4.1.2 One variable per declaration

Do not use `let a = 1, b = 2;`.

### 4.2 Array literals

- Do not use the `Array()` constructor.
- Do not define properties on arrays other than numeric indices and `length`.
- Spread syntax is allowed for shallow copy/concatenation, but only spread iterables.
- Array destructuring is allowed; omit unused elements.

### 4.3 Object literals

- Do not use the `Object` constructor.
- Do not use unfiltered `for (... in ...)` over objects.
- Use `Object.keys`, `Object.values`, `Object.entries` with `for (... of ...)` or filter with `hasOwnProperty`.
- Spread syntax is allowed for shallow copies, but only spread objects (not arrays or primitives).

### 4.4 Classes

#### 4.4.1 Class declarations

- Class declarations must not be terminated with semicolons.
- Class expressions used as statements must end with a semicolon.

#### 4.4.2 Class method declarations

- Do not use semicolons between methods.
- Separate methods by a single blank line.

#### 4.4.3 Static methods

- Avoid private static methods when module-local functions suffice.
- Do not rely on dynamic dispatch of static methods.
- Avoid static `this` references.

#### 4.4.4 Constructors

- Always use parentheses in constructor calls: `new Foo()`.
- Avoid unnecessary constructors.
- Separate constructor from surrounding code by a single blank line.

#### 4.4.5 Class members

- Do not use `#private` fields. Use TypeScript visibility modifiers.
- Use `readonly` for properties not reassigned outside the constructor.
- Prefer parameter properties when appropriate.
- Initialize fields at declaration when possible.

#### 4.4.6 Visibility

- Limit symbol visibility as much as possible.
- TypeScript symbols are public by default.
- Always specify `public`, `private`, and `protected` modifiers.
- Default to `private` first, then relax visibility only when needed.

### 4.5 Functions

- Prefer function declarations for named functions.
- Do not use function expressions; use arrow functions instead.
- Use concise arrow bodies only when the return value is actually used.
- Avoid rebinding `this`; prefer arrow functions and explicit parameters.
- Prefer passing arrow functions as callbacks when higher-order functions might pass unexpected arguments.
- Avoid arrow function properties on classes except for cases like uninstallable event handlers.

### 4.6 `this`

Only use `this` in class constructors/methods, functions with an explicit `this` type, or arrow functions defined where `this` is valid.

### 4.7 Primitive literals

#### 4.7.1 String literals

- Use single quotes.
- Do not use line continuations inside string literals.
- Prefer template literals over complex concatenation.

#### 4.7.2 Number literals

- Use `0x`, `0o`, `0b` lowercase prefixes.
- Never include a leading zero unless it is immediately followed by `x`, `o`, or `b`.

#### 4.7.3 Type coercion

- Use `String()` and `Boolean()` (no `new`), template literals, or `!!` to coerce.
- Do not convert enum values to booleans using `Boolean()`/`!!` or implicit coercion; compare explicitly.
- Use `Number()` to parse numeric values and validate for `NaN`/non-finite values as needed.
- Do not use unary `+` for string-to-number coercion.
- Do not use `parseInt`/`parseFloat` except parsing non-base-10 strings, and validate inputs first.

### 4.8 Control structures

- Always use braced blocks for control flow statements.
- Exception: single-line `if (x) x.doFoo();` is allowed.
- Prefer `for (... of ...)` for arrays.
- `for (... in ...)` is only for dict-style objects and must guard with `hasOwnProperty`.
- Prefer truthy/falsy checks for string presence in conditionals (for example, `if (!localBuildPath)` and `if (app)`), instead of comparing to `''`.

#### 4.8.1 Prefer logical assignment for fallback writes

When assigning a fallback value only when the current value is falsy, prefer `||=` over an `if` block.

```typescript
// Avoid
if (argv[flags.context.name]) {
  argv[flags.context.name] = this.configManager.getFlag<Context>(flags.context);
}

// Prefer
argv[flags.context.name] ||= this.configManager.getFlag<Context>(flags.context);
```

### 4.9 Exception handling

- Instantiate errors using `new Error()`.
- Only throw `Error` (or subclasses).
- Assume caught errors are `Error`; use narrowing when `unknown`.
- Empty catch blocks are strongly discouraged; explain with a comment if truly needed.
- Keep try blocks focused.

### 4.10 Switch statements

- All switches must have a `default` group, and it must be last.
- No fallthrough for non-empty case groups.

### 4.11 Equality checks

- Always use `===` and `!==`.
- Exception: comparison to literal `null` may use `==` or `!=` to cover both `null` and `undefined`.

### 4.12 Type and non-nullability assertions

- Avoid `as` assertions and `!` non-null assertions unless there is an obvious/explicit reason.
- Prefer runtime checks.
- Type assertions must use `as` syntax (not angle brackets).
- For unsafe “double assertions”, cast through `unknown`.
- For object literals, prefer type annotations (`: Foo`) over `as Foo`.

### 4.13 Decorators

- Do not define new decorators.
- Only use framework decorators (e.g. Angular, Polymer).
- No empty lines between a decorator and the decorated symbol.

### 4.14 Disallowed features

- Do not instantiate wrapper objects: `new String`, `new Boolean`, `new Number`.
- Do not rely on Automatic Semicolon Insertion. End statements with semicolons.
- Do not use `const enum`.
- No `debugger` statements.
- Do not use `with`.
- Do not use `eval` or `Function(...string)` except code loaders.
- Do not use non-standard ECMAScript or Web Platform features.
- Never modify built-in objects.

---

## 5. Naming

### 5.1 Identifiers

- Use only ASCII letters, digits, underscores (constants and structured test names), and rarely `$`.

#### 5.1.1 Naming style

- Do not decorate names with type information included in the type.
- Do not use trailing or leading underscores for private properties or methods.
- Exception: underscore prefix is allowed for private variables when using `get` and `set` keywords for getter/setter methods.
- When using the `of` and `from` prefixes for method names:
  - use `of` for simple object creation
  - use `from` for transformation

#### 5.1.2 Descriptive names

Names must be descriptive and clear to new readers. Avoid ambiguous abbreviations and internal-letter deletions.

The `unicorn/prevent-abbreviations` ESLint rule enforces this at the **error** level. Common
violations to avoid:

| Avoid | Use instead |
|---|---|
| `fn` | `function_` (suffix `_` avoids the keyword) |
| `vars` | `variables` |
| `env` / `envVar` | `environment` / `environmentVariable` |
| `cb` | `callback` |
| `err` | `error` |
| `e` (event/error) | `event` / `error` |
| `src` | `source` |
| `dest` / `dst` | `destination` |
| `dir` | `directory` |
| `val` | `value` |
| `prop` | `property` |
| `res` | `result` / `response` |
| `req` | `request` |
| `msg` | `message` |
| `arg` / `args` | `argument` / `arguments_` |
| `num` | `number` |
| `str` | `string_` |
| `buf` | `buffer` |
| `ctx` | `context` |
| `opts` | `options` |
| `cfg` / `conf` | `config` / `configuration` |
| `cmd` | `command` |
| `tmp` | `temporary` |
| `idx` | `index` |
| `len` | `length` |
| `acc` | `accumulator` |
| `cur` / `curr` | `current` |
| `prev` | `previous` |
| `attr` | `attribute` |
| `param` | `parameter` |

The same rule applies to **file names**. For example, a test file must be named
`solo-config-environment-variable-override.test.ts`, not
`solo-config-env-var-override.test.ts`.

#### 5.1.3 Camel case

Treat acronyms as words: `loadHttpUrl`, not `loadHTTPURL`.

### 5.2 Rules by identifier type

- `UpperCamelCase`: class / interface / type / enum / decorator / type parameters / component functions in TSX / JSXElement type parameter
- `lowerCamelCase`: variable / parameter / function / method / property / module alias
- `CONSTANT_CASE`: global constant values, including enum values (see constants section)

#### 5.2.1 Type parameters

Type parameters may use `T` or `UpperCamelCase`.

#### 5.2.2 Test names

xUnit tests may use `_` separators: `testX_whenY_doesZ()`.

#### 5.2.3 `_` prefix/suffix

Identifiers must not use `_` as a prefix or suffix. `_` must not be used as an identifier by itself.

#### 5.2.4 Imports

Namespace imports are `lowerCamelCase` while files may be `snake_case`.

#### 5.2.5 Constants

`CONSTANT_CASE` is for global constants and signals “do not modify”, even if not deeply frozen.

#### 5.2.6 Command flag references

When referencing command flags in code and tests:

- Do not hardcode flag keys as string literals when a `flags` constant exists.
- For config-object keys, use `flags.<flag>.constName` (for example, `[flags.deployment.constName]`).
- For argv/CLI option names, use `flags.<flag>.name` (for example, `argv[flags.deployment.name]`).
- Avoid string literals such as `'deployment'`, `'nodeAliasesUnparsed'`, and `'--deployment'` in places where `flags` constants are available.

---

## 6. Type system

### 6.1 Type inference

- Add explicit types to avoid generics inferring `unknown` (e.g. empty collections).
- Always specify the type for declarations.
  - Rationale: improves readability without an IDE (code review, GitHub, text editor), improves type checking, and can speed compile time.
- This applies equally in test files: every `const` / `let` must carry an explicit type annotation,
  and every callback passed to `describe()` / `it()` / `beforeEach()` / `afterEach()` must declare
  its return type (`: void` for synchronous, `: Promise<void>` for async).

#### 6.1.1 Return types

- Always specify return types.
  - Rationale: readability, stronger checking, and improved compile-time performance.
- Arrow functions passed as callbacks are not exempt. Use `(): void =>` for synchronous callbacks
  and `async (): Promise<void> =>` for asynchronous callbacks:

```typescript
// correct
describe('my suite', (): void => {
  it('my test', (): void => { ... });
  it('async test', async (): Promise<void> => { ... });
  beforeEach(async (): Promise<void> => { ... });
});

// incorrect — missing return types
describe('my suite', () => {
  it('my test', () => { ... });
});
```

### 6.2 `undefined` and `null`

- Use either `undefined` or `null` depending on context.
- Do not bake `|null` or `|undefined` into type aliases.

#### 6.2.1 Prefer optional over `|undefined`

Prefer optional parameters/fields with `?` instead of explicit `|undefined`.

### 6.3 Use structural types

- Use interfaces to define structural types.
- For structural implementations, annotate the type at the declaration site.

### 6.4 Prefer interfaces over type literal aliases

For object types, prefer `interface` over `type` literal alias.

### 6.5 Array type

- Prefer `T[]` and `readonly T[]` for simple element types.
- Use `Array<T>` for complex element types.

### 6.6 Index signatures

- Prefer `Map`/`Set` over `{[k: string]: T}` when possible.
- When using index signatures, provide meaningful key labels.

### 6.7 Mapped and conditional types

May be used, but prefer the simplest construct. Interfaces and explicit property declarations are often easier to understand and maintain.

### 6.8 `any`

Avoid `any`. Prefer:

- a more specific type
- `unknown`
- a documented, suppressed lint warning (e.g. tests)

### 6.9 `{}` type

Avoid `{}` in most cases. Prefer `unknown`, `Record<K, T>`, or `object` depending on intent.

### 6.10 Tuple types

Prefer tuple types for “pair” use-cases, but consider named object properties for readability.

### 6.11 Wrapper types

Do not use `String`, `Boolean`, `Number`, `Object` types. Use `string`, `boolean`, `number`, and appropriate object types.

### 6.12 Return type only generics

Avoid creating APIs with return-type-only generics.

---

## 7. Toolchain requirements

### 7.1 TypeScript compiler

All TypeScript files must pass type checking.

#### 7.1.1 `@ts-ignore`

- Do not use `@ts-ignore` (these are warnings in Hedera systems and are being removed and turned into errors).
- Instead, use `@ts-expect-error` and provide the error being ignored as the description (or a strong explanation).

### 7.2 Conformance

Adhere to applicable conformance rules (e.g. security patterns like avoiding `eval` and unsafe DOM assignment).

---

## 8. Comments and documentation (Google)

### 8.1 JSDoc vs comments

- Use `/** ... */` JSDoc for documentation consumers should read.
- Use `// ...` for implementation comments.

### 8.2 Multi-line comments

Use multiple `//` lines, not `/* */` block comments.

### 8.3 JSDoc formatting

- JSDoc is written in Markdown.
- Use Markdown lists where appropriate.
- Most tags occupy their own line.
- Line-wrapped block tags are indented four spaces.
- Do not indent wrapped `@desc` or `@fileoverview` descriptions.

### 8.4 Document top-level exports

Document exported symbols and anything whose purpose is not obvious.

### 8.5 Do not add redundant JSDoc type annotations

Do not add types in `@param`/`@return` or tags like `@private`, `@override`, etc. when TypeScript keywords already express them.

### 8.6 Parameter name comments at call sites

Use parameter name comments when meaning is unclear:

- `someFunction(obviousParam, /* shouldRender= */ true, /* name= */ 'hello');`

### 8.7 Place documentation prior to decorators

JSDoc must come before decorators; never place JSDoc between decorator and decorated statement.

---

## 9. Policies: consistency and refactoring (Google)

### 9.1 Consistency

If a style question is not settled, follow existing style within the file; otherwise follow directory conventions.

### 9.2 Reformatting existing code

- Do not require full restyling of old files unless significant changes are being made.
- Avoid opportunistic style churn in unrelated CLs.

### 9.3 Deprecation

Use `@deprecated` with clear migration instructions.

### 9.4 Generated code

Generated code is mostly exempt, but identifiers referenced from hand-written code must follow naming requirements.

---

## 10. Design principles

This section complements the syntactic rules above with the design principles the project enforces during code review. Where the rules in §§2–9 say *how* to write a line, this section says *whether the line should exist*.

### 10.1 DRY — Don't Repeat Yourself

Every piece of knowledge — a constant, a computation, an option object, a workflow matrix dimension — should have a single, unambiguous representation in the codebase.

#### 10.1.1 When to extract

- **Two occurrences:** consider extraction. Note it in the PR.
- **Three or more occurrences:** extract. Duplication that has appeared three times will appear a fourth.
- **Two near-identical methods on the same class:** prefer adding a parameter to one method over keeping both. Multiple near-identical methods cause confusion about which to call.

#### 10.1.2 What counts as duplication

- Identical or near-identical blocks of 10+ lines.
- Parallel `if/else` chains or `switch` arms whose only difference is the type token they branch on.
- Multiple call sites computing the same derived value from the same inputs.
- Multiple workflow files whose only difference is a matrix dimension — collapse into a single matrix.
- New method whose body overlaps an existing one by more than the unique slice of behavior — enhance the existing method instead of adding a sibling.

#### 10.1.3 What does **not** count as duplication

- Two methods that happen to read similar but mean different things (e.g., `listNamespaces` and `listPods` both call the K8s API in a similar shape — they are different concepts).
- Test fixtures that are similar by accident — clarity in tests outweighs brevity.
- Configuration that *looks* repeated but represents independent decisions (e.g., two flags that happen to default to `false`).

Premature extraction is also a DRY violation in disguise — see §10.3.5.

#### 10.1.4 Cross-cutting reuse — prefer enhancing existing utilities

Before introducing a new helper, search for an existing one with the same responsibility:

- Path operations → `PathEx` (`src/business/utils/path-ex.ts`). See §3.3.5.
- Kubernetes API error handling → `KubeApiResponse.throwError`.
- Listr task defaults → `constants.LISTR_DEFAULT_OPTIONS.DEFAULT`.
- CLI flag references → `flags.<flag>.constName` / `flags.<flag>.name`. See §5.2.6.
- Custom errors → `SoloError` (or a subclass in `src/core/errors/`).

If the existing utility is close but not quite right, **enhance it** rather than adding a parallel one. Two near-identical APIs is a bigger DRY problem than one slightly-more-flexible API.

### 10.2 SOLID

SOLID applies to TypeScript with one caveat: the project's class-and-static-methods convention (see §3.4.5 in spirit, and the project's broader practice) is the dominant unit of behavior. Apply SOLID at the level of classes, static methods, modules, and **service boundaries** (between Solo, the container images in `solo-containers`, and the docs in `solo-docs`).

#### 10.2.1 Single Responsibility Principle (SRP)

A class, method, or module should have one reason to change.

**Within Solo:**

- A command file orchestrates; computation belongs in `src/core/` services.
- A K8s client wrapper translates errors and shapes responses; it should not embed business logic.
- A resolver (e.g., "what storage class do we use?") should be its own class with its own static method, not inlined into the consumer.

**Across repos (the most common SRP violation in review):**

- **Lifecycle behavior belongs in the container image**, not in Solo's `kubectl exec` strings. If Solo is `touch`ing supervisor files, removing `down` markers, or polling for JVM startup, the responsibility is in the wrong layer — push it into [`solo-containers`](https://github.com/hiero-ledger/solo-containers).
- **Documentation belongs in [`solo-docs`](https://github.com/hiero-ledger/solo-docs)**, not in `docs/site/content/en/docs/`. Files under the in-repo `docs/site/content/` are migrating out; do not invest in them.
- **Version pinning of upstream images** belongs to a release cut of the upstream repo — do not pin `main` to alpha/RC versions whose source isn't on the upstream repo's `main` branch.

When a PR adds Solo code that *compensates* for missing behavior elsewhere, ask: "who should own this?" If the answer is "the image" or "the chart" or "the docs repo", route the fix there.

#### 10.2.2 Open/Closed Principle (OCP)

Code should be open for extension, closed for modification.

In practice: when a new component type, node type, or cluster type is added, the change should plug into existing extension points (registries, lookup tables, discriminated unions) — not require editing every `if/else` chain across the codebase. If you find yourself editing N parallel chains, the chains themselves are the issue (§10.1.2).

#### 10.2.3 Liskov Substitution Principle (LSP)

Subtypes must be usable wherever their supertype is expected without surprising the caller.

In practice:

- Don't override a method to throw `Error('not supported')` — if the type doesn't support the operation, the operation doesn't belong on the parent interface.
- Don't override a method to weaken its postconditions (e.g., parent returns a non-empty list, subtype can return empty silently).
- If a subtype needs different behavior, prefer composition or an explicit capability flag over LSP-violating overrides.

#### 10.2.4 Interface Segregation Principle (ISP)

Clients shouldn't be forced to depend on methods they don't use.

In practice:

- Prefer narrow interfaces (`PodLister`, `PodDeleter`) over fat ones (`PodEverything`) when consumers truly need different slices. But don't pre-split — split when a second consumer with a different need appears (§10.3.5).
- A class with one static method does not need a constructor or injected dependencies — see §4.4.4 and the project's preference for plain static helpers when no state is involved.

#### 10.2.5 Dependency Inversion Principle (DIP)

High-level modules should not depend on low-level modules; both should depend on abstractions.

In practice:

- Commands depend on services via injected interfaces (`tsyringe-neo` + `InjectTokens`), not on concrete implementations.
- A new external system access (a new K8s resource, a new external API) should go through an `integration/` wrapper that exposes a `business/`-shaped interface; consumers depend on the interface.
- Tests should be writable against the interface without standing up the real backend — if a unit test requires a live cluster, the abstraction is leaking.

### 10.3 Practical corollaries

The principles above produce these concrete review rules. Each is enforced in code review with the cited section as the rationale.

#### 10.3.1 No exported functions — use classes with static methods for behavior

Behavior (resolvers, orchestrators, computations) is grouped on a class with static methods. Pure data (constants, types, simple factories) may remain as exports. See §3.4.5 — the prohibition on container classes applies to namespace-only containers; behavior with multiple related methods belongs together on a class.

#### 10.3.2 Helpers used by one class become private methods of that class

If a top-level helper is only called from inside one class, move it inside the class as a `private` (or `private static`) method. Keeps cohesion high and avoids module-level API surface that nobody outside the file uses.

#### 10.3.3 CLI flag descriptions stay generic — flags belong to the whole CLI

Flag descriptions in `src/commands/flags.ts` must not reference a single command, sub-command, or component. The same flag may be used by multiple commands and its description must read sensibly everywhere it appears. This is a special case of SRP: the flag's "reason to change" is the flag's concept, not any one command's wording preference.

#### 10.3.4 Match existing error-handling patterns

Within a layer, all error paths take the same shape. Drift across files in the same module is a DRY violation against an *implicit* shared utility — call it out as such.

#### 10.3.5 Avoid premature abstraction

DRY is about removing **proven** duplication, not anticipating future duplication. A new helper "for symmetry" with code that doesn't yet exist is a YAGNI violation. Wait for the second concrete caller before extracting.

When a feature flag, generic, or interface exists only for a hypothetical second consumer that never materialized, prefer inlining and deleting the abstraction.

#### 10.3.6 Defaults and cascading fallbacks must be complete

When a resolver handles user input, it must articulate the full cascade — typically:

1. User-supplied value (validate against the environment).
2. Environment default (e.g., cluster default `StorageClass`).
3. Auto-detect (e.g., look for a class matching a known provisioner).
4. Bootstrap (install the dependency, then use it).

Don't ship a cascade with one of these missing — backwards compatibility breaks when the user upgrades and their previously-implicit path stops working. See §10.4.

### 10.4 Backwards compatibility

Default behaviors are part of the public contract. Changing what happens when a flag is omitted is a backwards-incompatible change, even when the flag was technically optional before.

- If existing users of the unmodified command relied on the old default, preserve it.
- If a new flag is required, default it to the value that reproduces the old behavior.
- If a removed flag had observable side effects, document the removal in the PR and CHANGELOG and confirm there is no script depending on it.

### 10.5 Cross-platform safety

Solo runs on macOS, Linux, and Windows. Code that only works on POSIX shells is not portable.

- Use `PathEx` for filesystem paths, not `node:path`. See §3.3.5.
- Avoid shelling out from TypeScript when a programmatic alternative exists.
- For `Taskfile.yml` files that the user is expected to run, prefer task-native commands over embedded bash.
- When a Windows-incompatible approach is unavoidable, gate it on `os.platform()` and provide a Windows-native fallback.

### 10.6 Test strategy — push checks down the pyramid

Unit tests are cheap, fast, and run on every change. E2E and nightly tests are slow and expensive. Before adding a new E2E or scheduled job, ask whether the regression you're guarding against can be caught at the unit level with a mocked dependency.

New scheduled workflows must justify the cost: what regression do they catch that the existing matrices don't, and why can't that regression be caught by a unit test?

---

# References

- Google TypeScript Style Guide: https://google.github.io/styleguide/tsguide.html
