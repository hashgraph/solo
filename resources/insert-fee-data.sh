#!/bin/bash

POSTGRES_POD=$(kubectl get pods -n solo | grep fullstack-deployment-postgres | cut -d ' ' -f1)
HEDERA_MIRROR_IMPORTER_DB_OWNER=$(kubectl exec -it $POSTGRES_POD -n solo -- /bin/bash -c printenv | grep HEDERA_MIRROR_IMPORTER_DB_OWNER= | cut -d '=' -f2 | tr -d '\n\r' )
HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD=$(kubectl exec -it $POSTGRES_POD -n solo -- /bin/bash -c printenv | grep HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD= | cut -d '=' -f2 | tr -d '\n\r' )
HEDERA_MIRROR_IMPORTER_DB_NAME=$(kubectl exec -it $POSTGRES_POD -n solo -- /bin/bash -c printenv | grep HEDERA_MIRROR_IMPORTER_DB_NAME= | cut -d '=' -f2 | tr -d '\n\r' )


DIRNAME=$(dirname "$0")
file_path="$DIRNAME/../temp/importFeesAndExchangeRates.sql"
if [[ -f "$file_path" ]]; then
  # Read and print the contents of the file
  sql_query=$(cat "$file_path")
else
  echo "File not found: $file_path"
fi

#echo "$sql_query"

kubectl exec -it $(kubectl get pods -n solo | grep fullstack-deployment-postgres) -n solo -- psql postgresql://$HEDERA_MIRROR_IMPORTER_DB_OWNER:$HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD@localhost:5432/$HEDERA_MIRROR_IMPORTER_DB_NAME -c "$sql_query" >> /dev/null
