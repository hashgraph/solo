const { Client, AccountId, PrivateKey,
  NodeUpdateTransaction,
  Long,
  FileContentsQuery,
  FileId
} = require("@hashgraph/sdk");

const shard = 0;
const realm = 0;

async function main() {
  // Configure your client
  const client = Client.forNetwork({
    "127.0.0.1:50211": AccountId.fromString(`${shard}.${realm}.3`) // Replace with your node account ID
  });

  const genesisKey = PrivateKey.fromStringED25519("302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137");
  client.setOperator(
    AccountId.fromString(`${shard}.${realm}.2`),
    genesisKey
  );

  try {
    let nodeUpdateTx = new NodeUpdateTransaction().setNodeId(new Long(0));
    const newPrivateKey = PrivateKey.generateED25519();

    nodeUpdateTx = nodeUpdateTx.setAdminKey(newPrivateKey.publicKey);
    nodeUpdateTx = nodeUpdateTx.freezeWith(client);
    nodeUpdateTx = await nodeUpdateTx.sign(newPrivateKey);
    const signedTx = await nodeUpdateTx.sign(genesisKey);
    const txResp = await signedTx.execute(client);
    const txReceipt = await txResp.getReceipt(client);
    console.log(txReceipt);
  }
  catch (e) {
    console.error(e);
  }
  process.exit(0);
}

main();