#!/bin/bash

keysDir="${HOME}/.solo/cache/keys"
ids="node0,node1,node2"
validity=36524 # number of days
generate_pfx=false

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

backup_dir="backup/$(date +"%Y-%m-%dT%H_%M_%S")"
dummy_password="password"
s_key_prefix="s" # signing key
a_key_prefix="a" # agreement key

function backup() {
    local pattern="${1}"
    mkdir -p "${backup_dir}"
    mv "${pattern}" "${backup_dir}" 2>/dev/null
}

# make a backup of old *.pem files
backup "*.pem"
backup "*.pfx"

# Generate RSA:3072 key to for signing
function generate_signing_key() {
    local n="${1}"
    local prefix="${2}"

    local s_key="${prefix}-private-${n}.pem"
    local s_csr="${prefix}-csr-${n}.pem"
    local s_cert="${prefix}-public-${n}.pem"
    local s_key_pfx="${prefix}-private-${n}.pfx"
    local s_cert_pfx="${prefix}-public-${n}.pfx"
    local s_friendly_name="${prefix}-${n}"

    echo "------------------------------------------------------------------------------------"
    echo "Generating RSA key and cert for node: ${n}" [ "${prefix}"-key ]
    echo "friendly_name: ${s_friendly_name}"
    echo "key_file: ${s_key}"
    echo "csr_file: ${s_csr}"
    echo "cert_file: ${s_cert}"
    echo "key_pfx: ${s_key_pfx}"
    echo "cert_pfx: ${s_cert_pfx}"
    echo "------------------------------------------------------------------------------------"

    # Generate: s_key, s_csr
    openssl req -new -newkey rsa:3072 -out "${s_csr}" -keyout "${s_key}" -sha384 -nodes -subj "/CN=${s_friendly_name}" || return 1

    # Generate: self-signed s_cert
    openssl x509 -req -in "${s_csr}" -out "${s_cert}" -signkey "${s_key}" -days "${validity}" -sha384 || return 1

    # output s_cert
    echo "------------------------------------------------------------------------------------"
    echo "Generated: ${s_cert}"
    echo "------------------------------------------------------------------------------------"
    openssl x509 -in "${s_cert}" -text -noout

    if [[ "${generate_pfx}" == "true" ]]; then
        generate_pfx_files "${s_key}" "${s_cert}" "${s_key_pfx}" "${s_cert_pfx}" "${friendly_name}"
    fi

    # remove csr
    rm "${s_csr}"

    return 0
}

# Generate keys signed by the s-key
function generate_signed_key() {
    local n="${1}"
    local prefix="${2}"
    local s_key="${3}"
    local s_cert="${4}"


    local key_file="${prefix}-private-${n}.pem"
    local csr_file="${prefix}-csr-${n}.pem"
    local cert_file="${prefix}-public-${n}.pem"
    local key_pfx="${prefix}-private-${n}.pfx"
    local cert_pfx="${prefix}-public-${n}.pfx"
    local friendly_name="${prefix}-${n}"

    echo "------------------------------------------------------------------------------------"
    echo "Generating key and cert for node: ${n}" [ "${prefix}"-key ]
    echo "friendly_name: ${friendly_name}"
    echo "key_file: ${key_file}"
    echo "csr_file: ${csr_file}"
    echo "cert_file: ${cert_file}"
    echo "key_pfx: ${key_pfx}"
    echo "cert_pfx: ${cert_pfx}"
    echo "s_key: ${s_key}"
    echo "s_cert: ${s_cert}"
    echo "------------------------------------------------------------------------------------"

    # generate key
    openssl ecparam -genkey -name secp384r1 -noout -out "${key_file}" || return 1

    # generate csr
    openssl req -new -out "${csr_file}" -key "${key_file}" -subj "/CN=${friendly_name}" || return 1
    echo "------------------------------------------------------------------------------------"
    echo "Generated: ${csr_file}"
    echo "------------------------------------------------------------------------------------"
    openssl req -text -in "${csr_file}"

    # generate cert and verify
    openssl x509 -req -in "${csr_file}" -out  "${cert_file}.tmp" -CA "${s_cert}" -CAkey "${s_key}" -days "${validity}" -sha384 || return 1
    cat "${s_cert}" "${cert_file}.tmp" > "${cert_file}" # combine cert chain
    openssl verify -verbose -purpose sslserver -CAfile "${s_cert}" "${cert_file}"
    rm "${cert_file}.tmp" # remove tmp file

    echo "------------------------------------------------------------------------------------"
    echo "Generated: ${cert_file}" [ including certificate chain ]
    echo "------------------------------------------------------------------------------------"
    openssl storeutl -noout -text -certs "${cert_file}"

    if [[ "${generate_pfx}" == "true" ]]; then
        generate_pfx_files "${key_file}" "${cert_file}" "${key_pfx}" "${cert_pfx}" "${friendly_name}"
    fi

    # remove csr
    rm "${csr_file}"

    return 0
}

function generate_pfx_files() {
    let key_file="${1}"
    let cert_file="${2}"
    let key_pfx="${3}"
    let cert_pfx="${4}"
    let friendly_name="${5}"

    # generate private.pfx
    openssl pkcs12 -export -out "${key_pfx}" -inkey "${key_file}" -in "${cert_file}" -iter 10000 \
        -name "${friendly_name}" -macsaltlen 20 -password pass:"${dummy_password}" || return 1
    echo "------------------------------------------------------------------------------------"
    echo "Generated: ${key_pfx}"
    echo "------------------------------------------------------------------------------------"
    openssl pkcs12 -info -in "${key_pfx}" -passin pass:"${dummy_password}" -passout pass:"${dummy_password}" -nokeys # do not output private key

    # generate public.pfx
    openssl pkcs12 -export -nokeys -out "${cert_pfx}" -in "${cert_file}" -iter 10000 \
        -name "${friendly_name}" -macsaltlen 20 -password pass:"${dummy_password}" -CAfile "${s_cert}" -chain || return 1
    echo "------------------------------------------------------------------------------------"
    echo "Generated: ${cert_pfx}"
    echo "------------------------------------------------------------------------------------"
    #openssl pkcs12 -info -in a-public-node0.pfx -passin pass:password -passout pass:password -nokeys
    openssl pkcs12 -info -in "${cert_pfx}" -passin pass:"${dummy_password}" -passout pass:"${dummy_password}" -nokeys
}

for nm in "${names[@]}"; do
    n="$(echo "${nm}" | tr '[A-Z]' '[a-z]')"
    s_key="${s_key_prefix}-private-${n}.pem"
    s_cert="${s_key_prefix}-public-${n}.pem"

    generate_signing_key "${n}" "${s_key_prefix}" || exit 1
    generate_signed_key "${n}" "${a_key_prefix}" "${s_key}" "${s_cert}" || exit 1

    # Generate node mTLS keys
    openssl req -new -newkey rsa:3072 -out "hedera-${n}.csr" -keyout "hedera-${n}.key" -sha384 -nodes -subj "/CN=${n}" || exit 1
    openssl x509 -req -in "hedera-${n}.csr" -out "hedera-${n}.crt" -signkey "hedera-${n}.key" -days "${validity}" -sha384 || exit 1
    rm -f "hedera-${n}.csr"
done

# display backup dir
echo "Backup dir: ${backup_dir}"
