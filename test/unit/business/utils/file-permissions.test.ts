// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import fs from 'node:fs';
import * as os from 'node:os';
import childProcess from 'node:child_process';
import {FilePermissions} from '../../../../src/business/utils/file-permissions.js';
import {OperatingSystem} from '../../../../src/business/utils/operating-system.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';

describe('FilePermissions', (): void => {
  let isWin32Stub: sinon.SinonStub;
  let chmodStub: sinon.SinonStub;

  beforeEach((): void => {
    isWin32Stub = sinon.stub(OperatingSystem, 'isWin32');
    chmodStub = sinon.stub(fs, 'chmodSync');
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('restrictToOwner on POSIX', (): void => {
    beforeEach((): void => {
      isWin32Stub.returns(false);
    });

    it('should chmod a file to 0600', (): void => {
      FilePermissions.restrictToOwner('/tmp/example/key.pem', false);
      expect(chmodStub.calledOnceWithExactly('/tmp/example/key.pem', 0o600)).to.be.true;
    });

    it('should chmod a directory to 0700', (): void => {
      FilePermissions.restrictToOwner('/tmp/example/keys', true);
      expect(chmodStub.calledOnceWithExactly('/tmp/example/keys', 0o700)).to.be.true;
    });

    it('should propagate a chmod failure', (): void => {
      chmodStub.throws(new Error('EPERM'));
      expect((): void => FilePermissions.restrictToOwner('/tmp/example/key.pem', false)).to.throw('EPERM');
    });
  });

  describe('restrictToOwner on Windows', (): void => {
    beforeEach((): void => {
      isWin32Stub.returns(true);
    });

    it('should not use chmod (ACLs are applied via icacls instead)', (): void => {
      FilePermissions.restrictToOwner(String.raw`C:\solo\keys`, true);
      expect(chmodStub.notCalled).to.be.true;
    });

    it('should be best-effort and never throw when the ACL update fails', (): void => {
      // icacls is unavailable off Windows (and the path does not exist), so the underlying call fails;
      // restrictToOwner must swallow that failure rather than aborting the caller.
      expect((): void => FilePermissions.restrictToOwner(String.raw`C:\solo\keys\missing.pem`, false)).to.not.throw();
    });
  });

  describe('restrictTreeToOwner on Windows', (): void => {
    const username: string = os.userInfo().username;
    const principal: string = process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${username}` : username;
    const targetPath: string = String.raw`C:\solo\cache\podlogs-crd-v1.11.3.yaml`;

    let execFileStub: sinon.SinonStub;

    /** Stub the path type reported to restrictTreeToOwner and the ACL that icacls reads back. */
    function givenWindowsPath(isDirectory: boolean, grantedPrincipal: string = principal): void {
      sinon.stub(fs, 'statSync').returns({isDirectory: (): boolean => isDirectory} as fs.Stats);
      execFileStub.returns(`${targetPath} ${grantedPrincipal}:(F)`);
    }

    beforeEach((): void => {
      isWin32Stub.returns(true);
      execFileStub = sinon.stub(childProcess, 'execFileSync');
    });

    it('should grant a file plain F, never the directory-only (OI)(CI)F', (): void => {
      givenWindowsPath(false);

      FilePermissions.restrictTreeToOwner(targetPath);

      // icacls silently drops an (OI)(CI) grant on a file and still exits 0, so /inheritance:r would
      // leave an empty DACL that denies everyone, including the owner.
      expect(execFileStub.getCall(0).args[1]).to.deep.equal([targetPath, '/grant:r', `${principal}:F`]);
      expect(execFileStub.getCall(1).args[1]).to.deep.equal([targetPath]);
      expect(execFileStub.getCall(2).args[1]).to.deep.equal([targetPath, '/inheritance:r']);
    });

    it('should grant a directory (OI)(CI)F so its children inherit the restriction', (): void => {
      givenWindowsPath(true);

      FilePermissions.restrictTreeToOwner(targetPath);

      expect(execFileStub.getCall(0).args[1]).to.deep.equal([targetPath, '/grant:r', `${principal}:(OI)(CI)F`]);
      expect(execFileStub.getCall(2).args[1]).to.deep.equal([targetPath, '/inheritance:r']);
    });

    it('should leave inheritance intact when the grant did not land', (): void => {
      givenWindowsPath(false, String.raw`SOME\other-principal`);

      FilePermissions.restrictTreeToOwner(targetPath);

      expect(execFileStub.callCount).to.equal(2);
    });

    it('should be best-effort and never throw when icacls fails', (): void => {
      givenWindowsPath(false);
      execFileStub.throws(new Error('icacls not found'));

      expect((): void => FilePermissions.restrictTreeToOwner(targetPath)).to.not.throw();
    });
  });

  describe('isReadable', (): void => {
    // chmod does not deny the owner on Windows, and root ignores mode bits entirely, so the denial case
    // can only be staged as an unprivileged POSIX user.
    const canDenyReads: boolean = process.platform !== 'win32' && process.getuid?.() !== 0;
    let root: string;

    beforeEach((): void => {
      chmodStub.restore(); // these cases exercise real permissions, not a stub
      root = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'file-readable-'));
    });

    afterEach((): void => {
      fs.rmSync(root, {recursive: true, force: true});
    });

    it('should report a readable file as readable', (): void => {
      const readable: string = PathEx.join(root, 'readable.yaml');
      fs.writeFileSync(readable, 'kind: CustomResourceDefinition');

      expect(FilePermissions.isReadable(readable)).to.be.true;
    });

    it('should report a missing file as unreadable', (): void => {
      expect(FilePermissions.isReadable(PathEx.join(root, 'absent.yaml'))).to.be.false;
    });

    // The #5302 shape: the file is present, so existsSync is satisfied, but it cannot be opened. Probing
    // with fs.accessSync would not catch this on Windows, where access ignores ACLs.
    (canDenyReads ? it : it.skip)('should report a present but unopenable file as unreadable', (): void => {
      const poisoned: string = PathEx.join(root, 'poisoned.yaml');
      fs.writeFileSync(poisoned, 'kind: CustomResourceDefinition');
      fs.chmodSync(poisoned, 0o000);

      expect(fs.existsSync(poisoned), 'the file must still exist, or this is not the case under test').to.be.true;
      expect(FilePermissions.isReadable(poisoned)).to.be.false;

      fs.chmodSync(poisoned, 0o600); // restore so the temporary tree can be removed
    });
  });

  describe('restrictTreeToOwner on POSIX', (): void => {
    if (process.platform !== 'win32') {
      it('should clear group-write and all other bits recursively (0755 -> 0750, 0644 -> 0640)', (): void => {
        isWin32Stub.returns(false);
        chmodStub.restore(); // exercise the real chmod against a temporary tree

        const root: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'file-permissions-'));
        const nestedDirectory: string = PathEx.join(root, 'templates');
        const nestedFile: string = PathEx.join(nestedDirectory, 'application.properties');
        fs.mkdirSync(nestedDirectory);
        fs.writeFileSync(nestedFile, 'key=value');
        fs.chmodSync(root, 0o755);
        fs.chmodSync(nestedDirectory, 0o755);
        fs.chmodSync(nestedFile, 0o644);

        FilePermissions.restrictTreeToOwner(root);

        expect(fs.statSync(root).mode & 0o777).to.equal(0o750);
        expect(fs.statSync(nestedDirectory).mode & 0o777).to.equal(0o750);
        expect(fs.statSync(nestedFile).mode & 0o777).to.equal(0o640);

        fs.rmSync(root, {recursive: true, force: true});
      });
    }
  });
});
