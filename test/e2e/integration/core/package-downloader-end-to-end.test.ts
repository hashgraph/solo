// SPDX-License-Identifier: Apache-2.0

import 'chai-as-promised';

import {it, describe} from 'mocha';
import {expect} from 'chai';

import * as fs from 'node:fs';
import {PackageDownloader} from '../../../../src/core/package-downloader.js';
import {Templates} from '../../../../src/core/templates.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {SoloWinstonLogger} from '../../../../src/core/logging/solo-winston-logger.js';

describe('PackageDownloaderE2E', () => {
  const testLogger = new SoloWinstonLogger('debug', true);
  const downloader = new PackageDownloader(testLogger);

  it('should succeed with a valid Hedera release tag', async () => {
    const testCacheDirectory = 'test/data/tmp';

    const tag = 'v0.42.5';
    const releasePrefix = Templates.prepareReleasePrefix(tag);

    const destinationPath = `${testCacheDirectory}/${releasePrefix}/build-${tag}.zip`;
    await expect(downloader.fetchPlatform(tag, testCacheDirectory)).to.eventually.be.equal(destinationPath);
    expect(fs.existsSync(destinationPath)).to.be.ok;
    testLogger.showUser(destinationPath);
  }).timeout(Duration.ofMinutes(3).toMillis());
});
