# The usage of resources in Solo

## Modify Taskfile.yml, task "network:deploy"

add "--values-file init-containers-values.yaml"

Example:

> solo:network:deploy:
> internal: true
> cmds:
> \- npm run solo-test -- network deploy --namespace "${SOLO\_NAMESPACE}" --node-aliases-unparsed {{.node\_identifiers}}  --solo-chart-version "${SOLO\_CHART\_VERSION}" --settings-txt settings.txt --log4j2-xml log4j2.xml --values-file init-containers-values.yaml --application-properties application.properties

## Provided examples for Consensus nodes:

* HashSphere/init-containers-values.yaml (HashSphere on Google Cloud, for 4-core/32Gb 7-node )
* Latitude/init-containers-values.yaml (Latitude, 128Gb, 10-node)

## and corresponding NetworkLoadGenerator templates:

* HashSphere/nlg-values.yaml
* Latitude/nlg-values.yaml
  Start as the following:

> helm upgrade --install nlg oci://swirldslabs.jfrog.io/load-generator-helm-release-local/network-load-generator --version 0.2.1 --values nlg-values.yaml -n solo-hashsphere1
