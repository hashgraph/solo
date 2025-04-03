#!/bin/bash
set -eo pipefail

function create_test_account ()
{
  echo "Create test account with solo network"
  cd solo
  DEPLOYMENT_NAME=$1
  echo "DEPLOYMENT_NAME=${DEPLOYMENT_NAME}"
  # create new account and extract account id
  npm run solo-test -- account create --deployment "${DEPLOYMENT_NAME}" --hbar-amount 100 --generate-ecdsa-key --set-alias > test.log
  export OPERATOR_ID=$(grep "accountId" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "OPERATOR_ID=${OPERATOR_ID}"
  rm test.log

  # get private key of the account
  npm run solo-test -- account get --deployment "${DEPLOYMENT_NAME}" --account-id "${OPERATOR_ID}" --private-key > test.log

  # retrieve the field privateKey but not privateKeyRaw
  export OPERATOR_KEY=$(grep "privateKey" test.log | grep -v "privateKeyRaw" | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  export CONTRACT_TEST_KEY_ONE=0x$(grep "privateKeyRaw" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "CONTRACT_TEST_KEY_ONE=${CONTRACT_TEST_KEY_ONE}"
  rm test.log

  npm run solo-test -- account create --deployment "${DEPLOYMENT_NAME}" --hbar-amount 100 --generate-ecdsa-key --set-alias > test.log
  export SECOND_KEY=$(grep "accountId" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  npm run solo-test -- account get --deployment "${DEPLOYMENT_NAME}" --account-id ${SECOND_KEY} --private-key > test.log
  export CONTRACT_TEST_KEY_TWO=0x$(grep "privateKeyRaw" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "CONTRACT_TEST_KEY_TWO=${CONTRACT_TEST_KEY_TWO}"
  rm test.log

  export CONTRACT_TEST_KEYS=${CONTRACT_TEST_KEY_ONE},$'\n'${CONTRACT_TEST_KEY_TWO}
  export HEDERA_NETWORK="local-node"

  echo "OPERATOR_KEY=${OPERATOR_KEY}"
  echo "HEDERA_NETWORK=${HEDERA_NETWORK}"
  echo "CONTRACT_TEST_KEYS=${CONTRACT_TEST_KEYS}"

  cd -
}
