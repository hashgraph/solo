#!/bin/bash
rm -f sql.log
POSTGRES_POD=$(kubectl get pods -n solo | grep fullstack-deployment-postgres-postgresql | cut -d ' ' -f1)
HEDERA_MIRROR_IMPORTER_DB_OWNER="$(kubectl exec -it $POSTGRES_POD -n solo -- /bin/bash -c printenv | grep HEDERA_MIRROR_IMPORTER_DB_OWNER= | cut -d '=' -f2 | tr -d '\n\r' )"
HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD="$(kubectl exec -it $POSTGRES_POD -n solo -- /bin/bash -c printenv | grep HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD= | cut -d '=' -f2 | tr -d '\n\r' )"
HEDERA_MIRROR_IMPORTER_DB_NAME="$(kubectl exec -it $POSTGRES_POD -n solo -- /bin/bash -c printenv | grep HEDERA_MIRROR_IMPORTER_DB_NAME= | cut -d '=' -f2 | tr -d '\n\r' )"

echo $HEDERA_MIRROR_IMPORTER_DB_OWNER >> sql.log
echo $HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD >> sql.log
echo $HEDERA_MIRROR_IMPORTER_DB_NAME >> sql.log

DIRNAME=$(dirname "$0")
file_path="$DIRNAME/../temp/importFeesAndExchangeRates.sql"
sql_query=$(cat "$file_path")
echo postgresql://$HEDERA_MIRROR_IMPORTER_DB_OWNER:$HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD@localhost:5432/$HEDERA_MIRROR_IMPORTER_DB_NAME >> sql.log


kubectl exec -it $(kubectl get pods -n solo | grep fullstack-deployment-postgres) -n solo -- psql "postgresql://$HEDERA_MIRROR_IMPORTER_DB_OWNER:$HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD@localhost:5432/$HEDERA_MIRROR_IMPORTER_DB_NAME" -c "$sql_query" >> /dev/null
