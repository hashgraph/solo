#!/bin/bash
# This script creates a zip file so that it can be copied out of the pod for research purposes
set -o pipefail

readonly chipType="${2}"

readonly HAPI_DIR=/opt/hgcapp/services-hedera/HapiApp2.0
readonly DATA_DIR=data
readonly RESEARCH_ZIP=${HOSTNAME}.zip
readonly OUTPUT_DIR=output
readonly ZIP_FULLPATH=${HAPI_DIR}/${DATA_DIR}/${RESEARCH_ZIP}
readonly FILE_LIST=${HAPI_DIR}/support-zip-file-list.txt
readonly CONFIG_TXT=config.txt
readonly SETTINGS_TXT=settings.txt
readonly SETTINGS_USED_TXT=settingsUsed.txt
readonly ADDRESS_BOOK_DIR=${DATA_DIR}/saved/address_book
readonly CONFIG_DIR=${DATA_DIR}/config
readonly KEYS_DIR=${DATA_DIR}/keys
readonly UPGRADE_DIR=${DATA_DIR}/upgrade
readonly JOURNAL_CTL_LOG=${HAPI_DIR}/${OUTPUT_DIR}/journalctl.log
readonly LOG_FILE=${HAPI_DIR}/${OUTPUT_DIR}/support-zip.log
rm ${LOG_FILE} 2>/dev/null || true
rm ${FILE_LIST} 2>/dev/null || true

AddToFileList()
{
  if [[ -d "${1}" ]];then
    find ${1} -name "*" -printf '\047%p\047\n' | tee -a ${LOG_FILE} >>${FILE_LIST}
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
AddToFileList ${CONFIG_TXT}
AddToFileList ${SETTINGS_TXT}
AddToFileList ${SETTINGS_USED_TXT}
AddToFileList ${OUTPUT_DIR}
AddToFileList ${ADDRESS_BOOK_DIR}
AddToFileList ${CONFIG_DIR}
AddToFileList ${KEYS_DIR}
AddToFileList ${UPGRADE_DIR}
echo "creating zip file" | tee -a ${LOG_FILE}
if [[ "$chipType" =~ "M4" ]]; then
  echo "Using unzip for M4 chip" | tee -a ${LOG_FILE}
  zip -v "${ZIP_FULLPATH}" -@ < "${FILE_LIST}" >> ${LOG_FILE} 2>&1
  zip -v -u "${ZIP_FULLPATH}" "${OUTPUT_DIR}/support-zip.log" >> ${LOG_FILE} 2>&1
else
  jar cvfM "${ZIP_FULLPATH}" "@${FILE_LIST}" >> ${LOG_FILE} 2>&1
  jar -u -v --file="${ZIP_FULLPATH}" "${OUTPUT_DIR}/support-zip.log" >> ${LOG_FILE} 2>&1
fi
echo "...end support-zip.sh" | tee -a ${LOG_FILE}

exit 0
