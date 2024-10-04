# Node key generation

There are two scripts to generate node gossip keys and grpc TLS keys as below:

* `test/scripts/gen-legacy-keys.sh`: It generates keys using `keytool` in legacy PFX format where each nodes keys are combined into a single `pfx` file.
* `test/scripts/gen-openssl-keys.sh`: It generates keys using `openssl` where each private and public keys are separate `pem` files.

## Usage

In order to generate keys in PEM format for 3 nodes (`node0,node1,node3`), run as below:

```
$ mkdir keys
$ ./gen-openssl-keys.sh node0,node1,node3 ./keys
```

View the certificate using command below:

```
$ ls keys 
a-private-node0.pem a-public-node0.pem  backup              hedera-node0.crt    hedera-node0.key    s-private-node0.pem s-public-node0.pem
$ openssl x509 -in keys/s-public-node0.pem -noout -text
Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number:
            6d:df:e0:3c:a9:4c:ed:a0:95:a5:77:2a:74:92:29:93:1d:72:87:41
        Signature Algorithm: sha384WithRSAEncryption
        Issuer: CN=s-node0
        Validity
            Not Before: Oct  2 02:27:21 2024 GMT
            Not After : Oct  2 02:27:21 2124 GMT
        Subject: CN=s-node0
        Subject Public Key Info:
            Public Key Algorithm: rsaEncryption
                Public-Key: (3072 bit)
                Modulus:
                    00:98:1b:2c:ad:c0:24:de:d5:14:1c:ec:4c:c6:7b:
                    63:f9:c9:24:85:27:ec:ed:c3:35:22:2e:cb:d3:81:
                    c2:58:27:3e:d3:bb:f1:3c:7f:ba:fd:ba:b1:63:26:
                    57:d0:db:cf:71:40:24:92:2f:fc:2e:cb:5f:c8:e6:
                    ab:c1:48:87:23:2e:0d:c8:10:6d:5f:ca:3f:1d:e9:
                    c2:5a:45:87:87:61:44:1b:96:8f:36:50:25:80:47:
                    80:cb:40:63:33:7a:c1:da:fd:ec:59:1b:0a:11:ee:
                    08:b7:1f:77:16:06:69:b1:1a:88:fd:da:9c:ce:74:
                    f9:7c:6c:c8:9e:11:32:6b:42:74:c7:ec:c0:24:ac:
                    a7:b9:b3:83:2b:f8:8c:4c:2f:7a:0f:3c:4d:d1:f9:
                    8f:98:98:b6:ec:13:06:8e:d7:be:f9:5c:42:81:8b:
                    06:9c:55:dc:2a:e7:d1:f8:dd:f3:fd:7c:3c:ce:4e:
                    91:4a:a3:2b:70:26:65:58:19:35:52:68:99:ef:37:
                    6c:32:73:0a:4c:5a:b3:17:b3:3b:17:39:12:c1:0e:
                    4e:24:4d:32:9d:54:5b:a0:0c:f1:18:43:0d:70:61:
                    1c:3b:aa:13:57:5b:13:47:e6:65:61:65:20:8e:f2:
                    5f:8f:e0:dd:84:f0:d4:4f:2e:77:a3:cd:6b:6c:58:
                    bd:e7:8b:f6:b0:a4:80:27:f5:3d:67:ac:44:9f:17:
                    95:9c:d7:12:96:e9:ad:5d:2b:ee:90:75:19:c3:7a:
                    52:05:df:ad:94:e7:da:4d:d3:4b:62:d9:b7:44:7c:
                    e6:6b:b2:0e:44:db:69:81:aa:64:88:b8:a3:9c:d5:
                    c3:b1:88:ba:85:db:58:bc:ec:d8:f7:4a:db:d3:0e:
                    5e:28:d3:ab:8d:69:6c:25:01:45:61:1d:7a:68:6f:
                    ad:e2:81:e9:34:c3:94:29:b8:7e:77:8d:fd:eb:1b:
                    38:1f:86:d0:bd:aa:db:2f:e2:4f:7d:05:52:3d:25:
                    96:27:aa:67:a7:c8:5d:17:3b:d7
                Exponent: 65537 (0x10001)
        X509v3 extensions:
            X509v3 Subject Key Identifier: 
                BA:25:24:4E:2C:94:2E:7B:B0:40:05:3C:4C:EC:F5:9F:AE:02:B2:A6
    Signature Algorithm: sha384WithRSAEncryption
    Signature Value:
        34:e7:0c:0d:c8:de:5d:50:ca:ca:78:b5:b5:af:38:24:9e:99:
        0d:c9:d5:da:2c:c7:63:20:fa:26:41:c6:4c:9b:ca:71:8c:e2:
        19:f1:22:87:92:1a:0d:c3:6a:87:69:90:45:33:e9:06:93:75:
        d0:56:8b:84:b8:61:7d:6c:09:3b:37:b6:c9:46:e8:bd:97:bc:
        d8:9f:ff:c8:07:13:85:e7:42:31:12:f7:ea:38:87:81:2f:48:
        5c:a5:96:67:d6:52:df:f9:e1:54:d5:42:cc:5c:49:33:27:15:
        55:9a:4f:29:e6:90:f5:8e:6e:bf:b7:c1:1d:1f:b1:bd:65:05:
        55:57:72:0e:31:b8:32:31:04:98:ad:1d:6e:0d:9d:46:87:36:
        6e:6c:24:9e:dc:f4:3b:0f:ec:9b:09:d4:97:13:3c:83:2e:65:
        4a:cc:29:95:76:fa:7a:2e:1e:ad:03:e3:a7:36:29:9b:31:21:
        00:02:59:82:c4:f6:a0:fc:07:cf:0f:20:13:6b:12:78:01:e7:
        00:68:55:ed:e5:a8:6c:ae:64:15:8f:c9:f8:7e:4f:1d:00:34:
        f0:1d:60:d1:c5:9f:47:05:1a:45:8a:50:a8:69:3a:6c:d9:2f:
        a6:ed:0c:f7:cf:38:b6:24:8b:14:c0:b1:f0:12:75:f0:0c:a9:
        d3:91:0f:0c:52:b1:7f:5e:6b:59:9f:ab:68:56:ed:a9:ff:ac:
        28:9d:f7:04:88:41:e2:8f:57:52:15:f8:35:44:77:fb:c8:13:
        73:38:c0:19:8d:3d:ab:41:f3:5f:75:d9:19:b7:15:b1:63:7e:
        94:ec:44:08:21:2e:2d:5c:c8:f2:f3:cc:61:c8:f9:48:65:1f:
        39:b8:d4:3c:96:1e:df:dc:83:d1:0c:e7:e5:41:d5:f9:58:8a:
        7d:8c:6e:04:da:de:e1:30:76:e0:54:60:62:da:bd:a6:79:81:
        0a:01:26:d2:22:cf:82:5e:1b:4c:7e:da:2a:32:2a:5d:89:c5:
        8d:ce:22:9a:37:33
```

### Useful commands for reference

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
