.ONESHELL: # Allows multiple shell commands in a single recipe

# ================================ VARIABLES ================================
NODE_OPTIONS=--experimental-vm-modules
MOCHA=mocha --recursive --file 'test/setup.mjs' --exit
NYC_REPORTERS=--reporter=text --reporter=html
JUNIT_REPORTER=--reporter mocha-junit-reporter
MOCHA_FILE=test-results/junit-report.xml # Path to save the JUnit report
DEFAULT_TIMEOUT=20000

# ================================ PHONY TARGETS ================================
.PHONY: test test-e2e-all test-e2e-standard test-e2e-mirror-node \
        test-e2e-node-pem-stop test-e2e-node-pem-kill test-e2e-node-local-build \
        test-e2e-node-add test-e2e-node-add-separate-commands test-e2e-node-update \
        test-e2e-node-delete test-e2e-node-delete-separate-commands \
        test-e2e-node-upgrade test-e2e-relay merge-clean merge-e2e \
        merge-unit report-coverage solo check format test-setup test-coverage

# ============================= UNIT TEST COMMANDS =============================
test:
	cross-env NODE_OPTIONS=$(NODE_OPTIONS) MOCHA_SUITE_NAME="Unit Tests" \
	nyc $(NYC_REPORTERS) --report-dir='coverage/unit' $(MOCHA) \
	'test/unit/**/*.mjs' --reporter spec --check-leaks --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/unit/**/*.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

# ============================ E2E TEST COMMANDS ================================
test-e2e-all:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E All Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e' $(MOCHA) \
	'test/e2e/**/*.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/**/*.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-standard:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Standard Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-standard' $(MOCHA) \
	'test/e2e/**/*.mjs' --ignore 'test/unit/**/*.mjs' \
	--ignore 'test/e2e/commands/mirror_node*.mjs' \
	--ignore 'test/e2e/commands/node*.mjs' \
	--ignore 'test/e2e/commands/separate_node*.mjs' \
	--ignore 'test/e2e/commands/relay*.mjs' --timeout 30000 \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/**/*.mjs' $(JUNIT_REPORTER) --timeout 30000

test-e2e-mirror-node:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Mirror Node Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-mirror-node' \
	$(MOCHA) 'test/e2e/commands/mirror_node.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/mirror_node.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-node-pem-stop:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Node PEM Stop Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-node-pem-stop' \
	$(MOCHA) 'test/e2e/commands/node_pem_stop.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/node_pem_stop.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-node-pem-kill:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Node PEM Kill Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-node-pem-kill' \
	$(MOCHA) 'test/e2e/commands/node_pem_kill.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/node_pem_kill.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-node-local-build:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Node Local Build Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-node-local-build' \
	$(MOCHA) 'test/e2e/commands/node_local*.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/node_local*.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-node-add:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Node Add Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-node-add' \
	$(MOCHA) 'test/e2e/commands/node_add*.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/node_add*.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-node-add-separate-commands:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Node Add - Separate Commands Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-node-add-separate-commands' \
	$(MOCHA) 'test/e2e/commands/separate_node_add*.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/separate_node_add*.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-node-update:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Node Update Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-node-update' \
	$(MOCHA) 'test/e2e/commands/node_update*.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/node_update*.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-node-delete:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Node Delete Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-node-delete' \
	$(MOCHA) 'test/e2e/commands/node_delete*.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/node_delete*.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-node-delete-separate-commands:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Node Delete - Separate Commands Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-node-delete-separate-commands' \
	$(MOCHA) 'test/e2e/commands/separate_node_delete*.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/separate_node_delete*.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-node-upgrade:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Node Upgrade Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-node-upgrade' \
	$(MOCHA) 'test/e2e/commands/node_upgrade*.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/node_upgrade*.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

test-e2e-relay:
	$(NODE_OPTIONS) MOCHA_SUITE_NAME='Mocha E2E Relay Tests' \
	nyc $(NYC_REPORTERS) --report-dir='coverage/e2e-relay' \
	$(MOCHA) 'test/e2e/commands/relay*.test.mjs' --timeout $(DEFAULT_TIMEOUT) \
	&& cross-env MOCHA_FILE=$(MOCHA_FILE) $(MOCHA) 'test/e2e/commands/relay*.test.mjs' $(JUNIT_REPORTER) --timeout $(DEFAULT_TIMEOUT)

# ============================= COVERAGE COMMANDS =============================
merge-clean: ## Clean and prepare for coverage merging
	rm -rf .nyc_output && mkdir .nyc_output && rm -rf coverage/lcov-report && \
	rm -rf coverage/solo && rm coverage/*.*

merge-e2e: ## Merge E2E test coverage
	nyc merge ./coverage/e2e/ .nyc_output/coverage.json

merge-unit: ## Merge unit test coverage
	nyc merge ./coverage/unit/ .nyc_output/coverage.json

report-coverage: merge-clean merge-unit merge-e2e ## Generate coverage report
	nyc report --reporter=json --reporter=html --reporter=lcov

# =============================== MISC COMMANDS ================================
solo: ## Run solo script
	$(NODE_OPTIONS) node --no-deprecation solo.mjs

check: ## Run linters and documentation checks
	remark . --quiet --frail && eslint . --ignore-pattern 'docs/*'; cd docs; \
	jsdoc -c jsdoc.conf.json

format: ## Format code using remark and eslint
	remark . --quiet --frail --output && eslint --fix . --ignore-pattern 'docs/*'

test-setup: ## Setup for E2E tests
	./test/e2e/setup-e2e.sh

test-coverage: test test-setup test-e2e-all report-coverage ## Run all tests and generate coverage report
