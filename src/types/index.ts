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
import type * as x509 from '@peculiar/x509'
import type net from 'net'
import type * as WebSocket from 'ws'
import type crypto from 'crypto'
import type { SoloLogger } from '../core/logging.js'
import type {
  ChartManager, ConfigManager, Helm, K8, KeyManager, PackageDownloader, PlatformInstaller, ProfileManager
} from '../core/index.js'
import type { DependencyManager } from '../core/dependency_managers/index.js'
import type { AccountManager } from '../core/account_manager.js'

export type NodeKeyObject = {
  privateKey: crypto.webcrypto.CryptoKey
  certificate: x509.X509Certificate
  certificateChain: x509.X509Certificates
}

export type PrivateKeyAndCertificateObject = {
  privateKeyFile: string
  certificateFile: string
}

export interface ExtendedNetServer extends net.Server {
  localPort: number
  info: string
}

export type LocalContextObject = {
  reject: (reason?: any) => void
  connection: WebSocket.WebSocket
  errorMessage: string
}

export type AccountIdWithKeyPairObject = {
  accountId: string
  privateKey: string
  publicKey: string
}

export type CommandFlag = {
  constName: string
  name: string
  definition: Definition
}

export type Definition = {
  describe: string
  defaultValue?: (boolean | string | number)
  alias?: string
  type?: string
  disablePrompt?: boolean
}

export interface Opts {
  logger: SoloLogger
  helm: Helm
  k8: K8
  downloader: PackageDownloader
  platformInstaller: PlatformInstaller
  chartManager: ChartManager
  configManager: ConfigManager
  depManager: DependencyManager
  keyManager: KeyManager
  accountManager: AccountManager
  profileManager: ProfileManager
}