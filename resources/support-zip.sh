#!/bin/bash
# This script creates a zip file so that it can be copied out of the pod for research purposes
set -o pipefail

# Usage: support-zip.sh <useZip> [excludeSensitiveData]
#   excludeSensitiveData: when "true", omits TLS certificates, private keys,
#                         and the data/keys directory from the archive.
readonly useZip="${1}"
readonly excludeSensitiveData="${2:-false}"

readonly HAPI_DIR=/opt/hgcapp/services-hedera/HapiApp2.0
readonly DATA_DIR=data
readonly RESEARCH_ZIP=${HOSTNAME}-log-config.zip
readonly OUTPUT_DIR=output
readonly ZIP_FULLPATH=${HAPI_DIR}/${DATA_DIR}/${RESEARCH_ZIP}
readonly FILE_LIST=${HAPI_DIR}/support-zip-file-list.txt
readonly SETTINGS_TXT=settings.txt
readonly SETTINGS_USED_TXT=settingsUsed.txt
readonly HEDERA_CRT=hedera.crt
readonly HEDERA_KEY=hedera.key
readonly ADDRESS_BOOK_DIR=${DATA_DIR}/saved/address_book
readonly CONFIG_DIR=${DATA_DIR}/config
readonly KEYS_DIR=${DATA_DIR}/keys
# WRAPs proving key files are large and should not be bundled in diagnostics.
readonly WRAPS_KEYS_PATTERN="^${KEYS_DIR}/wraps[^/]*(/.*)?$"
readonly ONBOARD_DIR=${DATA_DIR}/onboard
readonly UPGRADE_DIR=${DATA_DIR}/upgrade
readonly STATS_DIR=${DATA_DIR}/stats
readonly JOURNAL_CTL_LOG=${HAPI_DIR}/${OUTPUT_DIR}/journalctl.log
readonly LOG_FILE=${HAPI_DIR}/${OUTPUT_DIR}/support-zip.log
# svlogd's actively-written log for the consensus node's supervised process;
# carries the tail end of stdout/stderr, including native crash signal output.
readonly NETWORK_NODE_CURRENT_LOG=/var/log/network-node/current
# JVM writes one hs_err_pid<PID>.log per native crash directly in the CWD.
readonly HS_ERR_LOG_GLOB="${HAPI_DIR}"/hs_err_*.log
rm ${LOG_FILE} 2>/dev/null || true
rm ${FILE_LIST} 2>/dev/null || true

# Copies crash-diagnostic artifacts that live outside the directories already
# bundled below into ${OUTPUT_DIR}, which is added to the file list as-is.
CollectCrashArtifacts()
{
  if [[ -f "${NETWORK_NODE_CURRENT_LOG}" ]]; then
    cp "${NETWORK_NODE_CURRENT_LOG}" "${HAPI_DIR}/${OUTPUT_DIR}/network-node-current.log" 2>/dev/null || true
  fi

  for hsErrLog in ${HS_ERR_LOG_GLOB}; do
    if [[ -f "${hsErrLog}" ]]; then
      cp "${hsErrLog}" "${HAPI_DIR}/${OUTPUT_DIR}/" 2>/dev/null || true
    fi
  done
}

AddToFileList()
{
  if [[ -d "${1}" ]];then
    # Do not add quote symbol since zip does not strip them out
    find "$1" -print | tee -a ${LOG_FILE} >>${FILE_LIST}
    return
  fi

  if [[ -L "${1}" ]];then
    echo "Adding symbolic link: ${1}" | tee -a ${LOG_FILE}
    find . -maxdepth 1 -type l -name ${1} -print  | tee -a ${LOG_FILE} >>${FILE_LIST}
  fi

  if [[ -f "${1}" ]];then
    find . -maxdepth 1 -type f -name ${1} -print  | tee -a ${LOG_FILE} >>${FILE_LIST}
  else
    echo "skipping: ${1}, file or directory not found" | tee -a ${LOG_FILE}
  fi
}

echo "support-zip.sh begin..." | tee -a ${LOG_FILE}
echo "cd ${HAPI_DIR}" | tee -a ${LOG_FILE}
cd ${HAPI_DIR}
pwd | tee -a ${LOG_FILE}
echo -n > ${FILE_LIST}
(journalctl > ${JOURNAL_CTL_LOG} 2>/dev/null) || true
CollectCrashArtifacts
AddToFileList ${SETTINGS_TXT}
AddToFileList ${SETTINGS_USED_TXT}
if [[ "${excludeSensitiveData}" != "true" ]]; then
  AddToFileList ${HEDERA_CRT}
  AddToFileList ${HEDERA_KEY}
fi
AddToFileList ${OUTPUT_DIR}
AddToFileList ${ADDRESS_BOOK_DIR}
AddToFileList ${CONFIG_DIR}
if [[ "${excludeSensitiveData}" != "true" ]]; then
  AddToFileList ${KEYS_DIR}
fi
AddToFileList ${ONBOARD_DIR}
AddToFileList ${UPGRADE_DIR}
AddToFileList ${STATS_DIR}

echo "creating zip file ${ZIP_FULLPATH}" | tee -a ${LOG_FILE}
awk -v pattern="${WRAPS_KEYS_PATTERN}" '$0 !~ pattern {print}' "${FILE_LIST}" > "${FILE_LIST}.filtered" && mv "${FILE_LIST}.filtered" "${FILE_LIST}"
sed -i '/^$/d' "${FILE_LIST}" # Removes empty lines
if [[ "$useZip" = "true" ]]; then
  echo "Using zip" | tee -a ${LOG_FILE}
  dnf install zip -y | tee -a ${LOG_FILE}
  # delete existing zip if it exists
  rm -f "${ZIP_FULLPATH}" 2>/dev/null || true
  zip -Xv "${ZIP_FULLPATH}" -@ < "${FILE_LIST}" >> ${LOG_FILE} 2>&1
  zip -Xv -u "${ZIP_FULLPATH}" "${OUTPUT_DIR}/support-zip.log" >> ${LOG_FILE} 2>&1
else
  jar cvfM "${ZIP_FULLPATH}" "@${FILE_LIST}" >> ${LOG_FILE} 2>&1
  jar -u -v --file="${ZIP_FULLPATH}" "${OUTPUT_DIR}/support-zip.log" >> ${LOG_FILE} 2>&1
fi
echo "...end support-zip.sh" | tee -a ${LOG_FILE}

exit 0
