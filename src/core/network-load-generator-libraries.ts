// SPDX-License-Identifier: Apache-2.0

import {type Container} from '../integration/kube/resources/container/container.js';

/**
 * Installs the native libraries the network-load-generator image needs at runtime but does not ship.
 * Delete once the image bundles libsodium23 (hiero-ledger/solo#5988, root fix).
 */
export class NetworkLoadGeneratorLibraries {
  // One sh script so the pod is touched by a single exec. apt defaults (IPv6-first, 120 s connect
  // timeout, no retries) let a slow public mirror stall for >10 min; the apt.conf caps that (#5988).
  private static readonly INSTALL_SCRIPT: string = [
    'set -e',
    'if dpkg -s libsodium23 >/dev/null 2>&1; then echo "libsodium23 already installed"; exit 0; fi',
    String.raw`printf 'Acquire::ForceIPv4 "true";\nAcquire::Retries "5";\nAcquire::http::Timeout "30";\n' > /etc/apt/apt.conf.d/99-solo`,
    'apt-get update -q',
    'apt-get install -y libsodium23',
    'apt-get clean -q',
  ].join('; ');

  public static async install(container: Container): Promise<void> {
    await container.execContainer(['sh', '-c', NetworkLoadGeneratorLibraries.INSTALL_SCRIPT]);
  }
}
