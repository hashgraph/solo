# Force the use of bash as the shell for more features
SHELL=/bin/bash

# Setup variables
SCRIPTS_DIR=$(PWD)/scripts

# scripts
TELEMETRY_SCRIPT="telemetry.sh"

######################################### Telemetry - Start #################################
.PHONY: deploy-grafana-tempo
deploy-grafana-tempo:
	source "${SCRIPTS_DIR}/${TELEMETRY_SCRIPT}" && deploy_grafana_tempo && expose_grafana

.PHONY: destroy-grafana-tempo
destroy-grafana-tempo:
	source "${SCRIPTS_DIR}/${TELEMETRY_SCRIPT}" && unexpose_grafana && destroy_grafana_tempo

.PHONY: deploy-prometheus
deploy-prometheus:
	source "${SCRIPTS_DIR}/${TELEMETRY_SCRIPT}" && deploy-prometheus-operator
	-$(MAKE) wait-for-prometheus-operator
	source "${SCRIPTS_DIR}/${TELEMETRY_SCRIPT}" && deploy-prometheus && expose_prometheus

.PHONY: wait-for-prometheus-operator
wait-for-prometheus-operator:
	kubectl wait --for=condition=Ready pods -l app.kubernetes.io/name=prometheus-operator --timeout 300s --all-namespaces

.PHONY: destroy-prometheus
destroy-prometheus:
	source "${SCRIPTS_DIR}/${TELEMETRY_SCRIPT}" && destroy-prometheus-operator && unexpose_prometheus && destroy-prometheus

.PHONY: deploy-telemetry-stack
deploy-telemetry-stack: deploy-prometheus deploy-grafana-tempo

.PHONY: destroy-telemetry-stack
destroy-telemetry-stack:
	# Note: - prefix ensures errors are ignored and continues
	-${MAKE} destroy-prometheus
	-${MAKE} destroy-grafana-tempo
######################################### Telemetry - End #################################
