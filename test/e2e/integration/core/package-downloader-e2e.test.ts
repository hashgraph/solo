// SPDX-License-Identifier: Apache-2.0

import 'chai-as-promised';

import {it, describe} from 'mocha';
import {expect} from 'chai';

import * as fs from 'fs';
import {PackageDownloader} from '../../../../src/core/package-downloader.js';
import {Templates} from '../../../../src/core/templates.js';
import * as logging from '../../../../src/core/logging.js';
import {Duration} from '../../../../src/core/time/duration.js';

describe('PackageDownloaderE2E', () => {
  const testLogger = logging.NewLogger('debug', true);
  const downloader = new PackageDownloader(testLogger);

  it('should succeed with a valid Hedera release tag', async () => {
    const testCacheDir = 'test/data/tmp';

    const tag = 'v0.42.5';
    const releasePrefix = Templates.prepareReleasePrefix(tag);

    const destPath = `${testCacheDir}/${releasePrefix}/build-${tag}.zip`;
    await expect(downloader.fetchPlatform(tag, testCacheDir)).to.eventually.be.equal(destPath);
    expect(fs.existsSync(destPath)).to.be.ok;
    testLogger.showUser(destPath);
  }).timeout(Duration.ofMinutes(3).toMillis());
});
