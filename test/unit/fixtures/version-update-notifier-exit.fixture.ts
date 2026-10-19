// SPDX-License-Identifier: Apache-2.0

// Runs as a real, standalone Node process — not imported from a test file. The crash this guards
// against (Windows: `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`) only happens when the
// real process calls `process.exit()` while a network handle from the update check is still
// unwinding; a mocha assertion running `process.exit()` in-process would kill the shared test runner
// instead of exercising that timing, so this fixture is spawned as its own child process from
// test/unit/core/version-update-notifier-exit.test.ts.
import {VersionUpdateNotifier} from '../../../src/core/version-update-notifier.js';

/** `fetchLatestVersion` is private; TypeScript's privacy is erased at runtime, so this reaches it directly. */
interface NotifierInternals {
  fetchLatestVersion(): Promise<string | undefined>;
}

await (VersionUpdateNotifier as unknown as NotifierInternals).fetchLatestVersion();
// Deliberately exits the real process immediately after the fetch settles: that is the exact
// sequence being regression-tested, mirroring solo.ts's own exit-on-completion behavior.
// eslint-disable-next-line unicorn/no-process-exit, n/no-process-exit
process.exit(0);
