#!/usr/bin/env bash
#
# Copyright 2016-2022 Hedera Hashgraph, LLC
#
# This software is the confidential and proprietary information of
# Hedera Hashgraph, LLC. ("Confidential Information"). You shall not
# disclose such Confidential Information and shall use it only in
# accordance with the terms of the license agreement you entered into
# with Hedera Hashgraph.
#
# HEDERA HASHGRAPH MAKES NO REPRESENTATIONS OR WARRANTIES ABOUT THE SUITABILITY OF
# THE SOFTWARE, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
# TO THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
# PARTICULAR PURPOSE, OR NON-INFRINGEMENT. HEDERA HASHGRAPH SHALL NOT BE LIABLE FOR
# ANY DAMAGES SUFFERED BY LICENSEE AS A RESULT OF USING, MODIFYING OR
# DISTRIBUTING THIS SOFTWARE OR ITS DERIVATIVES.
#

keysDir="${HOME}/.solo/cache/keys"
ids="node0,node1,node2"
validity=36524 # number of days

if [ "$#" -gt 0 ]; then
    ids="${1}"
fi

if [ "$#" -eq 2 ]; then
    keysDir="${2}"
fi

if [ "$#" -eq 3 ]; then
    validity="${3}"
fi

mkdir -p "${keysDir}"
cd "${keysDir}"

IFS=',' read -ra names <<< "${ids}"
echo "KeyDir: ${keysDir}"
echo "Node Names: ${names[*]}"

mkdir unused 2>/dev/null
mv ./*.pfx unused 2>/dev/null
rmdir unused 2>/dev/null

for nm in "${names[@]}"; do
  n="$(echo "${nm}" | tr '[A-Z]' '[a-z]')"
  keytool -genkeypair -alias "s-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password" -dname "cn=s-$n" -keyalg "rsa" -sigalg "SHA384withRSA" -keysize "3072" -validity "${validity}"
  keytool -genkeypair -alias "a-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password" -dname "cn=a-$n" -keyalg "ec" -sigalg "SHA384withECDSA" -groupname "secp384r1" -validity "${validity}"
  keytool -genkeypair -alias "e-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password" -dname "cn=e-$n" -keyalg "ec" -sigalg "SHA384withECDSA" -groupname "secp384r1" -validity "${validity}"

  keytool -certreq -alias "a-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password" |
    keytool -gencert -alias "s-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password" -validity "${validity}" |
    keytool -importcert -alias "a-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password"

  keytool -certreq -alias "e-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password" |
    keytool -gencert -alias "s-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password" -validity "${validity}" |
    keytool -importcert -alias "e-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password"

  keytool -exportcert -alias "s-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password" |
    keytool -importcert -alias "s-$n" -keystore "public.pfx" -storetype "pkcs12" -storepass "password" -noprompt

  keytool -exportcert -alias "a-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password" |
    keytool -importcert -alias "a-$n" -keystore "public.pfx" -storetype "pkcs12" -storepass "password" -noprompt

  keytool -exportcert -alias "e-$n" -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password" |
    keytool -importcert -alias "e-$n" -keystore "public.pfx" -storetype "pkcs12" -storepass "password" -noprompt

  echo "---------------------------------------------------------------------------------------------------------------"
  echo "Generated private key of node '${n}': ${keysDir}/private-$n.pfx"
  echo "---------------------------------------------------------------------------------------------------------------"
  keytool -list -keystore "private-$n.pfx" -storetype "pkcs12" -storepass "password"

  # Generate node mTLS keys
  openssl req -new -newkey rsa:3072 -out "hedera-${n}.csr" -keyout "hedera-${n}.key" -sha384 -nodes -subj "/CN=${n}" || exit 1
  openssl x509 -req -in "hedera-${n}.csr" -out "hedera-${n}.crt" -signkey "hedera-${n}.key" -days "${validity}" -sha384 || exit 1
  rm -f "hedera-${n}.csr"
done

echo "---------------------------------------------------------------------------------------------------------------"
echo "Generated public keys: ${keysDir}/public.pfx"
echo "---------------------------------------------------------------------------------------------------------------"
keytool -list -keystore "public.pfx" -storetype "pkcs12" -storepass "password"
ls

