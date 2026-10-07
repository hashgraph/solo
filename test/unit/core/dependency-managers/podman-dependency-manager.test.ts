// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import {container} from 'tsyringe-neo';

import {resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type PodmanDependencyManager} from '../../../../src/core/dependency-managers/index.js';
import {PodmanDependencyManager as PodmanDependencyManagerClass} from '../../../../src/core/dependency-managers/podman-dependency-manager.js';
import {OperatingSystem} from '../../../../src/business/utils/operating-system.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import * as constants from '../../../../src/core/constants.js';
import {SubprocessEnvironment} from '../../../../src/core/subprocess-environment.js';
import {Templates} from '../../../../src/core/templates.js';

/** Creates an empty podman executable in the directory, named as the PATH scan expects on this platform. */
function createPodman(directory: string): string {
  fs.mkdirSync(directory, {recursive: true});
  const podmanPath: string = Templates.localInstallationExecutableForDependency(constants.PODMAN, directory);
  fs.writeFileSync(podmanPath, '');
  fs.chmodSync(podmanPath, 0o755);
  return podmanPath;
}

/** Limits the PATH scan to the given directory. */
function searchPath(directory: string): void {
  sinon.stub(SubprocessEnvironment, 'currentPath').returns(directory);
}

describe('PodmanDependencyManager', (): void => {
  let podmanDependencyManager: PodmanDependencyManager;
  let homeDirectory: string;
  let cacheDirectory: string;
  let configDirectory: string;

  beforeEach((): void => {
    resetForTest();
    homeDirectory = container.resolve<string>(InjectTokens.HomeDirectory);
    cacheDirectory = container.resolve<string>(InjectTokens.CacheDir);
    configDirectory = PathEx.join(homeDirectory, 'config');
    podmanDependencyManager = container.resolve<PodmanDependencyManager>(InjectTokens.PodmanDependencyManager);
    fs.rmSync(configDirectory, {recursive: true, force: true});
  });

  afterEach((): void => {
    sinon.restore();
    fs.rmSync(configDirectory, {recursive: true, force: true});
  });

  describe('toEnvironmentArguments', (): void => {
    it('should turn the environment map into NAME=value pairs', (): void => {
      expect(
        PodmanDependencyManagerClass.toEnvironmentArguments({
          CONTAINERS_CONF: '/solo/config/containers.conf',
          CONTAINERS_REGISTRIES_CONF: '/solo/config/registries.conf',
        }),
      ).to.deep.equal([
        'CONTAINERS_CONF=/solo/config/containers.conf',
        'CONTAINERS_REGISTRIES_CONF=/solo/config/registries.conf',
      ]);
    });

    it('should return an empty list for an empty environment', (): void => {
      expect(PodmanDependencyManagerClass.toEnvironmentArguments({})).to.deep.equal([]);
    });
  });

  describe('containerConfigEnvironment', (): void => {
    // A runtime path guaranteed to exist, used so the freshness check passes.
    const existingRuntimePath: string = process.execPath;

    const writeContainersConfig: (crunPath: string) => void = (crunPath: string): void => {
      fs.mkdirSync(configDirectory, {recursive: true});
      fs.writeFileSync(PathEx.join(configDirectory, 'containers.conf'), `[engine.runtimes]\ncrun = ["${crunPath}"]\n`);
      fs.writeFileSync(
        PathEx.join(configDirectory, 'registries.conf'),
        'unqualified-search-registries = ["docker.io"]\n',
      );
    };

    it('should return the persisted config paths when the files and referenced runtime exist', (): void => {
      sinon.stub(OperatingSystem, 'isLinux').returns(true);
      writeContainersConfig(existingRuntimePath);

      expect(podmanDependencyManager.containerConfigEnvironment()).to.deep.equal({
        CONTAINERS_CONF: PathEx.join(configDirectory, 'containers.conf'),
        CONTAINERS_REGISTRIES_CONF: PathEx.join(configDirectory, 'registries.conf'),
      });
    });

    it('should return empty when the referenced runtime no longer exists (stale config)', (): void => {
      sinon.stub(OperatingSystem, 'isLinux').returns(true);
      writeContainersConfig(PathEx.join(os.tmpdir(), 'solo-nonexistent-crun'));

      expect(podmanDependencyManager.containerConfigEnvironment()).to.deep.equal({});
    });

    it('should return empty when no config has been persisted', (): void => {
      sinon.stub(OperatingSystem, 'isLinux').returns(true);

      expect(podmanDependencyManager.containerConfigEnvironment()).to.deep.equal({});
    });

    it('should return empty off Linux, where podman runs in a VM', (): void => {
      sinon.stub(OperatingSystem, 'isLinux').returns(false);
      writeContainersConfig(existingRuntimePath);

      expect(podmanDependencyManager.containerConfigEnvironment()).to.deep.equal({});
    });
  });

  describe('setupConfig in rootful mode', (): void => {
    let runtimeBinaryDirectory: string;

    beforeEach((): void => {
      sinon.stub(OperatingSystem, 'isLinux').returns(true);

      // A runtime dir with real crun/conmon binaries so the freshness check in
      // containerConfigEnvironment() treats the generated config as usable.
      runtimeBinaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-brew-bin-'));
      fs.writeFileSync(PathEx.join(runtimeBinaryDirectory, 'crun'), '');
      fs.writeFileSync(PathEx.join(runtimeBinaryDirectory, 'conmon'), '');

      const templatesDirectory: string = PathEx.join(cacheDirectory, 'templates', 'podman');
      fs.mkdirSync(templatesDirectory, {recursive: true});
      fs.copyFileSync(
        PathEx.join(constants.RESOURCES_DIR, 'templates', 'podman', 'containers-rootful.conf'),
        PathEx.join(templatesDirectory, 'containers-rootful.conf'),
      );
      fs.copyFileSync(
        PathEx.join(constants.RESOURCES_DIR, 'templates', 'podman', 'registries.conf'),
        PathEx.join(templatesDirectory, 'registries.conf'),
      );
    });

    afterEach((): void => {
      fs.rmSync(runtimeBinaryDirectory, {recursive: true, force: true});
    });

    it('should write containers.conf and registries.conf pointing at the runtime stack', async (): Promise<void> => {
      await podmanDependencyManager.setupConfig(runtimeBinaryDirectory);

      const containersConfig: string = fs.readFileSync(PathEx.join(configDirectory, 'containers.conf'), 'utf8');
      // Build the expected paths with PathEx.join like the implementation, so separators match on Windows CI too.
      expect(containersConfig).to.contain(`crun = ["${PathEx.join(runtimeBinaryDirectory, 'crun')}"]`);
      expect(containersConfig).to.contain(`conmon_path = ["${PathEx.join(runtimeBinaryDirectory, 'conmon')}"]`);
      expect(containersConfig).to.contain(`"${runtimeBinaryDirectory}"`);
      expect(containersConfig).to.not.contain('$CRUN_PATH');
      expect(containersConfig).to.not.contain('$CONMON_PATH');
      expect(containersConfig).to.not.contain('$PODMAN_BINARY_DIR');
      expect(containersConfig).to.not.contain('$HELPER_BINARIES_DIR');

      const registriesConfig: string = fs.readFileSync(PathEx.join(configDirectory, 'registries.conf'), 'utf8');
      expect(registriesConfig).to.contain('unqualified-search-registries = ["docker.io"]');
    });

    it('should expose the generated files through containerConfigEnvironment()', async (): Promise<void> => {
      await podmanDependencyManager.setupConfig(runtimeBinaryDirectory);

      expect(podmanDependencyManager.containerConfigEnvironment()).to.deep.equal({
        CONTAINERS_CONF: PathEx.join(configDirectory, 'containers.conf'),
        CONTAINERS_REGISTRIES_CONF: PathEx.join(configDirectory, 'registries.conf'),
      });
    });

    it('should reject when the runtime binary directory is missing', async (): Promise<void> => {
      await expect(podmanDependencyManager.setupConfig()).to.be.rejectedWith(
        'runtimeBinaryDirectory is required to configure rootful podman',
      );
    });
  });

  describe('setupConfig in virtual-machine mode', (): void => {
    beforeEach((): void => {
      sinon.stub(OperatingSystem, 'isLinux').returns(false);

      const templatesDirectory: string = PathEx.join(cacheDirectory, 'templates', 'podman');
      fs.mkdirSync(templatesDirectory, {recursive: true});
      fs.copyFileSync(
        PathEx.join(constants.RESOURCES_DIR, 'templates', 'podman', 'containers.conf'),
        PathEx.join(templatesDirectory, 'containers.conf'),
      );
    });

    afterEach((): void => {
      SubprocessEnvironment.resetForTesting();
    });

    it('should register CONTAINERS_CONF as session state instead of mutating process.env', async (): Promise<void> => {
      const previousValue: string | undefined = process.env.CONTAINERS_CONF;

      await podmanDependencyManager.setupConfig();

      expect(SubprocessEnvironment.sessionVariable('CONTAINERS_CONF')).to.equal(
        PathEx.join(configDirectory, 'containers.conf'),
      );
      expect(process.env.CONTAINERS_CONF).to.equal(previousValue);
    });
  });

  describe('Homebrew detection', (): void => {
    let temporaryDirectory: string;
    let brewPrefix: string;
    let brewBinaryDirectory: string;
    let cellarBinaryDirectory: string;
    let cellarPodmanPath: string;
    let brewStub: SinonStub;

    beforeEach((): void => {
      // Mirrors a Homebrew install: the real binary lives in the Cellar and <prefix>/bin links to it.
      temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-brew-podman-'));
      brewPrefix = PathEx.join(temporaryDirectory, 'linuxbrew');
      brewBinaryDirectory = PathEx.join(brewPrefix, 'bin');
      cellarBinaryDirectory = PathEx.join(brewPrefix, 'Cellar', 'podman', '5.6.0', 'bin');
      fs.mkdirSync(brewBinaryDirectory, {recursive: true});
      cellarPodmanPath = createPodman(cellarBinaryDirectory);
      brewStub = sinon.stub(podmanDependencyManager, 'run').resolves([brewPrefix]);
    });

    afterEach((): void => {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    });

    // File symlinks need elevated privileges on Windows, and the Homebrew podman flow is Linux-only.
    if (process.platform !== 'win32') {
      it('should treat a podman linked into the brew prefix as Homebrew-managed', async (): Promise<void> => {
        fs.symlinkSync(cellarPodmanPath, PathEx.join(brewBinaryDirectory, PathEx.basename(cellarPodmanPath)));
        searchPath(brewBinaryDirectory);

        expect(await podmanDependencyManager.isBrewManaged()).to.be.true;
        expect(await podmanDependencyManager.getRuntimeBinaryDirectory()).to.equal(brewBinaryDirectory);
      });

      it('should follow a shim outside the brew prefix that links into it', async (): Promise<void> => {
        const shimDirectory: string = PathEx.join(temporaryDirectory, 'usr', 'local', 'bin');
        fs.mkdirSync(shimDirectory, {recursive: true});
        fs.symlinkSync(cellarPodmanPath, PathEx.join(shimDirectory, PathEx.basename(cellarPodmanPath)));
        searchPath(shimDirectory);

        expect(await podmanDependencyManager.isBrewManaged()).to.be.true;
        expect(await podmanDependencyManager.getRuntimeBinaryDirectory()).to.equal(brewBinaryDirectory);
      });
    }

    it('should pair a Cellar-resolved podman with the brew bin directory', async (): Promise<void> => {
      searchPath(cellarBinaryDirectory);

      expect(await podmanDependencyManager.isBrewManaged()).to.be.true;
      expect(await podmanDependencyManager.getRuntimeBinaryDirectory()).to.equal(brewBinaryDirectory);
    });

    it('should resolve a brew prefix that is itself a symlink', async (): Promise<void> => {
      const linkedPrefix: string = PathEx.join(temporaryDirectory, 'linuxbrew-link');
      // A junction needs no privileges on Windows; other platforms ignore the type and create a symlink.
      fs.symlinkSync(brewPrefix, linkedPrefix, 'junction');
      brewStub.resolves([linkedPrefix]);
      searchPath(cellarBinaryDirectory);

      expect(await podmanDependencyManager.isBrewManaged()).to.be.true;
      expect(await podmanDependencyManager.getRuntimeBinaryDirectory()).to.equal(PathEx.join(linkedPrefix, 'bin'));
    });

    it('should pair a podman outside the brew prefix with its own directory', async (): Promise<void> => {
      const bundleDirectory: string = PathEx.join(temporaryDirectory, 'opt', 'podman', 'bin');
      createPodman(bundleDirectory);
      searchPath(bundleDirectory);

      expect(await podmanDependencyManager.isBrewManaged()).to.be.false;
      expect(await podmanDependencyManager.getRuntimeBinaryDirectory()).to.equal(bundleDirectory);
    });

    it('should not treat podman as Homebrew-managed when brew is unavailable', async (): Promise<void> => {
      brewStub.rejects(new Error('spawn brew ENOENT'));
      searchPath(cellarBinaryDirectory);

      expect(await podmanDependencyManager.isBrewManaged()).to.be.false;
      expect(await podmanDependencyManager.getRuntimeBinaryDirectory()).to.equal(cellarBinaryDirectory);
    });

    it('should return undefined without consulting brew when podman is not on the PATH', async (): Promise<void> => {
      searchPath(brewBinaryDirectory);

      expect(await podmanDependencyManager.isBrewManaged()).to.be.false;
      expect(await podmanDependencyManager.getRuntimeBinaryDirectory()).to.be.undefined;
      expect(brewStub.called).to.be.false;
    });

    it('should consult brew --prefix only once', async (): Promise<void> => {
      searchPath(cellarBinaryDirectory);

      await podmanDependencyManager.isBrewManaged();
      await podmanDependencyManager.getRuntimeBinaryDirectory();
      await podmanDependencyManager.getRuntimeBinaryDirectory();

      expect(brewStub.callCount).to.equal(1);
      expect(brewStub.firstCall.args.slice(0, 2)).to.deep.equal(['brew', ['--prefix']]);
    });
  });
});
