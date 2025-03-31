#!/bin/bash
# This script fetch the build.zip file and checksum file from builds.hedera.com and then extract it into HapiApp2 directory
# Usage extract-platform <release-version>
# e.g. extract-platform v0.42.5
set -o pipefail

readonly tag="${1}"
if [[ -z "${tag}" ]]; then
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
readonly LOG_FILE="${HAPI_DIR}/output/extract-platform.log"
echo "extract-platform.sh: begin................................" | tee -a ${LOG_FILE}

# download
echo "Downloading ${BUILD_ZIP_URL}" | tee -a ${LOG_FILE}
[[ -f "${BUILD_ZIP_FILE}" ]] || curl -sSf "${BUILD_ZIP_URL}" -o "${BUILD_ZIP_FILE}" | tee -a ${LOG_FILE}
[[ $? -ne 0 ]] && exit 1
echo "Downloading ${CHECKSUM_URL}" | tee -a ${LOG_FILE}
[[ -f "${CHECKSUM_FILE}" ]] || curl -sSf "${CHECKSUM_URL}" -o "${CHECKSUM_FILE}" | tee -a ${LOG_FILE}
[[ $? -ne 0 ]] && exit 1
cd ${HEDERA_USER_HOME_DIR}
sha384sum -c ${CHECKSUM_FILE} | tee -a ${LOG_FILE}
if [[ $? -ne 0 ]]; then
    echo "SHA sum of ${BUILD_ZIP_FILE} does not match. Aborting." | tee -a ${LOG_FILE}
    exit 1
fi

# extract
echo "Extracting ${BUILD_ZIP_FILE}" | tee -a ${LOG_FILE}
[[ -d "${HAPI_DIR}" ]] || mkdir -p "${HAPI_DIR}" | tee -a ${LOG_FILE}
echo "HAPI_DIR=${HAPI_DIR}" | tee -a ${LOG_FILE}
cd ${HAPI_DIR}
pwd | tee -a ${LOG_FILE}
ls -al | tee -a ${LOG_FILE}
#jar xvf "${BUILD_ZIP_FILE}" | tee -a ${LOG_FILE}

# Fix for M4 chips being unable to execute the jar command
dnf install unzip -y | tee -a ${LOG_FILE}
unzip -o "${BUILD_ZIP_FILE}" -d "${HAPI_DIR}" | tee -a ${LOG_FILE}

[[ $? -ne 0 ]] && echo "Failure occurred during decompress" && exit 1
echo "................................end: extract-platform.sh" | tee -a ${LOG_FILE}
exit 0
