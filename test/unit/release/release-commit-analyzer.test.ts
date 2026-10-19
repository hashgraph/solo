// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

interface ReleaseRule {
  breaking?: boolean;
  revert?: boolean;
  type?: string;
  scope?: string | null;
  release?: string | boolean;
}

interface PluginConfig {
  preset?: string;
  releaseRules?: ReleaseRule[];
}

interface ReleasercContent {
  plugins?: Array<string | [string, PluginConfig]>;
}

describe('Release Commit Analyzer (Issue #6234)', (): void => {
  const currentFileName: string = fileURLToPath(import.meta.url);
  const currentDirectory: string = path.dirname(currentFileName);
  const releasercPath: string = path.resolve(currentDirectory, '../../../.releaserc');

  const releasercContent: ReleasercContent = JSON.parse(readFileSync(releasercPath, 'utf8')) as ReleasercContent;
  const commitAnalyzerPlugin: string | [string, PluginConfig] | undefined = releasercContent.plugins?.find(
    (pluginEntry: string | [string, PluginConfig]): boolean => {
      if (Array.isArray(pluginEntry)) {
        return pluginEntry[0] === '@semantic-release/commit-analyzer';
      }
      return pluginEntry === '@semantic-release/commit-analyzer';
    },
  );

  const pluginConfiguration: PluginConfig = Array.isArray(commitAnalyzerPlugin) ? commitAnalyzerPlugin[1] : {};

  const dummyLogger: {log: () => void} = {
    log: (): void => {
      // Intentionally silent during unit tests
    },
  };

  async function analyze(messages: string[]): Promise<string | null> {
    const {analyzeCommits} = await import('@semantic-release/commit-analyzer');
    const commitObjects: Array<{message: string; hash: string}> = messages.map(
      (messageText: string, index: number): {message: string; hash: string} => ({
        message: messageText,
        hash: `test-hash-${index}`,
      }),
    );

    return analyzeCommits(pluginConfiguration, {
      commits: commitObjects,
      logger: dummyLogger,
      cwd: process.cwd(),
    });
  }

  it('1. A TCK-only feature does not trigger a Solo release', async (): Promise<void> => {
    const releaseType: string | null = await analyze(['feat(tck): implement first js sdk test lane']);
    expect(releaseType).to.be.null;
  });

  it('2. A TCK-only fix does not trigger a Solo release', async (): Promise<void> => {
    const releaseType: string | null = await analyze(['fix(tck): resolve test runner timeout issue']);
    expect(releaseType).to.be.null;
  });

  it('3. A breaking TCK commit header does not trigger a Solo release', async (): Promise<void> => {
    const releaseType: string | null = await analyze(['feat(tck)!: redesign runner interface']);
    expect(releaseType).to.be.null;
  });

  it('4. Breaking-change footers do not accidentally trigger a TCK-only Solo release', async (): Promise<void> => {
    const message: string =
      'feat(tck): update test container contracts\n\nBREAKING CHANGE: test container signature modified';
    const releaseType: string | null = await analyze([message]);
    expect(releaseType).to.be.null;
  });

  it('5. A normal Solo feature still triggers a minor release', async (): Promise<void> => {
    const releaseType: string | null = await analyze(['feat: add new consensus command flag']);
    expect(releaseType).to.equal('minor');
  });

  it('6. A normal Solo fix still triggers a patch release', async (): Promise<void> => {
    const releaseType: string | null = await analyze(['fix: retry helm install on network failure']);
    expect(releaseType).to.equal('patch');
  });

  it('7. A normal Solo breaking change retains its minor release impact (unscoped header)', async (): Promise<void> => {
    const releaseType: string | null = await analyze(['feat!: breaking configuration change']);
    expect(releaseType).to.equal('minor');
  });

  it('7b. A normal Solo breaking change retains its minor release impact (scoped header)', async (): Promise<void> => {
    const releaseType: string | null = await analyze(['feat(core)!: change default container settings']);
    expect(releaseType).to.equal('minor');
  });

  it('7c. A normal Solo breaking change retains its minor release impact (breaking footer)', async (): Promise<void> => {
    const message: string = 'feat(node): update node options\n\nBREAKING CHANGE: removed deprecated flag';
    const releaseType: string | null = await analyze([message]);
    expect(releaseType).to.equal('minor');
  });

  it('8. Unrelated scopes retain their existing behavior (e.g. tck-helper)', async (): Promise<void> => {
    const releaseType: string | null = await analyze(['feat(tck-helper): helper utility for scripts']);
    expect(releaseType).to.equal('minor');
  });

  it('8b. Unrelated scopes with breaking change trigger a minor release', async (): Promise<void> => {
    const releaseType: string | null = await analyze(['feat(tck-helper)!: breaking helper change']);
    expect(releaseType).to.equal('minor');
  });

  it('handles mixed history with TCK feature and Solo fix by releasing patch only', async (): Promise<void> => {
    const releaseType: string | null = await analyze([
      'feat(tck): add test suite',
      'fix: resolve kubernetes service port bug',
    ]);
    expect(releaseType).to.equal('patch');
  });

  it('handles mixed history with TCK breaking change and Solo fix by releasing patch only', async (): Promise<void> => {
    const releaseType: string | null = await analyze([
      'feat(tck)!: redesign harness',
      'fix: resolve kubernetes service port bug',
    ]);
    expect(releaseType).to.equal('patch');
  });
}).timeout(60_000);
