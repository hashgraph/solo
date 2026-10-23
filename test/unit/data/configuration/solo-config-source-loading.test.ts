// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {container} from 'tsyringe-neo';

import {loadSoloConfigForTest, resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {SoloConfig} from '../../../../src/business/runtime-state/config/solo/solo-config.js';
import {type ConfigProvider} from '../../../../src/data/configuration/api/config-provider.js';

/**
 * Guards the wiring between `resources/config/*.yaml`, the `SOLO_*` environment overrides, and
 * `SoloConfig`. These sources are registered by a synchronous DI factory that cannot await them, so a
 * regression here is silent: every value simply falls back to its schema class default. `HelmChartSchema`
 * defaults to empty strings, while `TssSchema`'s defaults happen to duplicate `tss-config.yaml` — which
 * is why the TSS section masked the problem and the helm chart section exposed it.
 */
describe('Solo layered config source loading', (): void => {
  const environmentKeys: string[] = ['SOLO_HELM-CHART_NAME', 'SOLO_TSS_READY-MAX-ATTEMPTS'];
  let savedEnvironment: Map<string, string>;

  beforeEach((): void => {
    savedEnvironment = new Map<string, string>();
    for (const key of environmentKeys) {
      savedEnvironment.set(key, process.env[key]);
      delete process.env[key];
    }
    resetForTest();
  });

  afterEach((): void => {
    for (const [key, value] of savedEnvironment) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  function readConfig(): SoloConfig {
    return SoloConfig.getConfig(container.resolve<ConfigProvider>(InjectTokens.ConfigProvider));
  }

  it('sources helm chart identity from helm-chart-config.yaml once loaded', async (): Promise<void> => {
    await loadSoloConfigForTest();

    const config: SoloConfig = readConfig();
    expect(config.helmChart.name).to.equal('solo-deployment');
    expect(config.helmChart.release).to.equal('solo-deployment');
    expect(config.clusterSetupHelmChart.name).to.equal('solo-cluster-setup');
    expect(config.certManagerHelmChart.name).to.equal('solo-cert-manager');
  });

  it('sources tss values from tss-config.yaml once loaded', async (): Promise<void> => {
    await loadSoloConfigForTest();

    expect(readConfig().tss.readyMaxAttempts).to.equal(60);
  });

  it('lets a SOLO_* environment variable override a yaml-sourced value', async (): Promise<void> => {
    process.env['SOLO_HELM-CHART_NAME'] = 'override-chart';
    process.env['SOLO_TSS_READY-MAX-ATTEMPTS'] = '7';

    await loadSoloConfigForTest();

    const config: SoloConfig = readConfig();
    expect(config.helmChart.name).to.equal('override-chart');
    expect(config.tss.readyMaxAttempts).to.equal(7);
    // an override on one field must not disturb its siblings
    expect(config.helmChart.release).to.equal('solo-deployment');
  });
});
