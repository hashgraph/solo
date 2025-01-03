/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import 'chai-as-promised';

import {it, describe} from 'mocha';
import {expect} from 'chai';

import * as fs from 'fs';
import {PackageDownloader} from '../../../../src/core/package_downloader.js';
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
