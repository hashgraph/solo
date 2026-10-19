// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync, type SpawnSyncReturns} from 'node:child_process';
import {SoloReleaseTooling} from '../../../scripts/solo-release-tooling.js';

describe('Release Tag Selection (Issue #6234)', (): void => {
  let temporaryDirectory: string | undefined;

  function runGit(argumentsList: string[]): void {
    if (!temporaryDirectory) {
      throw new Error('Temporary directory not initialized');
    }
    const result: SpawnSyncReturns<string> = spawnSync('git', argumentsList, {
      cwd: temporaryDirectory,
      encoding: 'utf8',
      shell: false,
    });
    if (result.status !== 0) {
      throw new Error(`Git command failed (${argumentsList.join(' ')}): ${result.stderr}`);
    }
  }

  beforeEach((): void => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-tag-test-'));
    runGit(['init']);
    runGit(['config', 'user.name', 'Test User']);
    runGit(['config', 'user.email', 'test@example.com']);
    runGit(['commit', '--allow-empty', '-m', 'chore: initial commit']);
  });

  afterEach((): void => {
    if (temporaryDirectory && fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      temporaryDirectory = undefined;
    }
  });

  describe('Static Array Selection', (): void => {
    it('9. A newer TCK tag does not override the latest Solo release tag', (): void => {
      const tags: string[] = ['v0.92.0', 'v0.93.0', 'tck-v1.0.0', 'tckx-v1.0.0', 'v0.94.0-tck.1', 'v0.94.0-tckx.1'];
      const latestTag: string | undefined = SoloReleaseTooling.selectLatestSoloReleaseTag(tags);
      expect(latestTag).to.equal('v0.93.0');
    });

    it('10. Mixed tag histories select the correct latest Solo version', (): void => {
      const tags: string[] = [
        'v0.80.0',
        'nathan-functional-charlie-sphere',
        'v0.81.0',
        'streamModeWorking',
        'tck-v0.5.0',
        'tckx-v0.5.0',
        'v0.93.0',
        'v0.93.0-tck.1',
        'v0.93.0-tckx.1',
      ];
      const latestTag: string | undefined = SoloReleaseTooling.selectLatestSoloReleaseTag(tags);
      expect(latestTag).to.equal('v0.93.0');
    });

    it('11. TCK-only tags do not become Solo last release', (): void => {
      const tags: string[] = ['tck-v0.1.0', 'tckx-v0.1.0', 'v0.1.0-tck', 'tck-v1.0.0', 'tckx-v1.0.0', 'v1.0.0-tck.2'];
      const latestTag: string | undefined = SoloReleaseTooling.selectLatestSoloReleaseTag(tags);
      expect(latestTag).to.be.undefined;
    });

    it('12. No-tag histories are handled safely', (): void => {
      const latestTag: string | undefined = SoloReleaseTooling.selectLatestSoloReleaseTag([]);
      expect(latestTag).to.be.undefined;
    });

    it('13. Malformed tags do not incorrectly become the latest Solo release', (): void => {
      const tags: string[] = ['v1', 'v1.2', 'v1.2.3.4', 'v-invalid', 'custom-tag', 'v0.93.0'];
      const latestTag: string | undefined = SoloReleaseTooling.selectLatestSoloReleaseTag(tags);
      expect(latestTag).to.equal('v0.93.0');

      const onlyMalformed: string[] = ['v1', 'v1.2', 'v1.2.3.4', 'v-invalid'];
      expect(SoloReleaseTooling.selectLatestSoloReleaseTag(onlyMalformed)).to.be.undefined;
    });

    it('14. Version ordering follows semantic version conventions, not lexicographic sort', (): void => {
      // Lexicographically, 'v0.9.0' > 'v0.10.0', but semantically v0.10.0 > v0.9.0
      const tags: string[] = ['v0.9.0', 'v0.10.0', 'v0.2.0'];
      const latestTag: string | undefined = SoloReleaseTooling.selectLatestSoloReleaseTag(tags);
      expect(latestTag).to.equal('v0.10.0');
    });

    it('handles pre-release tags according to SemVer precedence', (): void => {
      const tags: string[] = ['v0.36.0-alpha.1', 'v0.36.0-alpha.2', 'v0.36.0'];
      const latestTag: string | undefined = SoloReleaseTooling.selectLatestSoloReleaseTag(tags);
      expect(latestTag).to.equal('v0.36.0');

      const preReleaseOnly: string[] = ['v0.36.0-alpha.1', 'v0.36.0-alpha.2'];
      expect(SoloReleaseTooling.selectLatestSoloReleaseTag(preReleaseOnly)).to.equal('v0.36.0-alpha.2');
    });
  });

  describe('Isolated Git Repository Tag Queries', (): void => {
    it('selects latest Solo tag in isolated repo with mixed Solo and TCK tags', (): void => {
      runGit(['tag', 'v0.92.0']);
      runGit(['commit', '--allow-empty', '-m', 'feat: something']);
      runGit(['tag', 'v0.93.0']);
      runGit(['commit', '--allow-empty', '-m', 'feat(tck): tck work']);
      runGit(['tag', 'tck-v1.0.0']);
      runGit(['tag', 'tckx-v1.0.0']);
      runGit(['commit', '--allow-empty', '-m', 'feat(tck): more tck work']);
      runGit(['tag', 'v0.94.0-tck.1']);
      runGit(['tag', 'v0.94.0-tckx.1']);

      const latestTag: string | undefined = SoloReleaseTooling.getLatestSoloReleaseTag(temporaryDirectory);
      expect(latestTag).to.equal('v0.93.0');
    });

    it('returns undefined when isolated repo contains only TCK tags', (): void => {
      runGit(['tag', 'tck-v0.1.0']);
      runGit(['tag', 'tckx-v0.1.0']);
      runGit(['commit', '--allow-empty', '-m', 'feat(tck): lane']);
      runGit(['tag', 'v0.2.0-tck']);
      runGit(['tag', 'v0.2.0-tckx']);

      const latestTag: string | undefined = SoloReleaseTooling.getLatestSoloReleaseTag(temporaryDirectory);
      expect(latestTag).to.be.undefined;
    });

    it('returns undefined when isolated repo has no tags at all', (): void => {
      const latestTag: string | undefined = SoloReleaseTooling.getLatestSoloReleaseTag(temporaryDirectory);
      expect(latestTag).to.be.undefined;
    });
  });
});
