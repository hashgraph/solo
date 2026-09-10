// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {simpleGit} from 'simple-git';
import {DefaultGitClient} from '../../../../src/integration/git/impl/default-git-client.js';
import {type GitClient} from '../../../../src/integration/git/git-client.js';

describe('DefaultGitClient', (): void => {
  let client: GitClient;
  let temporaryDirectory: string;

  before(async (): Promise<void> => {
    // Create a temp git repo with a tag for testing describeTag
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-git-test-'));
    const git: ReturnType<typeof simpleGit> = simpleGit(temporaryDirectory);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test User');

    // fix failing tests due to local configuration
    await git.addConfig('commit.gpgSign', 'false');
    await git.addConfig('tag.gpgSign', 'false');
    await git.addConfig('tag.forceSignAnnotated', 'false');
    const testFile: string = path.join(temporaryDirectory, 'test.txt');
    fs.writeFileSync(testFile, 'test content');
    await git.add('.');
    await git.commit('initial commit');
    await git.addTag('v1.0.0');
  });

  after((): void => {
    if (temporaryDirectory) {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  });

  beforeEach((): void => {
    client = new DefaultGitClient();
  });

  describe('version', (): void => {
    it('should return a non-empty git version string', async (): Promise<void> => {
      const result: string = await client.version();
      expect(result).to.be.a('string');
      expect(result).to.include('git version');
    });
  });

  describe('describeTag', (): void => {
    it('should return the latest tag for a git repository', async (): Promise<void> => {
      const result: string = await client.describeTag(temporaryDirectory);
      expect(result).to.equal('v1.0.0');
    });

    it('should throw when the directory is not a git repository', async (): Promise<void> => {
      await expect(client.describeTag('/tmp')).to.be.rejected;
    });
  });
});
