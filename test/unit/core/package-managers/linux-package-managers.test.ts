// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, beforeEach, afterEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {resetForTest} from '../../../test-container.js';
import {type LinuxPackageManager} from '../../../../src/core/package-managers/linux-package-manager.js';
import {AptGetPackageManager} from '../../../../src/core/package-managers/apt-get-package-manager.js';
import {DnfPackageManager} from '../../../../src/core/package-managers/dnf-package-manager.js';
import {YumPackageManager} from '../../../../src/core/package-managers/yum-package-manager.js';
import {ZypperPackageManager} from '../../../../src/core/package-managers/zypper-package-manager.js';
import {PacmanPackageManager} from '../../../../src/core/package-managers/pacman-package-manager.js';
import {ApkPackageManager} from '../../../../src/core/package-managers/apk-package-manager.js';

const dependencies: string[] = ['git', 'iptables'];

const managerCases: Array<{
  name: string;
  create: () => LinuxPackageManager;
  install: string[];
  uninstall: string[];
  update: string[];
  upgrade: string[];
  version: string[];
}> = [
  {
    name: 'AptGetPackageManager',
    create: (): LinuxPackageManager => new AptGetPackageManager(),
    install: ['apt-get', 'install', '-y', 'git', 'iptables'],
    uninstall: ['apt-get', 'remove', '-y', 'git', 'iptables'],
    update: ['apt-get', 'update'],
    upgrade: ['apt-get', 'upgrade', '-y', 'git', 'iptables'],
    version: ['apt-get', '--version'],
  },
  {
    name: 'DnfPackageManager',
    create: (): LinuxPackageManager => new DnfPackageManager(),
    // Plain `iptables` on purpose: EL8 ships it literally and has no `iptables-nft`, while
    // Fedora/EL9+ resolve it through `iptables-nft`'s `Provides: iptables` (#5355).
    install: ['dnf', 'install', '-y', 'git', 'iptables'],
    uninstall: ['dnf', 'remove', '-y', 'git', 'iptables'],
    update: ['dnf', 'makecache'],
    upgrade: ['dnf', 'upgrade', '-y', 'git', 'iptables'],
    version: ['dnf', '--version'],
  },
  {
    name: 'YumPackageManager',
    create: (): LinuxPackageManager => new YumPackageManager(),
    install: ['yum', 'install', '-y', 'git', 'iptables'],
    uninstall: ['yum', 'remove', '-y', 'git', 'iptables'],
    update: ['yum', 'makecache'],
    upgrade: ['yum', 'upgrade', '-y', 'git', 'iptables'],
    version: ['yum', '--version'],
  },
  {
    name: 'ZypperPackageManager',
    create: (): LinuxPackageManager => new ZypperPackageManager(),
    install: ['zypper', '--non-interactive', 'install', 'git', 'iptables'],
    uninstall: ['zypper', '--non-interactive', 'remove', 'git', 'iptables'],
    update: ['zypper', '--non-interactive', 'refresh'],
    upgrade: ['zypper', '--non-interactive', 'update', 'git', 'iptables'],
    version: ['zypper', '--version'],
  },
  {
    name: 'PacmanPackageManager',
    create: (): LinuxPackageManager => new PacmanPackageManager(),
    install: ['pacman', '-S', '--noconfirm', 'git', 'iptables'],
    uninstall: ['pacman', '-R', '--noconfirm', 'git', 'iptables'],
    update: ['pacman', '-Sy', '--noconfirm'],
    upgrade: ['pacman', '-S', '--noconfirm', 'git', 'iptables'],
    version: ['pacman', '--version'],
  },
  {
    name: 'ApkPackageManager',
    create: (): LinuxPackageManager => new ApkPackageManager(),
    install: ['apk', 'add', 'git', 'iptables'],
    uninstall: ['apk', 'del', 'git', 'iptables'],
    update: ['apk', 'update'],
    upgrade: ['apk', 'upgrade', 'git', 'iptables'],
    version: ['apk', '--version'],
  },
];

describe('Linux package managers', (): void => {
  before((): void => {
    resetForTest();
  });

  for (const managerCase of managerCases) {
    describe(managerCase.name, (): void => {
      let manager: LinuxPackageManager;
      let sudoRunStub: sinon.SinonStub;
      let runStub: sinon.SinonStub;

      // Sudo-elevated commands are issued as an executable (args[2]) plus an argv array (args[3]) of
      // sudoRun, matching ShellRunner's shell:false contract; rebuild the full argv to assert it.
      const sudoArgv: () => string[] = (): string[] => [
        sudoRunStub.firstCall.args[2],
        ...sudoRunStub.firstCall.args[3],
      ];

      beforeEach((): void => {
        manager = managerCase.create();
        sudoRunStub = sinon.stub(manager, 'sudoRun').resolves([]);
        runStub = sinon.stub(manager, 'run').resolves([]);
      });

      afterEach((): void => {
        sinon.restore();
      });

      it('installs packages with sudo and the correct command', async (): Promise<void> => {
        await manager.installPackages(dependencies);
        expect(sudoRunStub.calledOnce).to.equal(true);
        expect(sudoArgv()).to.deep.equal(managerCase.install);
      });

      it('uninstalls packages with the correct command', async (): Promise<void> => {
        await manager.uninstallPackages(dependencies);
        expect(sudoArgv()).to.deep.equal(managerCase.uninstall);
      });

      it('refreshes the package index with the correct command', async (): Promise<void> => {
        await manager.update();
        expect(sudoArgv()).to.deep.equal(managerCase.update);
      });

      it('upgrades packages with the correct command', async (): Promise<void> => {
        await manager.upgrade(dependencies);
        expect(sudoArgv()).to.deep.equal(managerCase.upgrade);
      });

      it('checks availability without sudo using the version command', async (): Promise<void> => {
        const available: boolean = await manager.isAvailable();
        expect(available).to.equal(true);
        expect([runStub.firstCall.args[0], ...runStub.firstCall.args[1]]).to.deep.equal(managerCase.version);
        expect(sudoRunStub.called).to.equal(false);
      });
    });
  }
});
