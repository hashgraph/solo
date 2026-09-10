// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import fs from 'node:fs';
import * as os from 'node:os';
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
