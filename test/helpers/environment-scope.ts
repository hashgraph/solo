// SPDX-License-Identifier: Apache-2.0

/**
 * Runs a test body with environment variables set, restoring the previous state afterwards.
 *
 * <p>Restores key by key rather than reassigning `process.env`, so anything holding a reference to it —
 * a config source, a spawned-process environment — still sees the same object.
 */
export class EnvironmentScope {
  public static with(variables: Record<string, string>, body: () => Promise<void>): () => Promise<void> {
    return async (): Promise<void> => {
      const saved: NodeJS.ProcessEnv = {...process.env};
      try {
        for (const [key, value] of Object.entries(variables)) {
          process.env[key] = value;
        }
        await body();
      } finally {
        for (const key of Object.keys(variables)) {
          if (key in saved) {
            process.env[key] = saved[key];
          } else {
            delete process.env[key];
          }
        }
      }
    };
  }
}
