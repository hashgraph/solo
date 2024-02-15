# Generate node gossip key using openssl

There are two scripts to generate node gossip keys in `pkcs12` format (`*.pfx` files) as below:

* `legacy-key-generate.sh`: It generates keys using `keytool` in legacy format where each nodes keys are combined in a single `pfx` file.
* `standard-key-generate.sh`: It generates keys using `openssl` where each private and public keys are separate `pfx` as well as `pem` files

In order to generate keys in PEM format for 3 nodes (`node0,node1,node3`), you may run the script as below:

```
./standard-key-generate.sh node0,node1,node3 <keysDir> 
```

Or,

```
./legacy-key-generate.sh node0,node1,node3 <keysDir> 
```

## Useful commands for reference

* Generate pkcs12 file using keytool

```
keytool -genkeypair -alias "s-node0" -keystore "private-node0.pfx" -storetype "pkcs12" -storepass "password" -dname "cn=s-node0" -keyalg "rsa" -sigalg "SHA384withRSA" -keysize "3072" -validity "36524"
```

* Inspect pkcs12 file using openssl

```
openssl pkcs12 -info -in private-node0.pfx -passin pass:password -passout pass:password
```

* extract private key from .pfx

```
openssl pkcs12 -in a-private-node0.pfx -nocerts -out a-test-key.pem -nodes
```

* Extract only client certificate from .pfx

```
openssl pkcs12 -in a-private-node0.pfx -clcerts -nokeys -out a-test-cert.pem
```

* Extract certificate chain from .pfx

```
openssl pkcs12 -in a-private-node0.pfx -nokeys -out a-test-cert.pem
```
