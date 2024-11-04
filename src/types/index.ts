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
import type { SoloLogger } from '../core/logging.ts'
import type {
  ChartManager, ConfigManager, Helm, K8, KeyManager, PackageDownloader, PlatformInstaller,
  ProfileManager, DependencyManager, AccountManager, LeaseManager, CertificateManager
} from '../core/index.ts'
import {LocalConfigRepository} from "../core/config/LocalConfigRepository.ts";

export interface NodeKeyObject {
  privateKey: crypto.webcrypto.CryptoKey
  certificate: x509.X509Certificate
  certificateChain: x509.X509Certificates
}

export interface PrivateKeyAndCertificateObject {
  privateKeyFile: string
  certificateFile: string
}

export interface ExtendedNetServer extends net.Server {
  localPort: number
  info: string
}

export interface LocalContextObject {
  reject: (reason?: any) => void
  connection: WebSocket.WebSocket
  errorMessage: string
}

export interface AccountIdWithKeyPairObject {
  accountId: string
  privateKey: string
  publicKey: string
}

export interface CommandFlag {
  constName: string
  name: string
  definition: Definition
}

export interface Definition {
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
  leaseManager: LeaseManager,
  localConfigRepository: LocalConfigRepository
}
