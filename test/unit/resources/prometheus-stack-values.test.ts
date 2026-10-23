// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import fs from 'node:fs';
import yaml from 'yaml';
import {PROMETHEUS_STACK_VALUES_FILE} from '../../../src/core/constants.js';

describe('prometheus-stack-values.yaml', (): void => {
  const namespaceSelectors: string[] = [
    'podMonitorNamespaceSelector',
    'ruleNamespaceSelector',
    'serviceMonitorNamespaceSelector',
  ];

  // The `any` field is absent from the schema of older Prometheus Operator CRDs, which makes server-side apply fail
  // when the CRDs already exist in the cluster; an empty selector already matches all namespaces.
  for (const selector of namespaceSelectors) {
    it(`should use an empty ${selector} that older CRD schemas accept`, (): void => {
      const values: {prometheus: {prometheusSpec: Record<string, object>}} = yaml.parse(
        fs.readFileSync(PROMETHEUS_STACK_VALUES_FILE, 'utf8'),
      );
      expect(values.prometheus.prometheusSpec[selector]).to.deep.equal({});
    });
  }
});
