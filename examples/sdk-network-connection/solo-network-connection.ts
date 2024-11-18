import * as k8s from '@kubernetes/client-node'
import { PrivateKey } from '@hashgraph/sdk'

export const TREASURY_ACCOUNT_ID = '0.0.2'
export const GENESIS_KEY = '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137'

function main() {
  const namespace = 'solo-e2e'
  const labelSelector = 'solo.hedera.com/node-name'
  const kubeConfig= new k8s.KubeConfig()
  kubeConfig.loadFromDefault()
  const kubeClient = kubeConfig.makeApiClient(k8s.CoreV1Api)
  const treasuryAccountId = TREASURY_ACCOUNT_ID
  const treasuryPrivateKey = GENESIS_KEY
  const treasuryPublicKey = PrivateKey.fromStringED25519(treasuryPrivateKey).publicKey

  const serviceList = kubeClient.listNamespacedService(namespace,
      undefined, undefined, undefined, undefined, labelSelector).then(() => {

  }).catch(err => {
    console.log(err)
  })
}
if (require.main === module) {
  main();
}
