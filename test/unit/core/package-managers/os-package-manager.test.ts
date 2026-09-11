// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, beforeEach, afterEach, describe, it} from 'mocha';
import sinon from 'sinon';
import fs from 'node:fs';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {OsPackageManager} from '../../../../src/core/package-managers/os-package-manager.js';

function buildOsPackageManager(): OsPackageManager {
  return new OsPackageManager();
}

// `available` lists the package-manager binaries present on the simulated system's PATH.
const detectionCases: Array<{name: string; osRelease: string; available: string[]; expectedManager: string}> = [
  {name: 'Fedora', osRelease: 'ID=fedora\nVERSION_ID=40\n', available: ['dnf'], expectedManager: 'DnfPackageManager'},
  {
    name: 'Ubuntu',
    osRelease: 'ID=ubuntu\nID_LIKE=debian\n',
    available: ['apt-get'],
    expectedManager: 'AptGetPackageManager',
  },
  {name: 'Debian', osRelease: 'ID=debian\n', available: ['apt-get'], expectedManager: 'AptGetPackageManager'},
  {
    name: 'openSUSE Leap',
    osRelease: 'ID="opensuse-leap"\nID_LIKE="suse opensuse"\n',
    available: ['zypper'],
    expectedManager: 'ZypperPackageManager',
  },
  {name: 'Arch', osRelease: 'ID=arch\n', available: ['pacman'], expectedManager: 'PacmanPackageManager'},
  {name: 'Alpine', osRelease: 'ID=alpine\n', available: ['apk'], expectedManager: 'ApkPackageManager'},
  {
    name: 'Rocky (matched via ID_LIKE)',
    osRelease: 'ID=rocky\nID_LIKE="rhel centos fedora"\n',
    available: ['dnf'],
    expectedManager: 'DnfPackageManager',
  },
  // The yum-era distributions match the dnf map entries via ID/ID_LIKE but do not ship dnf; the
  // mapped-but-absent manager must fall through to the binary probe and land on yum (#5355).
  {
    name: 'CentOS 7 (maps to dnf, ships only yum)',
    osRelease: 'ID="centos"\nVERSION_ID="7"\nID_LIKE="rhel fedora"\n',
    available: ['yum'],
    expectedManager: 'YumPackageManager',
  },
  {
    name: 'RHEL 7 (maps to dnf, ships only yum)',
    osRelease: 'ID="rhel"\nVERSION_ID="7.9"\n',
    available: ['yum'],
    expectedManager: 'YumPackageManager',
  },
  {
    name: 'Amazon Linux 2 (matches centos/rhel via ID_LIKE, ships only yum)',
    osRelease: 'ID="amzn"\nVERSION_ID="2"\nID_LIKE="centos rhel fedora"\n',
    available: ['yum'],
    expectedManager: 'YumPackageManager',
  },
];

describe('OsPackageManager Linux distribution detection', (): void => {
  before((): void => {
    resetForTest();
  });

  beforeEach((): void => {
    container.register(InjectTokens.OsPlatform, {useValue: 'linux'});
  });

  afterEach((): void => {
    sinon.restore();
  });

  for (const detectionCase of detectionCases) {
    it(`selects ${detectionCase.expectedManager} for ${detectionCase.name}`, (): void => {
      sinon.stub(fs, 'readFileSync').returns(detectionCase.osRelease);
      sinon.stub(fs, 'accessSync').callsFake((probedPath: fs.PathLike): void => {
        if (!detectionCase.available.some((command: string): boolean => String(probedPath).endsWith(command))) {
          throw new Error('not found');
        }
      });
      const osPackageManager: OsPackageManager = buildOsPackageManager();
      expect(osPackageManager.getPackageManager().constructor.name).to.equal(detectionCase.expectedManager);
    });
  }

  it('falls back to probing and selects YumPackageManager when only yum is installed', (): void => {
    sinon.stub(fs, 'readFileSync').returns('ID=amzn\n');
    sinon.stub(fs, 'accessSync').callsFake((probedPath: fs.PathLike): void => {
      if (!String(probedPath).endsWith('yum')) {
        throw new Error('not found');
      }
    });
    const osPackageManager: OsPackageManager = buildOsPackageManager();
    expect(osPackageManager.getPackageManager().constructor.name).to.equal('YumPackageManager');
  });

  it('throws a clear error for an unsupported distribution with no known package manager', (): void => {
    sinon.stub(fs, 'readFileSync').returns('ID=plan9\n');
    sinon.stub(fs, 'accessSync').throws(new Error('not found'));
    expect((): OsPackageManager => buildOsPackageManager()).to.throw(/Unsupported Linux distribution 'plan9'/);
  });
});
