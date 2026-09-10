// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {PodmanNetworkHelperDependencyManager} from './podman-network-helper-dependency-manager.js';
import {type PackageDownloader} from '../package-downloader.js';

@injectable()
export class NetavarkDependencyManager extends PodmanNetworkHelperDependencyManager {
  public constructor(
    @inject(InjectTokens.PackageDownloader) downloader: PackageDownloader,
    @inject(InjectTokens.PodmanDependenciesInstallationDirectory) installationDirectory: string,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.NetavarkVersion) netavarkVersion: string,
  ) {
    super(
      patchInject(downloader, InjectTokens.PackageDownloader, NetavarkDependencyManager.name),
      patchInject(
        installationDirectory,
        InjectTokens.PodmanDependenciesInstallationDirectory,
        NetavarkDependencyManager.name,
      ),
      patchInject(osArch, InjectTokens.OsArch, NetavarkDependencyManager.name),
      patchInject(netavarkVersion, InjectTokens.NetavarkVersion, NetavarkDependencyManager.name) ||
        version.NETAVARK_VERSION,
      constants.NETAVARK,
    );
  }
}
