#!/bin/bash
# This script fetch the build.zip file and checksum file from builds.hedera.com and then extract it into HapiApp2 directory
# Usage extract-platform <release-version>
# e.g. extract-platform v0.42.5

readonly tag="${1}"
if [ -z "${tag}" ]; then
    echo "Release tag is required (e.g. v0.42.5)";
    exit 1
fi

readonly HAPI_DIR=/opt/hgcapp/services-hedera/HapiApp2.0
readonly HEDERA_USER_HOME_DIR=/home/hedera
readonly HEDERA_BUILDS_URL='https://builds.hedera.com'
readonly RELEASE_DIR="$(awk -F'.' '{print $1"."$2}' <<< "${tag}")"
readonly BUILD_ZIP_FILE="${HEDERA_USER_HOME_DIR}/build-${tag}.zip"
readonly BUILD_ZIP_URL="${HEDERA_BUILDS_URL}/node/software/${RELEASE_DIR}/build-${tag}.zip"
readonly CHECKSUM_FILE="${HEDERA_USER_HOME_DIR}/build-${tag}.sha384"
readonly CHECKSUM_URL="${HEDERA_BUILDS_URL}/node/software/${RELEASE_DIR}/build-${tag}.sha384"

# download
echo "Downloading ${BUILD_ZIP_URL}"
[ -f "${BUILD_ZIP_FILE}" ] || curl -sSf "${BUILD_ZIP_URL}" -o "${BUILD_ZIP_FILE}"
[ $? == 0 ] || exit 1
echo "Downloading ${CHECKSUM_URL}"
[ -f "${CHECKSUM_FILE}" ] || curl -sSf "${CHECKSUM_URL}" -o "${CHECKSUM_FILE}"
[ $? == 0 ] || exit 1
readonly sum="$(openssl dgst -sha384 ${BUILD_ZIP_FILE} | awk '{print $2}')"
readonly expected_sum="$(awk '{print $1}' < "${CHECKSUM_FILE}")"
if [ "${sum}" != "${expected_sum}" ]; then
    echo "SHA sum of ${BUILD_ZIP_FILE} does not match. Aborting."
    exit 1
fi

# extract
echo "Extracting ${BUILD_ZIP_FILE}"
[[ -d "${HAPI_DIR}" ]] || mkdir -p "${HAPI_DIR}"
cd "${HAPI_DIR}" && jar xvf "${BUILD_ZIP_FILE}"
[ $? == 0 ] || exit 1
