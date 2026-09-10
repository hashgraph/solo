// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PodmanDependencyManager} from '../../../../src/core/dependency-managers/podman-dependency-manager.js';

describe('PodmanDependencyManager.writeRuntimeOverride', (): void => {
  let temporaryDirectory: string;
  let podmanBinaryDirectory: string;
  let soloHomeDirectory: string;

  beforeEach((): void => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-podman-runtime-'));
    podmanBinaryDirectory = path.join(temporaryDirectory, 'bin');
    soloHomeDirectory = path.join(temporaryDirectory, 'home');
    fs.mkdirSync(podmanBinaryDirectory, {recursive: true});
  });

  afterEach((): void => {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  it('should pin the crun that sits alongside the podman binary', (): void => {
    const crunPath: string = path.join(podmanBinaryDirectory, 'crun');
    fs.writeFileSync(crunPath, '');

    const overridePath: string | undefined = PodmanDependencyManager.writeRuntimeOverride(
      podmanBinaryDirectory,
      soloHomeDirectory,
    );

    expect(overridePath).to.equal(path.join(soloHomeDirectory, 'config', 'containers-runtime-override.conf'));

    // podman resolves the runtime from this absolute path, so the bundled crun must win over the
    // distribution one that its built-in search order would otherwise pick first.
    const content: string = fs.readFileSync(overridePath, 'utf8');
    expect(content).to.equal(`[engine.runtimes]\ncrun = ["${crunPath.replaceAll('\\', '/')}"]\n`);
  });

  it('should leave the host runtime resolution untouched when podman has no sibling crun', (): void => {
    const overridePath: string | undefined = PodmanDependencyManager.writeRuntimeOverride(
      podmanBinaryDirectory,
      soloHomeDirectory,
    );

    expect(overridePath).to.be.undefined;
    expect(fs.existsSync(path.join(soloHomeDirectory, 'config'))).to.be.false;
  });

  it('should create the config directory when it does not exist yet', (): void => {
    fs.writeFileSync(path.join(podmanBinaryDirectory, 'crun'), '');
    expect(fs.existsSync(soloHomeDirectory)).to.be.false;

    const overridePath: string | undefined = PodmanDependencyManager.writeRuntimeOverride(
      podmanBinaryDirectory,
      soloHomeDirectory,
    );

    expect(fs.existsSync(overridePath)).to.be.true;
  });
});
