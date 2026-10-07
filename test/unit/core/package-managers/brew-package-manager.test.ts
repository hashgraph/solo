// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import {type SinonStub} from 'sinon';
import sinon from 'sinon';
import {expect} from 'chai';
import {describe, it, afterEach} from 'mocha';
import {BrewPackageManager} from '../../../../src/core/package-managers/brew-package-manager.js';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {SubprocessEnvironment} from '../../../../src/core/subprocess-environment.js';

describe('BrewPackageManager', (): void => {
  afterEach((): void => {
    sinon.restore();
    SubprocessEnvironment.resetForTesting();
  });

  it('install registers the brew shellenv variables and PATH directories as session state', async (): Promise<void> => {
    const previousPath: string = process.env.PATH ?? '';
    const previousHomebrewPrefix: string | undefined = process.env.HOMEBREW_PREFIX;
    const runStub: SinonStub = sinon
      .stub(ShellRunner.prototype, 'run')
      .callsFake(async (_command: string, arguments_: string[] = []): Promise<string[]> => {
        if (arguments_[0] === 'shellenv') {
          return [
            'export HOMEBREW_PREFIX="/home/linuxbrew/.linuxbrew";',
            'export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin${PATH+:$PATH}";',
          ];
        }
        return [];
      });

    const packageManager: BrewPackageManager = new BrewPackageManager();
    const available: boolean = await packageManager.install();

    expect(available).to.be.true;
    expect(runStub.called).to.be.true;
    expect(SubprocessEnvironment.sessionVariable('HOMEBREW_PREFIX')).to.equal('/home/linuxbrew/.linuxbrew');
    expect(SubprocessEnvironment.currentPath()).to.equal(
      ['/home/linuxbrew/.linuxbrew/bin', '/home/linuxbrew/.linuxbrew/sbin', previousPath].join(path.delimiter),
    );
    // The global process environment must remain untouched.
    expect(process.env.PATH).to.equal(previousPath);
    expect(process.env.HOMEBREW_PREFIX).to.equal(previousHomebrewPrefix);
  });
});
