// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PathEx} from '../../../src/business/utils/path-ex.js';

const fixturePath: string = PathEx.join(
  PathEx.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/version-update-notifier-exit.fixture.ts',
);

describe('VersionUpdateNotifier exit behavior', (): void => {
  // Regression test for #6005: on Windows, a pooled network client whose connection teardown was
  // still unwinding on libuv's thread pool when `process.exit()` fired could abort the whole process
  // with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` instead of exiting cleanly. That
  // code path is gated behind an interactive-TTY check in production, which CI never satisfies, so a
  // regression here would otherwise go undetected until a real user hit it on a real terminal. This
  // spawns the real fetch-then-exit sequence in its own process (mirroring production) so a hang,
  // crash, or non-zero/signal exit fails the build instead of a laptop.
  it('performs the update check and exits cleanly, without a native crash', function (): void {
    // eslint-disable-next-line unicorn/no-this-outside-of-class
    this.timeout(15_000);

    let exitCode: number = -1;
    try {
      execFileSync(process.execPath, ['--import', 'tsx', fixturePath], {
        timeout: 10_000,
        stdio: 'pipe',
      });
      exitCode = 0;
    } catch (error) {
      const failure: {status: number | null; signal: NodeJS.Signals | null; stderr?: Buffer} = error as {
        status: number | null;
        signal: NodeJS.Signals | null;
        stderr?: Buffer;
      };
      // A signal (e.g. SIGABRT) or a non-zero status both indicate the process did not exit cleanly;
      // surface the child's stderr so a failure here is diagnosable without re-running it manually.
      expect.fail(
        `child process did not exit cleanly (status=${failure.status}, signal=${failure.signal}): ` +
          `${failure.stderr?.toString() ?? ''}`,
      );
    }

    expect(exitCode).to.equal(0);
  });
});
