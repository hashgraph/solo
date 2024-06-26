import {PrivateKey} from "@hashgraph/sdk";
import {ConfigManager, constants, K8, logging, Templates} from "./src/core/index.mjs";
import * as Base64 from "js-base64";
import {flags} from "./src/commands/index.mjs";

export async function main(argv) {
  argv[flags.namespace.name] = 'solo-e2e'
  const logger = logging.NewLogger('debug')
  const configManager = new ConfigManager(logger)

  configManager.update(argv, true)
  let k8 = await new K8(configManager, logger)

  const privateKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY)
  const start = new Date().getTime()

  for (let i = 2000; i < 3000; i++) {
    const index = i.toString()
    const accountSecretCreated = await k8.createSecret(
      'a' + index,
      "solo-e2e", 'Opaque', {
        privateKey: Base64.encode(privateKey.toString()),
        publicKey: Base64.encode(privateKey.publicKey.toString())
      },
      Templates.renderAccountKeySecretLabelObject(index), true)
  }

  const end = new Date().getTime()
  console.log('Time taken: ', end - start)

}

main(process.argv)

// 11 second