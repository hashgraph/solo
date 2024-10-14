import type * as x509 from '@peculiar/x509'
import type net from 'net'
import type * as WebSocket from 'ws'

export interface NodeKeyObject {
  privateKey: CryptoKey
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
