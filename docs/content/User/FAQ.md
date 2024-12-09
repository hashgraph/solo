### How can I avoid using genesis keys ?

You can run `solo account init` anytime after `solo node start`

### Where can I find the default account keys ?

It is the well known default genesis key [Link](https://github.com/hashgraph/hedera-services/blob/develop/hedera-node/data/onboard/GenesisPrivKey.txt)  

### How do I get the key for an account?

Use the following command to get account balance and private key of the account `0.0.1007`:
```bash
# get account info of 0.0.1007 and also show the private key
solo account get --account-id 0.0.1007 -n solo-e2e --private-key
```

The output would be similar to the following:

```bash
{
 "accountId": "0.0.1007",
 "privateKey": "302e020100300506032b657004220420cfea706dd9ed2d3c1660ba98acf4fdb74d247cce289ef6ef47486e055e0b9508",
 "publicKey": "302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013",
 "balance": 100
}
```
