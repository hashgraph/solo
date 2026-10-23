// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';

import {resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type NetavarkDependencyManager} from '../../../../src/core/dependency-managers/netavark-dependency-manager.js';
import {type VfkitDependencyManager} from '../../../../src/core/dependency-managers/vfkit-dependency-manager.js';
import {GitHubApiClient} from '../../../../src/core/github-api-client.js';
import {type ReleaseInfo} from '../../../../src/types/index.js';
import * as version from '../../../../version.js';

const DOWNLOAD_BASE_URL: string = 'https://github.com/example/releases/download';

function stubReleases(tagName: string, assets: Record<string, unknown>[]): void {
  sinon
    .stub(GitHubApiClient, 'get')
    .resolves({json: async (): Promise<unknown[]> => [{tag_name: tagName, assets}]} as Response);
}

describe('GitHubReleaseDependencyManager', (): void => {
  let netavark: NetavarkDependencyManager;
  let vfkit: VfkitDependencyManager;

  beforeEach((): void => {
    resetForTest();
    container.register(InjectTokens.OsPlatform, {useValue: 'linux'});
    container.register(InjectTokens.OsArch, {useValue: 'x64'});
    netavark = container.resolve<NetavarkDependencyManager>(InjectTokens.NetavarkDependencyManager);
    vfkit = container.resolve<VfkitDependencyManager>(InjectTokens.VfkitDependencyManager);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should reject a release list that lacks the required tag', async (): Promise<void> => {
    stubReleases('v0.0.1', []);

    await expect(netavark['fetchReleaseInfo'](version.NETAVARK_VERSION)).to.be.rejectedWith(
      `GitHub release not found for tag '${version.NETAVARK_VERSION}'`,
    );
  });

  it('should refuse an asset without a digest when the checksum is verified', async (): Promise<void> => {
    const assetName: string = 'netavark.gz';
    stubReleases(version.NETAVARK_VERSION, [
      {name: assetName, browser_download_url: `${DOWNLOAD_BASE_URL}/${assetName}`},
    ]);

    await expect(netavark['fetchReleaseInfo'](version.NETAVARK_VERSION)).to.be.rejectedWith(
      'Unable to read checksum file',
    );
  });

  it('should fall back to a placeholder checksum when verification is disabled', async (): Promise<void> => {
    stubReleases(version.VFKIT_VERSION, [{name: 'vfkit', browser_download_url: `${DOWNLOAD_BASE_URL}/vfkit`}]);

    const releaseInfo: ReleaseInfo = await vfkit['fetchReleaseInfo'](version.VFKIT_VERSION);

    expect(releaseInfo).to.deep.equal({
      downloadUrl: DOWNLOAD_BASE_URL,
      assetName: 'vfkit',
      checksum: '0'.repeat(64),
      version: version.VFKIT_VERSION.replace(/^v/, ''),
    });
  });

  it('should treat an empty digest like a missing one', async (): Promise<void> => {
    stubReleases(version.VFKIT_VERSION, [
      {name: 'vfkit', browser_download_url: `${DOWNLOAD_BASE_URL}/vfkit`, digest: ''},
    ]);

    const releaseInfo: ReleaseInfo = await vfkit['fetchReleaseInfo'](version.VFKIT_VERSION);

    expect(releaseInfo.checksum).to.equal('0'.repeat(64));
  });
});
