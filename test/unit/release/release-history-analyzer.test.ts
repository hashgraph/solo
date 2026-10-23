// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import {spawnSync, type SpawnSyncReturns} from 'node:child_process';
import fs from 'node:fs';
import {SoloReleaseTooling, type CommitHistoryAnalysis} from '../../../scripts/solo-release-tooling.js';

describe('Release History Analyzer (Issue #6234)', (): void => {
  const currentVersion: string = '0.93.0';

  it('15. A TCK-only commit history does not prepare a Solo release', (): void => {
    const commits: string[] = [
      'feat(tck): add js sdk test runner lane',
      'fix(tck): handle container restart',
      'chore(tck): update test configuration',
    ];

    const analysis: CommitHistoryAnalysis = SoloReleaseTooling.analyzeCommitHistory(commits, currentVersion);

    expect(analysis.isTckOnly).to.be.true;
    expect(analysis.shouldPrepareRelease).to.be.false;
    expect(analysis.bumpType).to.equal('none');
    expect(analysis.nextVersion).to.equal(currentVersion);
    expect(analysis.tckCount).to.equal(3);
    expect(analysis.soloFeatureCount).to.equal(0);
    expect(analysis.soloFixCount).to.equal(0);
    expect(analysis.totalSoloCommits).to.equal(0);
  });

  it('16. TCK feature commits do not inflate Solo feature counts', (): void => {
    const commits: string[] = [
      'feat(tck): add lane 1',
      'feat(tck): add lane 2',
      'feat(tck)!: breaking lane 3',
      'feat: add new solo command',
    ];

    const analysis: CommitHistoryAnalysis = SoloReleaseTooling.analyzeCommitHistory(commits, currentVersion);

    expect(analysis.isTckOnly).to.be.false;
    expect(analysis.tckCount).to.equal(3);
    expect(analysis.soloFeatureCount).to.equal(1);
    expect(analysis.bumpType).to.equal('minor');
    expect(analysis.nextVersion).to.equal('0.94.0');
    expect(analysis.shouldPrepareRelease).to.be.true;
  });

  it('17. Mixed histories still calculate Solo changes correctly (TCK feat + Solo fix -> patch)', (): void => {
    const commits: string[] = ['feat(tck): add first test lane', 'fix: restore consensus node connection'];

    const analysis: CommitHistoryAnalysis = SoloReleaseTooling.analyzeCommitHistory(commits, currentVersion);

    expect(analysis.isTckOnly).to.be.false;
    expect(analysis.tckCount).to.equal(1);
    expect(analysis.soloFeatureCount).to.equal(0);
    expect(analysis.soloFixCount).to.equal(1);
    expect(analysis.bumpType).to.equal('patch');
    expect(analysis.nextVersion).to.equal('0.93.1');
    expect(analysis.shouldPrepareRelease).to.be.false;
  });

  it('18. Existing Solo release preparation behavior is preserved (Solo feat -> minor)', (): void => {
    const commits: string[] = [
      'feat: add component compatibility matrix',
      'fix: resolve kubernetes ingress race condition',
      'chore: update documentation',
    ];

    const analysis: CommitHistoryAnalysis = SoloReleaseTooling.analyzeCommitHistory(commits, currentVersion);

    expect(analysis.isTckOnly).to.be.false;
    expect(analysis.tckCount).to.equal(0);
    expect(analysis.soloFeatureCount).to.equal(1);
    expect(analysis.soloFixCount).to.equal(1);
    expect(analysis.bumpType).to.equal('minor');
    expect(analysis.nextVersion).to.equal('0.94.0');
    expect(analysis.shouldPrepareRelease).to.be.true;
  });

  it('unrelated scopes (such as tck-helper) are counted as Solo commits', (): void => {
    const commits: string[] = [
      'feat(tck-helper): helper utility for scripts',
      'feat(network): support custom domain names',
    ];

    const analysis: CommitHistoryAnalysis = SoloReleaseTooling.analyzeCommitHistory(commits, currentVersion);

    expect(analysis.isTckOnly).to.be.false;
    expect(analysis.tckCount).to.equal(0);
    expect(analysis.soloFeatureCount).to.equal(2);
    expect(analysis.bumpType).to.equal('minor');
    expect(analysis.nextVersion).to.equal('0.94.0');
    expect(analysis.shouldPrepareRelease).to.be.true;
  });

  it('handles empty commit history gracefully', (): void => {
    const analysis: CommitHistoryAnalysis = SoloReleaseTooling.analyzeCommitHistory([], currentVersion);

    expect(analysis.isTckOnly).to.be.false;
    expect(analysis.shouldPrepareRelease).to.be.false;
    expect(analysis.bumpType).to.equal('none');
    expect(analysis.nextVersion).to.equal(currentVersion);
  });

  it('a non-TCK breaking fix triggers a minor release bump', (): void => {
    const commits: string[] = ['fix(core)!: change signature of node deployment', 'fix: patch connection retry'];

    const analysis: CommitHistoryAnalysis = SoloReleaseTooling.analyzeCommitHistory(commits, currentVersion);

    expect(analysis.isTckOnly).to.be.false;
    expect(analysis.soloFeatureCount).to.equal(0);
    expect(analysis.soloBreakingCount).to.equal(1);
    expect(analysis.bumpType).to.equal('minor');
    expect(analysis.nextVersion).to.equal('0.94.0');
    expect(analysis.shouldPrepareRelease).to.be.true;
  });

  it('a non-TCK breaking footer triggers a minor release bump', (): void => {
    const commits: string[] = ['fix(network): update port mappings\n\nBREAKING CHANGE: default gossip port changed'];

    const analysis: CommitHistoryAnalysis = SoloReleaseTooling.analyzeCommitHistory(commits, currentVersion);

    expect(analysis.isTckOnly).to.be.false;
    expect(analysis.soloFeatureCount).to.equal(0);
    expect(analysis.soloBreakingCount).to.equal(1);
    expect(analysis.bumpType).to.equal('minor');
    expect(analysis.nextVersion).to.equal('0.94.0');
    expect(analysis.shouldPrepareRelease).to.be.true;
  });

  it('a breaking TCK commit does not cause a minor bump for Solo fix', (): void => {
    const commits: string[] = ['feat(tck)!: breaking test harness change', 'fix: restore connection retry logic'];

    const analysis: CommitHistoryAnalysis = SoloReleaseTooling.analyzeCommitHistory(commits, currentVersion);

    expect(analysis.isTckOnly).to.be.false;
    expect(analysis.tckCount).to.equal(1);
    expect(analysis.soloFeatureCount).to.equal(0);
    expect(analysis.soloBreakingCount).to.equal(0);
    expect(analysis.bumpType).to.equal('patch');
    expect(analysis.nextVersion).to.equal('0.93.1');
    expect(analysis.shouldPrepareRelease).to.be.false;
  });

  // eslint-disable-next-line prefer-arrow-callback
  describe('Skill Bash Script Detection Logic', function (this: Mocha.Suite): void {
    const isWindows: boolean = process.platform === 'win32';
    const gitBashPath: string = String.raw`C:\Program Files\Git\bin\bash.exe`;
    let bashExecutable: string | undefined = 'bash';
    if (isWindows) {
      bashExecutable = fs.existsSync(gitBashPath) ? gitBashPath : undefined;
    }

    function runBashDetection(commits: string, baseVersion: string = '0.93.0'): string {
      const scriptLines: string[] = [
        `CUR="${baseVersion}"`,
        'IFS=. read -r MAJ MIN PAT <<< "${CUR}"',
        `COMMITS="${commits}"`,
        'TCK_ONLY=false',
        'if [[ -n "${COMMITS}" ]] && ! echo "${COMMITS}" | grep -Eiqv \'^[a-zA-Z0-9_.-]+\\(tck\\)!?:\'; then',
        '  TCK_ONLY=true',
        'fi',
        '',
        'if [[ -z "${COMMITS}" ]]; then',
        '  echo "NO_COMMITS"',
        'elif [[ "${TCK_ONLY}" == "true" ]]; then',
        '  echo "TCK_ONLY"',
        "elif echo \"${COMMITS}\" | grep -Eiv '^[a-zA-Z0-9_.-]+\\(tck\\)!?:' | grep -Eq '^([a-zA-Z0-9_.-]+(\\([^)]+\\))?!:|feat(\\([^)]+\\))?:)'; then",
        '  NEXT="${MAJ}.$((MIN + 1)).0"',
        '  echo "MINOR:${NEXT}"',
        'else',
        '  NEXT="${MAJ}.${MIN}.$((PAT + 1))"',
        '  echo "PATCH:${NEXT}"',
        'fi',
      ];
      const result: SpawnSyncReturns<string> = spawnSync(bashExecutable as string, ['-c', scriptLines.join('\n')], {
        encoding: 'utf8',
        shell: false,
      });
      return result.stdout.trim();
    }

    beforeEach(function (this: Mocha.Context): void {
      if (!bashExecutable) {
        // eslint-disable-next-line unicorn/no-this-outside-of-class
        this.skip();
      }
    });

    it('identifies TCK-only history and outputs TCK_ONLY', (): void => {
      const commits: string = 'feat(tck): add test runner\nfix(tck): repair probe';
      expect(runBashDetection(commits)).to.equal('TCK_ONLY');
    });

    it('identifies empty commit history and outputs NO_COMMITS', (): void => {
      expect(runBashDetection('')).to.equal('NO_COMMITS');
    });

    it('identifies unscoped Solo feature and outputs minor version bump', (): void => {
      const commits: string = 'feat: add new CLI command\nfix: handle error';
      expect(runBashDetection(commits)).to.equal('MINOR:0.94.0');
    });

    it('identifies scoped Solo feature and outputs minor version bump', (): void => {
      const commits: string = 'feat(node): add new consensus flag\nfix(network): handle timeout';
      expect(runBashDetection(commits)).to.equal('MINOR:0.94.0');
    });

    it('identifies scoped breaking Solo feature and outputs minor version bump', (): void => {
      const commits: string = 'feat(core)!: redesign container config';
      expect(runBashDetection(commits)).to.equal('MINOR:0.94.0');
    });

    it('identifies scoped breaking Solo fix and outputs minor version bump', (): void => {
      const commits: string = 'fix(core)!: repair container crash on startup';
      expect(runBashDetection(commits)).to.equal('MINOR:0.94.0');
    });

    it('handles mixed history (TCK feat + Solo fix) by computing patch bump', (): void => {
      const commits: string = 'feat(tck): add test lane\nfix: restore network connection';
      expect(runBashDetection(commits)).to.equal('PATCH:0.93.1');
    });

    it('handles unrelated scope (tck-helper) as Solo feature', (): void => {
      const commits: string = 'feat(tck-helper): utility script';
      expect(runBashDetection(commits)).to.equal('MINOR:0.94.0');
    });
  });
}).timeout(60_000);
