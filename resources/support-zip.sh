#!/bin/bash
# This script creates a zip file so that it can be copied out of the pod for research purposes

readonly HAPI_DIR=/opt/hgcapp/services-hedera/HapiApp2.0
readonly RESEARCH_ZIP=${HOSTNAME}.zip
readonly ZIP_FULLPATH=${HAPI_DIR}/${RESEARCH_ZIP}
readonly FILE_LIST=${HAPI_DIR}/support-zip-file-list.txt
readonly CONFIG_TXT=config.txt
readonly SETTINGS_TXT=settings.txt
readonly SETTINGS_USED_TXT=settingsUsed.txt
readonly OUTPUT_DIR=output
readonly DATA_DIR=data
readonly ADDRESS_BOOK_DIR=${DATA_DIR}/saved/address_book
readonly CONFIG_DIR=${DATA_DIR}/config
readonly KEYS_DIR=${DATA_DIR}/keys
readonly UPGRADE_DIR=${DATA_DIR}/upgrade
readonly JOURNAL_CTL_LOG=${OUTPUT_DIR}/journalctl.log

AddToFileList()
{
  if [[ -d "${1}" ]];then
    find "${1}" -name "*" -printf '\047%p\047\n' >>${FILE_LIST}
    return
  fi

  if [[ -f "${1}" ]];then
    find . -maxdepth 1 -type f -name "${1}" -print >>${FILE_LIST}
  else
    echo "skipping: ${1}, file or directory not found"
  fi
}

cd ${HAPI_DIR}
echo -n > ${FILE_LIST}
journalctl > ${JOURNAL_CTL_LOG}
AddToFileList ${CONFIG_TXT}
AddToFileList ${SETTINGS_TXT}
AddToFileList ${SETTINGS_USED_TXT}
AddToFileList ${OUTPUT_DIR}
AddToFileList ${ADDRESS_BOOK_DIR}
AddToFileList ${CONFIG_DIR}
AddToFileList ${KEYS_DIR}
AddToFileList ${UPGRADE_DIR}
jar cvfM ${ZIP_FULLPATH} @${FILE_LIST}
